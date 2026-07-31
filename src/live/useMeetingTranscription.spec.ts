import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

function mockEngines(browserSupported: boolean) {
  const speechError = ref<string | null>(null)
  const speechListening = ref(false)
  const localError = ref<string | null>(null)
  const localListening = ref(false)
  const localLoading = ref(false)
  const localInputState = ref<'idle' | 'waiting' | 'silent' | 'receiving'>('idle')
  const localAudioLevel = ref(0)
  const localTransport = ref<'direct' | 'switching' | 'compatible'>('direct')
  const localHasHypothesis = ref(false)
  const speechStart = vi.fn()
  const speechStop = vi.fn()
  const localStart = vi.fn()
  const localStop = vi.fn()

  vi.doMock('./useSpeechRecognition', () => ({
    useSpeechRecognition: vi.fn(() => ({
      supported: browserSupported,
      listening: speechListening,
      error: speechError,
      start: speechStart,
      stop: speechStop,
    })),
  }))
  vi.doMock('./useVoskTranscription', () => ({
    useVoskTranscription: vi.fn(() => ({
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
    })),
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
  }
}

describe('useMeetingTranscription', () => {
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
