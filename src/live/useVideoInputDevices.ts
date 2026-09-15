import {
  getCurrentInstance,
  onBeforeUnmount,
  readonly,
  ref,
  shallowReadonly,
  shallowRef,
} from 'vue'

export interface VideoInputDevice {
  deviceId: string
  groupId: string
  label: string
}

export type VideoInputError =
  | 'not-allowed'
  | 'not-found'
  | 'not-readable'
  | 'overconstrained'
  | 'unavailable'
  | 'unknown'

export type CameraTestState = 'idle' | 'requesting' | 'previewing' | 'error'

const STORAGE_KEY = 'semantia.video-input-device-id'

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

function classifyMediaError(cause: unknown): VideoInputError {
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

export function useVideoInputDevices() {
  const mediaDevices = navigator.mediaDevices
  const supported = Boolean(
    typeof mediaDevices?.getUserMedia === 'function' &&
      typeof mediaDevices?.enumerateDevices === 'function',
  )
  const devices = ref<VideoInputDevice[]>([])
  const selectedDeviceId = ref(storedDeviceId())
  const loading = ref(false)
  const error = ref<VideoInputError | null>(null)
  const testState = ref<CameraTestState>('idle')
  const testStream = shallowRef<MediaStream | null>(null)
  let testGeneration = 0

  function normalizeSelection(nextDevices: VideoInputDevice[]) {
    if (nextDevices.some((item) => item.deviceId === selectedDeviceId.value)) return
    selectedDeviceId.value =
      nextDevices.find((item) => item.deviceId === 'default')?.deviceId ??
      nextDevices[0]?.deviceId ??
      'default'
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
        permissionStream = await mediaDevices.getUserMedia({ video: true })
      }
      const available = await mediaDevices.enumerateDevices()
      const inputs = available.filter((item) => item.kind === 'videoinput')
      devices.value = inputs.map((item, index) => ({
        deviceId: item.deviceId,
        groupId: item.groupId,
        label:
          item.label ||
          (item.deviceId === 'default' ? 'Câmera padrão' : `Câmera ${index + 1}`),
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
    testStream.value?.getTracks().forEach((track) => track.stop())
    testStream.value = null
    testState.value = 'idle'
  }

  async function startTest() {
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
    try {
      pendingStream = await mediaDevices.getUserMedia({
        audio: false,
        video:
          selectedDeviceId.value === 'default'
            ? {}
            : { deviceId: { ideal: selectedDeviceId.value } },
      })
      if (generation !== testGeneration) {
        pendingStream.getTracks().forEach((track) => track.stop())
        return
      }
      testStream.value = pendingStream
      testState.value = 'previewing'
      await refresh(false)
    } catch (cause) {
      pendingStream?.getTracks().forEach((track) => track.stop())
      if (generation !== testGeneration) return
      error.value = classifyMediaError(cause)
      testState.value = 'error'
    }
  }

  async function selectDevice(deviceId: string) {
    if (deviceId === selectedDeviceId.value) return
    const restartTest = testState.value === 'requesting' || testState.value === 'previewing'
    if (restartTest) await stopTest()
    selectedDeviceId.value = deviceId
    persistDeviceId(deviceId)
    error.value = null
    if (restartTest) await startTest()
  }

  const handleDeviceChange = async () => refresh(false)
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
    error: readonly(error),
    testState: readonly(testState),
    testStream: shallowReadonly(testStream),
    refresh,
    selectDevice,
    startTest,
    stopTest,
  }
}

export type UseVideoInputDevices = ReturnType<typeof useVideoInputDevices>
