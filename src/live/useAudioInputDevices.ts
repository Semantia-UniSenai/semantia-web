import { getCurrentInstance, onBeforeUnmount, readonly, ref } from 'vue'

export interface AudioInputDevice {
  deviceId: string
  groupId: string
  label: string
}

export type AudioInputError =
  | 'not-allowed'
  | 'not-found'
  | 'not-readable'
  | 'overconstrained'
  | 'unavailable'
  | 'unknown'

export type MicrophoneTestState =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'working'
  | 'error'

const STORAGE_KEY = 'semantia.audio-input-device-id'
const SIGNAL_THRESHOLD = 0.04

function storedDeviceId() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'default'
  } catch {
    return 'default'
  }
}

function persistDeviceId(deviceId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, deviceId)
  } catch {
    // A seleção continua válida durante a sessão quando storage está bloqueado.
  }
}

function classifyMediaError(cause: unknown): AudioInputError {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'not-found'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'not-readable'
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'overconstrained'
  }
  if (name === 'NotSupportedError') return 'unavailable'
  return 'unknown'
}

export function buildAudioConstraints(deviceId: string | null): MediaTrackConstraints {
  return {
    ...(deviceId && deviceId !== 'default'
      ? { deviceId: { exact: deviceId } }
      : {}),
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }
}

export function useAudioInputDevices() {
  const mediaDevices = navigator.mediaDevices
  const supported = Boolean(
    typeof mediaDevices?.getUserMedia === 'function' &&
      typeof mediaDevices?.enumerateDevices === 'function',
  )
  const devices = ref<AudioInputDevice[]>([])
  const selectedDeviceId = ref(storedDeviceId())
  const loading = ref(false)
  const permissionGranted = ref(false)
  const error = ref<AudioInputError | null>(null)
  const testState = ref<MicrophoneTestState>('idle')
  const testLevel = ref(0)
  const testMonitorEnabled = ref(false)

  let testStream: MediaStream | null = null
  let testContext: AudioContext | null = null
  let testSource: MediaStreamAudioSourceNode | null = null
  let testAnalyser: AnalyserNode | null = null
  let animationFrameId: number | null = null
  let testGeneration = 0

  function normalizeSelection(nextDevices: AudioInputDevice[]) {
    if (nextDevices.some((item) => item.deviceId === selectedDeviceId.value)) return
    const fallback =
      nextDevices.find((item) => item.deviceId === 'default') ?? nextDevices[0]
    selectedDeviceId.value = fallback?.deviceId ?? 'default'
    persistDeviceId(selectedDeviceId.value)
  }

  async function refresh(requestPermission = false) {
    if (!supported) {
      error.value = 'unavailable'
      return
    }

    loading.value = true
    error.value = null
    let permissionStream: MediaStream | null = null
    try {
      if (requestPermission) {
        permissionStream = await mediaDevices.getUserMedia({ audio: true })
        permissionGranted.value = true
      }
      const available = await mediaDevices.enumerateDevices()
      const inputs = available.filter((item) => item.kind === 'audioinput')
      devices.value = inputs.map((item, index) => ({
        deviceId: item.deviceId,
        groupId: item.groupId,
        label:
          item.label ||
          (item.deviceId === 'default' ? 'Microfone padrão' : `Microfone ${index + 1}`),
      }))
      normalizeSelection(devices.value)
    } catch (cause) {
      error.value = classifyMediaError(cause)
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop())
      loading.value = false
    }
  }

  async function stopTest() {
    testGeneration += 1
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    testSource?.disconnect()
    testAnalyser?.disconnect()
    testStream?.getTracks().forEach((track) => track.stop())
    const context = testContext
    testSource = null
    testAnalyser = null
    testStream = null
    testContext = null
    testLevel.value = 0
    testMonitorEnabled.value = false
    testState.value = 'idle'
    if (context && context.state !== 'closed') await context.close()
  }

  async function startTest(monitorLocally = false) {
    await stopTest()
    const generation = testGeneration
    if (!supported) {
      error.value = 'unavailable'
      testState.value = 'error'
      return
    }

    error.value = null
    testState.value = 'requesting'
    let pendingStream: MediaStream | null = null
    let pendingContext: AudioContext | null = null
    let pendingSource: MediaStreamAudioSourceNode | null = null
    let pendingAnalyser: AnalyserNode | null = null
    try {
      pendingStream = await mediaDevices.getUserMedia({
        audio: buildAudioConstraints(selectedDeviceId.value),
      })
      if (generation !== testGeneration) {
        pendingStream.getTracks().forEach((track) => track.stop())
        return
      }

      const AudioContextCtor =
        globalThis.AudioContext ??
        (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!AudioContextCtor) throw new DOMException('Web Audio indisponível', 'NotSupportedError')

      const context = new AudioContextCtor()
      pendingContext = context
      const source = context.createMediaStreamSource(pendingStream)
      pendingSource = source
      const analyser = context.createAnalyser()
      pendingAnalyser = analyser
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)
      if (monitorLocally) analyser.connect(context.destination)
      if (context.state === 'suspended') await context.resume()

      testStream = pendingStream
      testContext = context
      testSource = source
      testAnalyser = analyser
      testMonitorEnabled.value = monitorLocally
      permissionGranted.value = true
      testState.value = 'listening'
      const samples = new Uint8Array(analyser.fftSize)

      const measure = () => {
        if (generation !== testGeneration || testAnalyser !== analyser) return
        analyser.getByteTimeDomainData(samples)
        let sumSquares = 0
        for (const sample of samples) {
          const normalized = (sample - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / samples.length)
        testLevel.value = Math.min(1, rms * 3.2)
        if (testLevel.value >= SIGNAL_THRESHOLD) testState.value = 'working'
        animationFrameId = requestAnimationFrame(measure)
      }
      animationFrameId = requestAnimationFrame(measure)
    } catch (cause) {
      pendingSource?.disconnect()
      pendingAnalyser?.disconnect()
      pendingStream?.getTracks().forEach((track) => track.stop())
      if (pendingContext && pendingContext.state !== 'closed') {
        await pendingContext.close().catch(() => undefined)
      }
      if (testStream === pendingStream) {
        testStream = null
        testContext = null
        testSource = null
        testAnalyser = null
        testLevel.value = 0
      }
      if (generation !== testGeneration) return
      error.value = classifyMediaError(cause)
      testState.value = 'error'
    }
  }

  async function selectDevice(deviceId: string) {
    if (deviceId === selectedDeviceId.value) return
    const restartTest =
      testState.value === 'requesting' ||
      testState.value === 'listening' ||
      testState.value === 'working'
    const restartMonitor = testMonitorEnabled.value
    if (restartTest) await stopTest()
    selectedDeviceId.value = deviceId
    persistDeviceId(deviceId)
    error.value = null
    if (restartTest) await startTest(restartMonitor)
  }

  const handleDeviceChange = async () => {
    await refresh(false)
  }

  if (supported) mediaDevices.addEventListener('devicechange', handleDeviceChange)
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      mediaDevices?.removeEventListener('devicechange', handleDeviceChange)
      void stopTest()
    })
  }

  return {
    supported,
    devices: readonly(devices),
    selectedDeviceId: readonly(selectedDeviceId),
    loading: readonly(loading),
    permissionGranted: readonly(permissionGranted),
    error: readonly(error),
    testState: readonly(testState),
    testLevel: readonly(testLevel),
    testMonitorEnabled: readonly(testMonitorEnabled),
    refresh,
    selectDevice,
    startTest,
    stopTest,
  }
}

export type UseAudioInputDevices = ReturnType<typeof useAudioInputDevices>
