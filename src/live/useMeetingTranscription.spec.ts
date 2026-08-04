import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.useRealTimers()
  vi.resetModules()
  vi.clearAllMocks()
})

function mockEngines(browserSupported: boolean) {
  type EngineCallbacks = {
    onPartial: (text: string) => void
    onFinal: (text: string) => void
  }
  type LocalEngineCallbacks = EngineCallbacks & {
    onAudioChunk?: (samples: Float32Array, sampleRate: number) => void
  }
  const speechError = ref<string | null>(null)
  const speechListening = ref(false)
  const localError = ref<string | null>(null)
  const localListening = ref(false)
  const localLoading = ref(false)
  const localInputState = ref<'idle' | 'waiting' | 'silent' | 'receiving'>('idle')
  const localAudioLevel = ref(0)
  const localTransport = ref<'direct' | 'switching' | 'compatible'>('direct')
  const localHasHypothesis = ref(false)
  const qualityStatus = ref<'idle' | 'loading' | 'ready' | 'processing' | 'error'>('ready')
  const qualityProgress = ref(100)
  const qualityError = ref<string | null>(null)
  const qualityInferenceMs = ref<number | null>(null)
  const backendStatus = ref<'idle' | 'ready' | 'processing' | 'error'>('ready')
  const backendError = ref<string | null>(null)
  const speechStart = vi.fn().mockResolvedValue(true)
  const speechStop = vi.fn()
  const localStart = vi.fn()
  const localStop = vi.fn()
  const qualityStart = vi.fn()
  const qualityStop = vi.fn()
  const qualityAddAudio = vi.fn()
  const qualityFinalize = vi.fn(
    async (
      text: string,
    ): Promise<
      | { text: string; engine: 'whisper'; inferenceMs: number }
      | { text: string; engine: 'vosk'; reason: string }
    > => ({
      text,
      engine: 'vosk',
      reason: 'test-fallback',
    }),
  )
  const backendStart = vi.fn()
  const backendStop = vi.fn()
  const backendAddAudio = vi.fn()
  const backendFinalize = vi.fn().mockResolvedValue({
    accepted: true,
    durationMs: 1_000,
  })
  let backendPublish: ((segment: unknown) => Promise<{ ok: boolean }>) | undefined
  let speechCallbacks: EngineCallbacks | undefined
  let localCallbacks: LocalEngineCallbacks | undefined

  vi.doMock('./useSpeechRecognition', () => ({
    useSpeechRecognition: vi.fn((callbacks: EngineCallbacks) => {
      speechCallbacks = callbacks
      return {
      supported: browserSupported,
      listening: speechListening,
      error: speechError,
      start: speechStart,
      stop: speechStop,
      }
    }),
  }))
  vi.doMock('./useVoskTranscription', () => ({
    useVoskTranscription: vi.fn((callbacks: LocalEngineCallbacks) => {
      localCallbacks = callbacks
      return {
      supported: true,
      listening: localListening,
      loading: localLoading,
      error: localError,
      inputState: localInputState,
      audioLevel: localAudioLevel,
      transport: localTransport,
      hasHypothesis: localHasHypothesis,
      start: localStart,
      stop: localStop,
      }
    }),
  }))
  vi.doMock('./useLocalWhisperFinalizer', () => ({
    useLocalWhisperFinalizer: vi.fn(() => ({
      status: qualityStatus,
      progress: qualityProgress,
      error: qualityError,
      lastInferenceMs: qualityInferenceMs,
      bufferedSeconds: ref(0),
      start: qualityStart,
      stop: qualityStop,
      addAudioChunk: qualityAddAudio,
      finalizeSegment: qualityFinalize,
    })),
  }))
  vi.doMock('./useBackendAudioFinalizer', () => ({
    useBackendAudioFinalizer: vi.fn(
      (options: { publish: (segment: unknown) => Promise<{ ok: boolean }> }) => {
        backendPublish = options.publish
        return {
          status: backendStatus,
          error: backendError,
          bufferedSeconds: ref(0),
          start: backendStart,
          stop: backendStop,
          addAudioChunk: backendAddAudio,
          finalizeSegment: backendFinalize,
        }
      },
    ),
  }))

  return {
    speechError,
    speechListening,
    localListening,
    localLoading,
    localInputState,
    localAudioLevel,
    localTransport,
    localHasHypothesis,
    speechStart,
    speechStop,
    localStart,
    localStop,
    qualityStart,
    qualityStop,
    qualityAddAudio,
    qualityFinalize,
    backendStart,
    backendStop,
    backendAddAudio,
    backendFinalize,
    publishBackendAudio: (segment: unknown) => backendPublish?.(segment),
    emitSpeechPartial: (text: string) => speechCallbacks?.onPartial(text),
    emitSpeechFinal: (text: string) => speechCallbacks?.onFinal(text),
    emitLocalPartial: (text: string) => localCallbacks?.onPartial(text),
    emitLocalFinal: (text: string) => localCallbacks?.onFinal(text),
    emitLocalAudio: (samples: Float32Array, sampleRate: number) =>
      localCallbacks?.onAudioChunk?.(samples, sampleRate),
  }
}

