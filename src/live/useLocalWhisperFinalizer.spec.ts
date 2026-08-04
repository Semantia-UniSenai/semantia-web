import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useLocalWhisperFinalizer } from './useLocalWhisperFinalizer'

class FakeWorker {
  messages: unknown[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage = vi.fn((message: unknown) => {
    this.messages.push(message)
  })
  terminate = vi.fn()

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

function setup(timeoutMs?: number) {
  const worker = new FakeWorker()
  let finalizer!: ReturnType<typeof useLocalWhisperFinalizer>
  const wrapper = mount(
    defineComponent({
      setup() {
        finalizer = useLocalWhisperFinalizer({
          workerFactory: () => worker as unknown as Worker,
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        })
        return () => null
      },
    }),
  )
  return { worker, finalizer, wrapper }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('useLocalWhisperFinalizer', () => {
  it('loads once, buffers PCM locally and resolves the Whisper final', async () => {
    const { worker, finalizer } = setup()

    finalizer.start()
    finalizer.start()
    expect(finalizer.status.value).toBe('loading')
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.messages[0]).toEqual({ type: 'load' })

    worker.emit({ type: 'progress', progress: 42 })
    worker.emit({ type: 'ready' })
    expect(finalizer.status.value).toBe('ready')
    expect(finalizer.progress.value).toBe(100)

    finalizer.addAudioChunk(new Float32Array([0.1, 0.2]), 48_000)
    finalizer.addAudioChunk(new Float32Array([0.3]), 48_000)
    const pending = finalizer.finalizeSegment('texto do vosk')

    const request = worker.messages.at(-1) as {
      type: string
      requestId: string
      samples: Float32Array
      sampleRate: number
    }
    expect(request.type).toBe('transcribe')
    expect(Array.from(request.samples)).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ])
    expect(request.sampleRate).toBe(48_000)

    worker.emit({
      type: 'complete',
      requestId: request.requestId,
      text: 'texto preciso do whisper',
      inferenceMs: 321,
    })
    await expect(pending).resolves.toEqual({
      text: 'texto preciso do whisper',
      engine: 'whisper',
      inferenceMs: 321,
    })
    expect(finalizer.bufferedSeconds.value).toBe(0)
  })

  it('keeps the default deadline above the measured small-model latency', async () => {
    vi.useFakeTimers()
    const { worker, finalizer } = setup()
    finalizer.start()
    worker.emit({ type: 'ready' })
    finalizer.addAudioChunk(new Float32Array(16_000).fill(0.2), 16_000)

    let settled = false
    const pending = finalizer.finalizeSegment('resultado preliminar').then((result) => {
      settled = true
      return result
    })
    await vi.advanceTimersByTimeAsync(15_001)

    expect(settled).toBe(false)
    worker.emit({
      type: 'complete',
      requestId: (worker.messages.at(-1) as { requestId: string }).requestId,
      text: 'resultado refinado',
      inferenceMs: 18_000,
    })
    await expect(pending).resolves.toMatchObject({
      text: 'resultado refinado',
      engine: 'whisper',
    })
  })

  it('returns the Vosk final when quality inference times out', async () => {
    vi.useFakeTimers()
    const { worker, finalizer } = setup(1_000)
    finalizer.start()
    worker.emit({ type: 'ready' })
    finalizer.addAudioChunk(new Float32Array(4_800).fill(0.1), 48_000)

    const pending = finalizer.finalizeSegment('fallback vosk')
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(pending).resolves.toEqual({
      text: 'fallback vosk',
      engine: 'vosk',
      reason: 'inference-timeout',
    })
    expect(finalizer.error.value).toBe('inference-timeout')
    expect(finalizer.status.value).toBe('error')
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('terminates the worker when inference reports an error message', async () => {
    const { worker, finalizer } = setup()
    finalizer.start()
    worker.emit({ type: 'ready' })
    finalizer.addAudioChunk(new Float32Array(4_800).fill(0.1), 48_000)

    const pending = finalizer.finalizeSegment('fallback preservado')
    const request = worker.messages.at(-1) as { requestId: string }
    worker.emit({
      type: 'error',
      requestId: request.requestId,
      error: 'wasm-inference-failed',
    })

    await expect(pending).resolves.toEqual({
      text: 'fallback preservado',
      engine: 'vosk',
      reason: 'wasm-inference-failed',
    })
    expect(finalizer.status.value).toBe('error')
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('returns the Vosk final when the worker fails during inference', async () => {
    const { worker, finalizer } = setup()
    finalizer.start()
    worker.emit({ type: 'ready' })
    finalizer.addAudioChunk(new Float32Array(4_800).fill(0.1), 48_000)

    const pending = finalizer.finalizeSegment('fallback preservado')
    worker.onerror?.({} as ErrorEvent)

    await expect(pending).resolves.toEqual({
      text: 'fallback preservado',
      engine: 'vosk',
      reason: 'model-load-failed',
    })
    expect(finalizer.status.value).toBe('error')
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('does not retain microphone audio when stopped or unmounted', () => {
    const { worker, finalizer, wrapper } = setup()
    finalizer.start()
    worker.emit({ type: 'ready' })
    finalizer.addAudioChunk(new Float32Array(48_000).fill(0.1), 48_000)
    expect(finalizer.bufferedSeconds.value).toBe(1)

    finalizer.stop()
    expect(finalizer.bufferedSeconds.value).toBe(0)
    expect(finalizer.status.value).toBe('idle')
    expect(worker.terminate).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
