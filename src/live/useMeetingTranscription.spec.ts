import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

function mockPipeline() {
  const captureListening = ref(false)
  const captureLoading = ref(false)
  const captureError = ref<string | null>(null)
  const inputState = ref<'idle' | 'waiting' | 'receiving'>('idle')
  const audioLevel = ref(0)
  const backendStatus = ref<'idle' | 'ready' | 'processing' | 'error'>('idle')
  const backendError = ref<string | null>(null)
  const captureStart = vi.fn(async () => {
    captureListening.value = true
    return true
  })
  const captureStop = vi.fn(() => {
    captureListening.value = false
  })
  const backendStart = vi.fn(() => {
    backendStatus.value = 'ready'
  })
  const backendStop = vi.fn(async () => {
    backendStatus.value = 'idle'
  })
  const backendAddAudio = vi.fn()
  let captureAudio: ((samples: Float32Array, sampleRate: number) => void) | undefined
  let backendPublish: ((segment: unknown) => Promise<{ ok: boolean }>) | undefined

  vi.doMock('./usePcmAudioCapture', () => ({
    usePcmAudioCapture: vi.fn(
      (options: { onAudioChunk: (samples: Float32Array, sampleRate: number) => void }) => {
        captureAudio = options.onAudioChunk
        return {
          supported: true,
          listening: captureListening,
          loading: captureLoading,
          error: captureError,
          inputState,
          audioLevel,
          start: captureStart,
          stop: captureStop,
        }
      },
    ),
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
        }
      },
    ),
  }))

  return {
    captureListening,
    captureStart,
    captureStop,
    backendStart,
    backendStop,
    backendAddAudio,
    emitAudio: (samples: Float32Array, sampleRate: number) =>
      captureAudio?.(samples, sampleRate),
    publishBackendAudio: (segment: unknown) => backendPublish?.(segment),
  }
}

describe('useMeetingTranscription', () => {
  it('captures only PCM and delegates all text recognition to backend ASR', async () => {
    const pipeline = mockPipeline()
    const onAudioSegment = vi.fn().mockResolvedValue({ ok: true })
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({ onAudioSegment })

    await transcription.start('usb-headset')
    const pcm = new Float32Array([0.1, -0.2])
    pipeline.emitAudio(pcm, 48_000)
    const segment = {
      pcm16: new ArrayBuffer(32_000),
      sampleRate: 16_000 as const,
      durationMs: 1_000,
    }
    await pipeline.publishBackendAudio(segment)

    expect(pipeline.captureStart).toHaveBeenCalledWith('usb-headset')
    expect(pipeline.backendStart).toHaveBeenCalledTimes(1)
    expect(pipeline.backendAddAudio).toHaveBeenCalledWith(pcm, 48_000)
    expect(onAudioSegment).toHaveBeenCalledWith(segment)
  })

  it('stops capture before flushing the residual backend window', async () => {
    const pipeline = mockPipeline()
    const callOrder: string[] = []
    pipeline.captureStop.mockImplementation(() => {
      callOrder.push('capture-stop')
      pipeline.captureListening.value = false
    })
    pipeline.backendStop.mockImplementation(async (options?: { flush?: boolean }) => {
      callOrder.push(`backend-stop:${String(options?.flush)}`)
    })
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onAudioSegment: vi.fn().mockResolvedValue({ ok: true }),
    })
    await transcription.start()

    await transcription.stop()

    expect(callOrder).toEqual(['capture-stop', 'backend-stop:true'])
  })

  it('restarts PCM capture on the newly selected microphone', async () => {
    const pipeline = mockPipeline()
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      onAudioSegment: vi.fn().mockResolvedValue({ ok: true }),
    })
    await transcription.start('default')

    await transcription.changeDevice('classroom-mic')

    expect(pipeline.captureStart).toHaveBeenNthCalledWith(1, 'default')
    expect(pipeline.captureStart).toHaveBeenNthCalledWith(2, 'classroom-mic')
    expect(pipeline.backendStop).toHaveBeenCalledWith({ flush: true })
  })

  it('reacts when devicechange replaces the selected input', async () => {
    const pipeline = mockPipeline()
    const selectedDeviceId = ref('default')
    const { useMeetingTranscription } = await import('./useMeetingTranscription')
    const transcription = useMeetingTranscription({
      deviceId: selectedDeviceId,
      onAudioSegment: vi.fn().mockResolvedValue({ ok: true }),
    })
    await transcription.start()

    selectedDeviceId.value = 'teacher-lapel'
    await nextTick()
    await vi.waitFor(() => {
      expect(pipeline.captureStart).toHaveBeenLastCalledWith('teacher-lapel')
    })
  })
})
