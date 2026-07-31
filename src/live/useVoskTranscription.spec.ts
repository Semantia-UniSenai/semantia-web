import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoskTranscription } from './useVoskTranscription'

const { createModel } = vi.hoisted(() => ({ createModel: vi.fn() }))

vi.mock('vosk-browser', () => ({ createModel }))

const stopTrack = vi.fn()
const getUserMedia = vi.fn()
const source = { connect: vi.fn(), disconnect: vi.fn() }
const processor = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  onaudioprocess: null as ((event: { inputBuffer: AudioBuffer }) => void) | null,
}
const silentGain = {
  gain: { value: 1 },
  connect: vi.fn(),
  disconnect: vi.fn(),
}
const contextClose = vi.fn().mockResolvedValue(undefined)
let audioContextState: AudioContextState = 'running'
const contextResume = vi.fn().mockImplementation(async () => {
  audioContextState = 'running'
})

const audioWorkletAddModule = vi.fn().mockResolvedValue(undefined)
const workletConnect = vi.fn()
const workletDisconnect = vi.fn()
const workletPortPostMessage = vi.fn()
const workletPortClose = vi.fn()
let workletMessageHandler: ((event: MessageEvent) => void) | null = null
let latestWorkletNode: FakeAudioWorkletNode | null = null

class FakeAudioWorkletNode {
  port = {
    postMessage: workletPortPostMessage,
    close: workletPortClose,
    set onmessage(listener: ((event: MessageEvent) => void) | null) {
      workletMessageHandler = listener
    },
    get onmessage() {
      return workletMessageHandler
    },
  }
  connect = workletConnect
  disconnect = workletDisconnect
  onprocessorerror: ((event: Event) => void) | null = null

  constructor() {
    latestWorkletNode = this
  }
}

const modelPortClose = vi.fn()
const processorPortClose = vi.fn()
const modelPort = { close: modelPortClose }
const processorPort = { close: processorPortClose }

class FakeMessageChannel {
  port1 = modelPort
  port2 = processorPort
}

class FakeAudioContext {
  sampleRate = 48_000
  get state(): AudioContextState {
    return audioContextState
  }
  destination = {}
  audioWorklet = { addModule: audioWorkletAddModule }
  createMediaStreamSource = vi.fn(() => source)
  createScriptProcessor = vi.fn(() => processor)
  createGain = vi.fn(() => silentGain)
  close = contextClose
  resume = contextResume
}

