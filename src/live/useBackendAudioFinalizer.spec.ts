import { describe, expect, it, vi } from 'vitest'
import { useBackendAudioFinalizer } from './useBackendAudioFinalizer'

const chunk = (frames: number, value = 0.5) => {
  const output = new Float32Array(frames)
  output.fill(value)
  return output
}

describe('useBackendAudioFinalizer', () => {
  it('resamples captured audio to 16 kHz PCM16 and publishes it once', async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish })
    finalizer.start()
    finalizer.addAudioChunk(chunk(48_000), 48_000)

    await expect(finalizer.finalizeSegment()).resolves.toEqual({
      accepted: true,
      durationMs: 1_000,
    })
    expect(publish).toHaveBeenCalledTimes(1)
    const payload = publish.mock.calls[0]?.[0]
    expect(payload.sampleRate).toBe(16_000)
    expect(payload.durationMs).toBe(1_000)
    expect(payload.pcm16).toBeInstanceOf(ArrayBuffer)
    expect(payload.pcm16.byteLength).toBe(32_000)
    expect(new Int16Array(payload.pcm16)[0]).toBe(16_384)
  })

  it('does not publish silence or an undersized segment', async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish })
    finalizer.start()
    finalizer.addAudioChunk(chunk(16_000, 0), 16_000)

    await expect(finalizer.finalizeSegment()).resolves.toEqual({
      accepted: false,
      reason: 'empty-audio',
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it('keeps only the bounded in-memory tail', async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish, maxBufferedSeconds: 1 })
    finalizer.start()
    finalizer.addAudioChunk(chunk(9_600), 16_000)
    finalizer.addAudioChunk(chunk(9_600), 16_000)

    await finalizer.finalizeSegment()

    const payload = publish.mock.calls[0]?.[0]
    expect(payload.durationMs).toBe(600)
    expect(payload.pcm16.byteLength).toBe(19_200)
  })

  it('drops buffered audio on stop', async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish })
    finalizer.start()
    finalizer.addAudioChunk(chunk(16_000), 16_000)
    finalizer.stop()

    await expect(finalizer.finalizeSegment()).resolves.toEqual({
      accepted: false,
      reason: 'stopped',
    })
    expect(publish).not.toHaveBeenCalled()
  })
})