describe('useMeetingTranscription', () => {
  it('forces audio capture and delegates the final to backend ASR', async () => {
    const engines = mockEngines(true)
    const onFinal = vi.fn()
    const onAudioSegment = vi.fn().mockResolvedValue({ ok: true })
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal,
      onAudioSegment,
    })

    await transcription.start('default')
    const pcm = new Float32Array([0.1, 0.2])
    engines.emitLocalAudio(pcm, 48_000)
    engines.emitLocalFinal('hipótese Vosk')
    await vi.waitFor(() => expect(engines.backendFinalize).toHaveBeenCalledTimes(1))

    expect(engines.speechStart).not.toHaveBeenCalled()
    expect(engines.localStart).toHaveBeenCalledWith('default')
    expect(engines.backendStart).toHaveBeenCalledTimes(1)
    expect(engines.backendAddAudio).toHaveBeenCalledWith(pcm, 48_000)
    expect(engines.qualityFinalize).not.toHaveBeenCalled()
    expect(onFinal).not.toHaveBeenCalled()
  })

  it('throttles changed partials and cancels the pending value on stop', async () => {
    vi.useFakeTimers()
    const engines = mockEngines(true)
    const onPartial = vi.fn()
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial,
      onFinal: vi.fn(),
    })
    await transcription.start()

    engines.emitSpeechPartial(' Olá ')
    engines.emitSpeechPartial('Olá, mun')
    engines.emitSpeechPartial('Olá, mundo')
    expect(onPartial).toHaveBeenCalledTimes(1)
    expect(onPartial).toHaveBeenLastCalledWith('Olá')

    await vi.advanceTimersByTimeAsync(250)
    expect(onPartial).toHaveBeenCalledTimes(2)
    expect(onPartial).toHaveBeenLastCalledWith('Olá, mundo')

    engines.emitSpeechPartial('Olá, mundo')
    expect(onPartial).toHaveBeenCalledTimes(2)

    engines.emitSpeechPartial('Outra hipótese')
    transcription.stop()
    await vi.advanceTimersByTimeAsync(250)
    expect(onPartial).toHaveBeenCalledTimes(2)
  })

  it('deduplicates normalized final segments inside the recovery window', async () => {
    vi.useFakeTimers()
    const engines = mockEngines(true)
    const onFinal = vi.fn()
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal,
    })
    await transcription.start()

    engines.emitSpeechFinal(' Texto   acessível ')
    engines.emitLocalFinal('Texto acessível')
    expect(onFinal).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenLastCalledWith('Texto acessível')

    await vi.advanceTimersByTimeAsync(2_001)
    engines.emitSpeechFinal('Texto acessível')
    expect(onFinal).toHaveBeenCalledTimes(2)
  })

  it('replaces a local Vosk final with the ready Whisper result', async () => {
    const engines = mockEngines(false)
    const onFinal = vi.fn()
    engines.qualityFinalize.mockResolvedValueOnce({
      text: 'acessibilidade e comunicação',
      engine: 'whisper',
      inferenceMs: 321,
    })
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal,
    })

    await transcription.start()
    const pcm = new Float32Array([0.1, 0.2])
    engines.emitLocalAudio(pcm, 48_000)
    engines.emitLocalFinal('a sensibilidade e comunicação')

    expect(engines.qualityStart).toHaveBeenCalledTimes(1)
    expect(engines.qualityAddAudio).toHaveBeenCalledWith(pcm, 48_000)
    await vi.waitFor(() => {
      expect(onFinal).toHaveBeenCalledWith('acessibilidade e comunicação')
    })
    expect(onFinal).not.toHaveBeenCalledWith('a sensibilidade e comunicação')

    transcription.stop()
    expect(engines.qualityStop).toHaveBeenCalledTimes(1)
  })

  it('drops Vosk callbacks that arrive after stop returns', async () => {
    const engines = mockEngines(false)
    const onPartial = vi.fn()
    const onFinal = vi.fn()
    engines.localStop.mockImplementationOnce(() => {
      queueMicrotask(() => {
        engines.emitLocalPartial('parcial tardia')
        engines.emitLocalFinal('final tardio')
      })
    })
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({ onPartial, onFinal })

    await transcription.start('microphone-card-06')
    transcription.stop()
    await Promise.resolve()
    await Promise.resolve()

    expect(engines.qualityFinalize).not.toHaveBeenCalled()
    expect(onPartial).not.toHaveBeenCalled()
    expect(onFinal).not.toHaveBeenCalled()
  })

  it('drops a late Whisper result after transcription stops', async () => {
    const engines = mockEngines(false)
    const onFinal = vi.fn()
    let resolveFinal!: (result: {
      text: string
      engine: 'whisper'
      inferenceMs: number
    }) => void
    engines.qualityFinalize.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFinal = resolve
        }),
    )
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal,
    })

    await transcription.start()
    engines.emitLocalFinal('final provisório')
    transcription.stop()
    resolveFinal({ text: 'resultado atrasado', engine: 'whisper', inferenceMs: 999 })
    await Promise.resolve()
    await Promise.resolve()

    expect(onFinal).not.toHaveBeenCalled()
  })

  it('does not start Vosk when stop happens during native preparation', async () => {
    const engines = mockEngines(true)
    let resolveBrowserStart!: (started: boolean) => void
    engines.speechStart.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { resolveBrowserStart = resolve }),
    )
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    const startPromise = transcription.start()
    transcription.stop()
    resolveBrowserStart(false)
    await startPromise

    expect(engines.localStart).not.toHaveBeenCalled()
    expect(engines.qualityStart).not.toHaveBeenCalled()
    expect(transcription.listening.value).toBe(false)
  })

  it('uses local recognition for a specifically selected microphone', async () => {
    const engines = mockEngines(true)
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start('usb-headset')

    expect(engines.speechStart).not.toHaveBeenCalled()
    expect(engines.localStart).toHaveBeenCalledWith('usb-headset')
    expect(transcription.engine.value).toBe('local')
  })

  it('restarts only transcription on the newly selected microphone', async () => {
    const engines = mockEngines(true)
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })
    await transcription.start('default')
    engines.speechListening.value = true

    await transcription.changeDevice('usb-headset')

    expect(engines.speechStop).toHaveBeenCalledTimes(1)
    expect(engines.localStop).toHaveBeenCalledTimes(1)
    expect(engines.localStart).toHaveBeenCalledWith('usb-headset')
    expect(transcription.engine.value).toBe('local')
  })

  it('reacts when the selected device is replaced by devicechange fallback', async () => {
    const engines = mockEngines(true)
    const selectedDeviceId = ref('default')
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      deviceId: selectedDeviceId,
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })
    await transcription.start()
    engines.speechListening.value = true

    selectedDeviceId.value = 'usb-headset'
    await nextTick()

    expect(engines.speechStop).toHaveBeenCalledTimes(1)
    expect(engines.localStart).toHaveBeenCalledWith('usb-headset')
    expect(transcription.engine.value).toBe('local')
  })

  it('uses local offline recognition when native browser speech is absent', async () => {
    const engines = mockEngines(false)
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()

    expect(engines.speechStart).not.toHaveBeenCalled()
    expect(engines.localStart).toHaveBeenCalledTimes(1)
    expect(transcription.engine.value).toBe('local')
    engines.localLoading.value = true
    engines.localInputState.value = 'receiving'
    engines.localAudioLevel.value = 0.4
    engines.localTransport.value = 'compatible'
    engines.localHasHypothesis.value = true
    expect(transcription.loading.value).toBe(true)
    expect(transcription.inputState.value).toBe('receiving')
    expect(transcription.audioLevel.value).toBe(0.4)
    expect(transcription.transport.value).toBe('compatible')
    expect(transcription.hasHypothesis.value).toBe(true)
  })

  it('falls back locally when pt-BR on-device cannot start', async () => {
    const engines = mockEngines(true)
    engines.speechStart.mockResolvedValueOnce(false)
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()

    expect(engines.speechStart).toHaveBeenCalledTimes(1)
    expect(engines.localStart).toHaveBeenCalledWith('default')
    expect(transcription.engine.value).toBe('local')
  })

  it('falls back locally after the native empty-restart limit', async () => {
    const engines = mockEngines(true)
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()
    engines.speechError.value = 'no-speech-limit'
    await nextTick()

    expect(engines.speechStop).toHaveBeenCalledTimes(1)
    expect(engines.localStart).toHaveBeenCalledWith('default')
    expect(transcription.engine.value).toBe('local')
  })

  it('falls back to local offline recognition when native speech fails by network', async () => {
    const engines = mockEngines(true)
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
    })

    await transcription.start()
    expect(engines.speechStart).toHaveBeenCalledTimes(1)
    expect(engines.localStart).not.toHaveBeenCalled()

    engines.speechError.value = 'network'
    await nextTick()

    expect(engines.speechStop).toHaveBeenCalledTimes(1)
    expect(engines.localStart).toHaveBeenCalledTimes(1)
    expect(transcription.engine.value).toBe('local')
    expect(transcription.error.value).toBeNull()
  })
})
