import { getCurrentInstance, onBeforeUnmount, readonly, ref } from 'vue'
import type { KaldiRecognizer, Model } from 'vosk-browser'
import workletModuleUrl from './voskRecognizerProcessor.js?url&no-inline'

const DEFAULT_MODEL_URL =
  import.meta.env.VITE_VOSK_MODEL_URL?.trim() ||
  'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-pt-0.3.tar.gz'
const WORKLET_MODULE_URL = workletModuleUrl
const WORKLET_PROCESSOR_NAME = 'semantia-vosk-recognizer'
const PROCESSOR_BUFFER_SIZE = 4_096
const FINAL_RESULT_GRACE_MS = 1_000
const AUDIO_FRAME_TIMEOUT_MS = 4_000
const AUDIO_SIGNAL_THRESHOLD = 0.003
const VOSK_LOG_LEVEL_WARNING = -1

type AudioInputState = 'idle' | 'waiting' | 'silent' | 'receiving'
type StartupStage = 'model' | 'capture'

interface AudioContextWindow {
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
  AudioWorkletNode?: typeof AudioWorkletNode
}

interface AudioLevelMessage {
  action: 'audio-level'
  peak: number
  frames: number
}

export interface UseVoskTranscriptionOptions {
  modelUrl?: string
  onPartial: (text: string) => void
  onFinal: (text: string) => void
}

function getAudioContextCtor(): typeof AudioContext | null {
  const target = globalThis as AudioContextWindow
  return target.AudioContext ?? target.webkitAudioContext ?? null
}

function getAudioWorkletNodeCtor(): typeof AudioWorkletNode | null {
  const target = globalThis as AudioContextWindow
  return target.AudioWorkletNode ?? null
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

class StartupFailure {
  readonly stage: StartupStage
  readonly cause: unknown

  constructor(stage: StartupStage, cause: unknown) {
    this.stage = stage
    this.cause = cause
  }
}

function classifyCaptureError(cause: unknown) {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'not-allowed'
  return 'audio-capture'
}

function classifyStartupError(failure: unknown) {
  if (!(failure instanceof StartupFailure)) return 'recognition-failed'
  return failure.stage === 'model'
    ? 'model-load-failed'
    : classifyCaptureError(failure.cause)
}

function isAudioLevelMessage(value: unknown): value is AudioLevelMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<AudioLevelMessage>
  return (
    message.action === 'audio-level' &&
    typeof message.peak === 'number' &&
    Number.isFinite(message.peak) &&
    typeof message.frames === 'number' &&
    message.frames > 0
  )
}

