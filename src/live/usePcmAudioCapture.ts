import { getCurrentInstance, onBeforeUnmount, readonly, ref } from 'vue'
import { buildAudioConstraints } from './useAudioInputDevices'
import workletModuleUrl from './pcmCaptureProcessor.js?url&no-inline'

const WORKLET_PROCESSOR_NAME = 'semantia-pcm-capture'
const PROCESSOR_BUFFER_SIZE = 4_096
const AUDIO_FRAME_TIMEOUT_MS = 4_000

type AudioInputState = 'idle' | 'waiting' | 'receiving'

interface AudioContextWindow {
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
  AudioWorkletNode?: typeof AudioWorkletNode
}

interface AudioChunkMessage {
  action: 'audio-chunk'
  samples: Float32Array
  sampleRate: number
  peak: number
}

export interface UsePcmAudioCaptureOptions {
  onAudioChunk: (samples: Float32Array, sampleRate: number) => void
}

function getAudioContextCtor(): typeof AudioContext | null {
  const target = globalThis as AudioContextWindow
  return target.AudioContext ?? target.webkitAudioContext ?? null
}

function getAudioWorkletNodeCtor(): typeof AudioWorkletNode | null {
  const target = globalThis as AudioContextWindow
  return target.AudioWorkletNode ?? null
}

function classifyCaptureError(cause: unknown) {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'not-found'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'not-readable'
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'overconstrained'
  }
  if (name === 'NotSupportedError') return 'unavailable'
  return 'audio-capture'
}

function isAudioChunkMessage(value: unknown): value is AudioChunkMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<AudioChunkMessage>
  return (
    message.action === 'audio-chunk' &&
    message.samples instanceof Float32Array &&
    typeof message.sampleRate === 'number' &&
    Number.isFinite(message.sampleRate) &&
    message.sampleRate > 0 &&
    typeof message.peak === 'number' &&
    Number.isFinite(message.peak)
  )
}

export function usePcmAudioCapture(options: UsePcmAudioCaptureOptions) {
  const AudioContextCtor = getAudioContextCtor()
  const supported = Boolean(
    AudioContextCtor &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function',
  )
  const listening = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const inputState = ref<AudioInputState>('idle')
  const audioLevel = ref(0)

  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let worklet: AudioWorkletNode | null = null
  let silentGain: GainNode | null = null
  let audioFrameTimeout: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let disposed = false

  function clearAudioFrameTimeout() {
    if (audioFrameTimeout) clearTimeout(audioFrameTimeout)
    audioFrameTimeout = null
  }

  function armAudioFrameTimeout(activeGeneration: number) {
    clearAudioFrameTimeout()
    audioFrameTimeout = setTimeout(() => {
      if (generation !== activeGeneration || !listening.value) return
      error.value = 'audio-processing-stalled'
      stop()
    }, AUDIO_FRAME_TIMEOUT_MS)
  }

  function reportChunk(
    samples: Float32Array,
    sampleRate: number,
    peak: number,
    activeGeneration: number,
  ) {
    if (generation !== activeGeneration || !listening.value) return
    audioLevel.value = Math.max(0, Math.min(1, peak))
    inputState.value = 'receiving'
    options.onAudioChunk(samples, sampleRate)
    armAudioFrameTimeout(activeGeneration)
  }

  function disconnectGraph() {
    clearAudioFrameTimeout()
    if (processor) processor.onaudioprocess = null
    if (worklet) {
      worklet.onprocessorerror = null
      worklet.port.postMessage({ action: 'dispose' })
      worklet.port.close()
    }
    try {
      source?.disconnect()
      processor?.disconnect()
      worklet?.disconnect()
      silentGain?.disconnect()
    } catch {
      // O navegador pode já ter desconectado o grafo.
    }
    source = null
    processor = null
    worklet = null
    silentGain = null
  }

  function stop() {
    generation += 1
    loading.value = false
    listening.value = false
    disconnectGraph()
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    const activeContext = context
    context = null
    if (activeContext && activeContext.state !== 'closed') {
      void activeContext.close().catch(() => undefined)
    }
    inputState.value = 'idle'
    audioLevel.value = 0
  }

  function connectLegacyProcessor(activeGeneration: number) {
    if (!context || !source || !silentGain) return
    const activeProcessor = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
    processor = activeProcessor
    activeProcessor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      const samples = input.slice()
      let peak = 0
      for (let index = 0; index < samples.length; index += 1) {
        peak = Math.max(peak, Math.abs(samples[index] ?? 0))
      }
      reportChunk(samples, context?.sampleRate ?? 0, peak, activeGeneration)
    }
    source.connect(activeProcessor)
    activeProcessor.connect(silentGain)
  }

  async function connectWorklet(activeGeneration: number) {
    if (!context || !source || !silentGain) return false
    const AudioWorkletNodeCtor = getAudioWorkletNodeCtor()
    if (!AudioWorkletNodeCtor || !context.audioWorklet) return false
    try {
      await context.audioWorklet.addModule(workletModuleUrl)
      if (generation !== activeGeneration || !context) return false
      const activeWorklet = new AudioWorkletNodeCtor(context, WORKLET_PROCESSOR_NAME, {
        channelCount: 1,
        channelCountMode: 'explicit',
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      })
      worklet = activeWorklet
      activeWorklet.port.onmessage = (event) => {
        if (!isAudioChunkMessage(event.data)) return
        reportChunk(
          event.data.samples,
          event.data.sampleRate,
          event.data.peak,
          activeGeneration,
        )
      }
      activeWorklet.onprocessorerror = () => {
        if (generation !== activeGeneration) return
        error.value = 'audio-processing-failed'
        stop()
      }
      source.connect(activeWorklet)
      activeWorklet.connect(silentGain)
      return true
    } catch {
      worklet?.disconnect()
      worklet?.port.close()
      worklet = null
      return false
    }
  }

  async function start(deviceId = 'default') {
    stop()
    if (disposed || !supported || !AudioContextCtor) {
      error.value = 'unavailable'
      return false
    }
    const activeGeneration = generation
    loading.value = true
    error.value = null
    inputState.value = 'waiting'
    try {
      const activeContext = new AudioContextCtor()
      context = activeContext
      const activeStream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(deviceId),
      })
      if (generation !== activeGeneration || disposed) {
        activeStream.getTracks().forEach((track) => track.stop())
        return false
      }
      stream = activeStream
      source = activeContext.createMediaStreamSource(activeStream)
      silentGain = activeContext.createGain()
      silentGain.gain.value = 0
      silentGain.connect(activeContext.destination)
      if (activeContext.state === 'suspended') await activeContext.resume()
      const connected = await connectWorklet(activeGeneration)
      if (!connected) connectLegacyProcessor(activeGeneration)
      if (generation !== activeGeneration || disposed) return false
      listening.value = true
      loading.value = false
      inputState.value = 'waiting'
      armAudioFrameTimeout(activeGeneration)
      return true
    } catch (cause) {
      if (generation !== activeGeneration) return false
      error.value = classifyCaptureError(cause)
      stop()
      error.value = classifyCaptureError(cause)
      return false
    }
  }

  function dispose() {
    if (disposed) return
    stop()
    disposed = true
  }

  if (getCurrentInstance()) onBeforeUnmount(dispose)

  return {
    supported,
    listening: readonly(listening),
    loading: readonly(loading),
    error: readonly(error),
    inputState: readonly(inputState),
    audioLevel: readonly(audioLevel),
    start,
    stop,
    dispose,
  }
}
