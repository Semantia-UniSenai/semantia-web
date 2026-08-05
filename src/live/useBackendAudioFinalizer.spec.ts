import { describe, expect, it, vi } from 'vitest'
import { useBackendAudioFinalizer } from './useBackendAudioFinalizer'

const chunk = (frames: number, value = 0.5) => {
  const output = new Float32Array(frames)
  output.fill(value)
  return output
}

describe('useBackendAudioFinalizer', () => {
  it('publishes each contiguous fixed window automatically as 16 kHz PCM16', async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish, segmentSeconds: 1 })
    finalizer.start()

    finalizer.addAudioChunk(chunk(48_000), 48_000)

    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    const payload = publish.mock.calls[0]?.[0]
    expect(payload.sampleRate).toBe(16_000)
    expect(payload.durationMs).toBe(1_000)
    expect(payload.pcm16.byteLength).toBe(32_000)
    expect(new Int16Array(payload.pcm16)[0]).toBe(16_384)
  })

  it('serializes windows and preserves frames captured during an outstanding publish', async () => {
    let releaseFirst!: (value: { ok: true }) => void
    const publish = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<{ ok: true }>((resolve) => { releaseFirst = resolve }),
      )
      .mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish, segmentSeconds: 1 })
    finalizer.start()

    finalizer.addAudioChunk(chunk(16_000, 0.25), 16_000)
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    finalizer.addAudioChunk(chunk(16_000, -0.25), 16_000)
    expect(publish).toHaveBeenCalledTimes(1)

    releaseFirst({ ok: true })
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2))
    expect(new Int16Array(publish.mock.calls[1]?.[0].pcm16)[0]).toBe(-8_192)
  })

  it('flushes a residual segment of at least 250 ms before manual stop', async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish, segmentSeconds: 5 })
    finalizer.start()
    finalizer.addAudioChunk(chunk(24_000), 48_000)

    await finalizer.stop({ flush: true })

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0]?.[0].durationMs).toBe(500)
    expect(finalizer.status.value).toBe('idle')
    expect(finalizer.bufferedSeconds.value).toBe(0)
  })

  it('does not use an energy gate or VAD to discard a fixed silent window', async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish, segmentSeconds: 1 })
    finalizer.start()

    finalizer.addAudioChunk(chunk(16_000, 0), 16_000)

    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    expect(new Int16Array(publish.mock.calls[0]?.[0].pcm16).every((sample) => sample === 0)).toBe(true)
  })

  it('drops an undersized residual and any buffered audio on disposal', async () => {
    const publish = vi.fn().mockResolvedValue({ ok: true })
    const finalizer = useBackendAudioFinalizer({ publish, segmentSeconds: 5 })
    finalizer.start()
    finalizer.addAudioChunk(chunk(3_000), 16_000)

    await finalizer.stop({ flush: true })

    expect(publish).not.toHaveBeenCalled()
    expect(finalizer.bufferedSeconds.value).toBe(0)
  })
})