export function useVoskTranscription(options: UseVoskTranscriptionOptions) {
  const AudioContextCtor = getAudioContextCtor()
  const supported =
    AudioContextCtor !== null &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  const listening = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const inputState = ref<AudioInputState>('idle')
  const audioLevel = ref(0)

  let model: Model | null = null
  let modelPromise: Promise<Model> | null = null
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let worklet: AudioWorkletNode | null = null
  let modelPort: MessagePort | null = null
  let silentGain: GainNode | null = null
  let recognizer: KaldiRecognizer | null = null
  let audioFrameTimeout: number | null = null
  let startGeneration = 0
  let disposed = false

  function ensureModel() {
    if (model) return Promise.resolve(model)
    if (!modelPromise) {
      modelPromise = import('vosk-browser')
        .then(({ createModel }) =>
          createModel(options.modelUrl ?? DEFAULT_MODEL_URL, VOSK_LOG_LEVEL_WARNING),
        )
        .then((loadedModel) => {
          model = loadedModel
          return loadedModel
        })
        .catch((cause) => {
          modelPromise = null
          throw cause
        })
    }
    return modelPromise
  }

  function clearAudioFrameTimeout() {
    if (audioFrameTimeout !== null) window.clearTimeout(audioFrameTimeout)
    audioFrameTimeout = null
  }

  function reportAudioLevel(peak: number) {
    clearAudioFrameTimeout()
    const normalizedPeak = Math.max(0, Math.min(1, peak))
    audioLevel.value = normalizedPeak
    inputState.value =
      normalizedPeak >= AUDIO_SIGNAL_THRESHOLD ? 'receiving' : 'silent'
  }

  function waitForAudioFrames() {
    clearAudioFrameTimeout()
    inputState.value = 'waiting'
    audioLevel.value = 0
    audioFrameTimeout = window.setTimeout(() => {
      if (!listening.value || inputState.value !== 'waiting') return
      error.value = 'audio-processing-stalled'
      stopCapture(false)
    }, AUDIO_FRAME_TIMEOUT_MS)
  }

  function removeRecognizerAfterFinal(activeRecognizer: KaldiRecognizer) {
    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      activeRecognizer.remove()
    }
    activeRecognizer.on('result', remove)
    window.setTimeout(remove, FINAL_RESULT_GRACE_MS)
  }

  function disconnectAudioGraph() {
    clearAudioFrameTimeout()
    if (processor) processor.onaudioprocess = null
    if (worklet) {
      worklet.onprocessorerror = null
      worklet.port.postMessage({ action: 'dispose' })
      worklet.port.close()
    }
    modelPort?.close()
    try {
      source?.disconnect()
      processor?.disconnect()
      worklet?.disconnect()
      silentGain?.disconnect()
    } catch {
      // O grafo pode já ter sido desconectado pelo navegador.
    }
    source = null
    processor = null
    worklet = null
    modelPort = null
    silentGain = null
    inputState.value = 'idle'
    audioLevel.value = 0
  }

  function stopCapture(finalizeRecognizer: boolean) {
    startGeneration += 1
    loading.value = false
    listening.value = false
    disconnectAudioGraph()
    stopMediaStream(stream)
    stream = null

    const activeRecognizer = recognizer
    recognizer = null
    if (activeRecognizer) {
      if (finalizeRecognizer) {
        removeRecognizerAfterFinal(activeRecognizer)
        activeRecognizer.retrieveFinalResult()
      } else {
        activeRecognizer.remove()
      }
    }

    const activeContext = context
    context = null
    if (activeContext && activeContext.state !== 'closed') void activeContext.close()
  }

  function stop() {
    stopCapture(true)
  }

  function handleRecognitionFailure(activeRecognizer: KaldiRecognizer) {
    if (recognizer !== activeRecognizer) return
    error.value = 'recognition-failed'
    stopCapture(false)
  }

  async function connectWorklet(
    activeContext: AudioContext,
    loadedModel: Model,
    activeRecognizer: KaldiRecognizer,
  ) {
    const AudioWorkletNodeCtor = getAudioWorkletNodeCtor()
    if (!AudioWorkletNodeCtor || !activeContext.audioWorklet) return false

    try {
      await activeContext.audioWorklet.addModule(WORKLET_MODULE_URL)
      const channel = new MessageChannel()
      modelPort = channel.port1
      loadedModel.registerPort(channel.port1)
      const activeWorklet = new AudioWorkletNodeCtor(
        activeContext,
        WORKLET_PROCESSOR_NAME,
        {
          channelCount: 1,
          channelCountMode: 'explicit',
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        },
      )
      worklet = activeWorklet
      activeWorklet.port.onmessage = (event) => {
        if (worklet !== activeWorklet || !isAudioLevelMessage(event.data)) return
        reportAudioLevel(event.data.peak)
      }
      activeWorklet.onprocessorerror = () => handleRecognitionFailure(activeRecognizer)
      activeWorklet.port.postMessage(
        { action: 'init', recognizerId: activeRecognizer.id },
        [channel.port2],
      )
      activeWorklet.connect(silentGain as GainNode)
      source?.connect(activeWorklet)
      return true
    } catch {
      worklet?.disconnect()
      worklet?.port.close()
      modelPort?.close()
      worklet = null
      modelPort = null
      return false
    }
  }

  function connectLegacyProcessor(
    activeContext: AudioContext,
    activeRecognizer: KaldiRecognizer,
  ) {
    const activeProcessor = activeContext.createScriptProcessor(
      PROCESSOR_BUFFER_SIZE,
      1,
      1,
    )
    processor = activeProcessor
    activeProcessor.onaudioprocess = (event) => {
      try {
        const samples = event.inputBuffer.getChannelData(0)
        let peak = 0
        for (let index = 0; index < samples.length; index += 1) {
          peak = Math.max(peak, Math.abs(samples[index]))
        }
        reportAudioLevel(peak)
        activeRecognizer.acceptWaveform(event.inputBuffer)
      } catch {
        handleRecognitionFailure(activeRecognizer)
      }
    }
    activeProcessor.connect(silentGain as GainNode)
    source?.connect(activeProcessor)
  }

  async function resumeAudioContext(activeContext: AudioContext) {
    if (activeContext.state !== 'suspended') return
    try {
      await activeContext.resume()
    } catch (cause) {
      throw new StartupFailure('capture', cause)
    }
  }

  async function start() {
    if (listening.value || loading.value) return
    if (!supported || !AudioContextCtor) {
      error.value = 'unsupported'
      return
    }

    const generation = ++startGeneration
    loading.value = true
    error.value = null
    inputState.value = 'waiting'
    const pendingContext = new AudioContextCtor()
    context = pendingContext

    try {
      await resumeAudioContext(pendingContext)
      const [modelResult, captureResult] = await Promise.allSettled([
        ensureModel(),
        navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }),
      ])
      if (modelResult.status === 'rejected') {
        if (captureResult.status === 'fulfilled') stopMediaStream(captureResult.value)
        throw new StartupFailure('model', modelResult.reason)
      }
      if (captureResult.status === 'rejected') {
        throw new StartupFailure('capture', captureResult.reason)
      }
      const loadedModel = modelResult.value
      const capturedStream = captureResult.value

      if (disposed || generation !== startGeneration) {
        stopMediaStream(capturedStream)
        if (pendingContext.state !== 'closed') await pendingContext.close()
        return
      }

      stream = capturedStream
      const activeRecognizer = new loadedModel.KaldiRecognizer(pendingContext.sampleRate)
      activeRecognizer.setWords(true)
      activeRecognizer.on('partialresult', (message) => {
        const text =
          'result' in message && 'partial' in message.result
            ? message.result.partial.trim()
            : ''
        if (text) {
          inputState.value = 'receiving'
          options.onPartial(text)
        }
      })
      activeRecognizer.on('result', (message) => {
        const text =
          'result' in message && 'text' in message.result
            ? message.result.text.trim()
            : ''
        if (text) {
          inputState.value = 'receiving'
          options.onFinal(text)
        }
      })
      activeRecognizer.on('error', () => handleRecognitionFailure(activeRecognizer))
      recognizer = activeRecognizer

      source = pendingContext.createMediaStreamSource(capturedStream)
      silentGain = pendingContext.createGain()
      silentGain.gain.value = 0
      silentGain.connect(pendingContext.destination)
      const workletConnected = await connectWorklet(
        pendingContext,
        loadedModel,
        activeRecognizer,
      )
      if (!workletConnected) connectLegacyProcessor(pendingContext, activeRecognizer)

      await resumeAudioContext(pendingContext)
      if (pendingContext.state !== 'running') {
        throw new StartupFailure('capture', new Error('AudioContext did not start'))
      }
      listening.value = true
      if (inputState.value === 'waiting') waitForAudioFrames()
    } catch (cause) {
      if (generation === startGeneration) error.value = classifyStartupError(cause)
      disconnectAudioGraph()
      stopMediaStream(stream)
      stream = null
      recognizer?.remove()
      recognizer = null
      if (pendingContext.state !== 'closed') await pendingContext.close()
      if (context === pendingContext) context = null
    } finally {
      if (generation === startGeneration) loading.value = false
    }
  }

  function dispose() {
    disposed = true
    stopCapture(false)
    if (model) {
      model.terminate()
      model = null
      modelPromise = null
      return
    }
    void modelPromise?.then((loadedModel) => loadedModel.terminate()).catch(() => undefined)
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
  }
}