const recognizerListeners = new Map<string, (message: unknown) => void>()
const recognizer = {
  id: 'recognizer-1',
  on: vi.fn((event: string, listener: (message: unknown) => void) => {
    recognizerListeners.set(event, listener)
  }),
  setWords: vi.fn(),
  acceptWaveform: vi.fn(),
  retrieveFinalResult: vi.fn(),
  remove: vi.fn(),
}
const KaldiRecognizer = vi.fn(function () {
  return recognizer
})
const model = {
  KaldiRecognizer,
  registerPort: vi.fn(),
  terminate: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  recognizerListeners.clear()
  audioContextState = 'running'
  workletMessageHandler = null
  latestWorkletNode = null
  processor.onaudioprocess = null
  silentGain.gain.value = 1
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] })
  createModel.mockResolvedValue(model)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useVoskTranscription', () => {
  it('transcribes microphone audio locally and releases capture when stopped', async () => {
    const onPartial = vi.fn()
    const onFinal = vi.fn()
    const transcription = useVoskTranscription({
      modelUrl: '/models/pt-br.tar.gz',
      onPartial,
      onFinal,
    })

    const starting = transcription.start()
    expect(transcription.loading.value).toBe(true)
    await starting

    expect(createModel).toHaveBeenCalledWith('/models/pt-br.tar.gz', -1)
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }),
    })
    expect(KaldiRecognizer).toHaveBeenCalledWith(48_000)
    expect(recognizer.setWords).toHaveBeenCalledWith(true)
    expect(silentGain.gain.value).toBe(0)
    expect(transcription.listening.value).toBe(true)
    expect(transcription.loading.value).toBe(false)

    const inputBuffer = {
      getChannelData: () => new Float32Array([0.02, -0.24, 0.1]),
    } as unknown as AudioBuffer
    processor.onaudioprocess?.({ inputBuffer })
    expect(recognizer.acceptWaveform).toHaveBeenCalledWith(inputBuffer)
    expect(transcription.inputState.value).toBe('receiving')

    recognizerListeners.get('partialresult')?.({ result: { partial: 'fala parcial' } })
    recognizerListeners.get('result')?.({ result: { text: 'fala final' } })
    expect(onPartial).toHaveBeenCalledWith('fala parcial')
    expect(onFinal).toHaveBeenCalledWith('fala final')

    transcription.stop()
    expect(recognizer.retrieveFinalResult).toHaveBeenCalledTimes(1)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(source.disconnect).toHaveBeenCalled()
    expect(processor.disconnect).toHaveBeenCalled()
    expect(contextClose).toHaveBeenCalled()
    expect(transcription.listening.value).toBe(false)
  })

  it('resumes the audio context again when model preparation suspends it', async () => {
    let resolveModel!: (loadedModel: typeof model) => void
    createModel.mockReturnValueOnce(
      new Promise<typeof model>((resolve) => {
        resolveModel = resolve
      }),
    )
    audioContextState = 'suspended'
    const transcription = useVoskTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    const starting = transcription.start()
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    audioContextState = 'suspended'
    resolveModel(model)
    await starting

    expect(contextResume).toHaveBeenCalledTimes(2)
    expect(transcription.listening.value).toBe(true)
    transcription.stop()
  })

  it('uses AudioWorklet and reports microphone frames without moving audio through Vue', async () => {
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
    vi.stubGlobal('MessageChannel', FakeMessageChannel)
    const transcription = useVoskTranscription({
      modelUrl: '/models/pt-br.tar.gz',
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()

    expect(audioWorkletAddModule).toHaveBeenCalledTimes(1)
    expect(latestWorkletNode).not.toBeNull()
    expect(model.registerPort).toHaveBeenCalledWith(modelPort)
    expect(workletPortPostMessage).toHaveBeenCalledWith(
      { action: 'init', recognizerId: 'recognizer-1' },
      [processorPort],
    )
    expect(source.connect).toHaveBeenCalledWith(latestWorkletNode)
    expect(workletConnect).toHaveBeenCalledWith(silentGain)

    workletMessageHandler?.({
      data: { action: 'audio-level', peak: 0.32, frames: 12_000 },
    } as MessageEvent)
    expect(transcription.inputState.value).toBe('receiving')
    expect(transcription.audioLevel.value).toBe(0.32)

    transcription.stop()
    expect(workletDisconnect).toHaveBeenCalled()
    expect(workletPortClose).toHaveBeenCalled()
    expect(modelPortClose).toHaveBeenCalled()
  })

  it('stops capture and reports a stalled pipeline when no audio frame arrives', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
    vi.stubGlobal('MessageChannel', FakeMessageChannel)
    const transcription = useVoskTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()
    expect(transcription.listening.value).toBe(true)
    expect(transcription.inputState.value).toBe('waiting')

    await vi.advanceTimersByTimeAsync(4_000)

    expect(transcription.error.value).toBe('audio-processing-stalled')
    expect(transcription.listening.value).toBe(false)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(contextClose).toHaveBeenCalledTimes(1)
  })

  it('classifies microphone capture failure separately from model loading', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('device busy'))
    const transcription = useVoskTranscription({
      modelUrl: '/models/pt-br.tar.gz',
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()

    expect(transcription.error.value).toBe('audio-capture')
    expect(transcription.loading.value).toBe(false)
    expect(transcription.listening.value).toBe(false)
    expect(contextClose).toHaveBeenCalled()
  })

  it('releases an acquired microphone when the local model fails to load', async () => {
    createModel.mockRejectedValueOnce(new Error('model unavailable'))
    const transcription = useVoskTranscription({
      modelUrl: '/models/pt-br.tar.gz',
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()

    expect(transcription.error.value).toBe('model-load-failed')
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(contextClose).toHaveBeenCalled()
    expect(transcription.listening.value).toBe(false)
  })

  it('releases microphone and audio context when the recognizer worker fails', async () => {
    const transcription = useVoskTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()
    recognizerListeners.get('error')?.({ type: 'error', data: new Error('worker failed') })

    expect(transcription.error.value).toBe('recognition-failed')
    expect(transcription.listening.value).toBe(false)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(contextClose).toHaveBeenCalledTimes(1)
    expect(recognizer.retrieveFinalResult).not.toHaveBeenCalled()
    expect(recognizer.remove).toHaveBeenCalledTimes(1)
  })
})
