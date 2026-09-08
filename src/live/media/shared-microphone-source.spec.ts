import { describe, expect, it, vi } from 'vitest'
import {
  BrowserSharedMicrophoneSource,
  type MicrophoneLease,
} from './shared-microphone-source'

function fakeTrack(label: string) {
  return {
    label,
    stop: vi.fn(),
    clone: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

describe('BrowserSharedMicrophoneSource', () => {
  it('invalidates active clones when the physical track ends externally', async () => {
    const firstBase = fakeTrack('first-base')
    const firstClone = fakeTrack('first-clone')
    firstBase.clone.mockReturnValueOnce(firstClone)
    const secondBase = fakeTrack('second-base')
    secondBase.clone.mockReturnValueOnce(fakeTrack('second-clone'))
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce({
        getAudioTracks: () => [firstBase],
        getTracks: () => [firstBase],
      })
      .mockResolvedValueOnce({
        getAudioTracks: () => [secondBase],
        getTracks: () => [secondBase],
      })
    const source = new BrowserSharedMicrophoneSource(getUserMedia as never)
    await source.acquire('microphone-1')
    const ended = firstBase.addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'ended',
    )?.[1] as (() => void) | undefined

    ended?.()
    await source.acquire('microphone-1')

    expect(firstClone.stop).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('rejects a different device until the active source is reset', async () => {
    const baseTrack = fakeTrack('base')
    baseTrack.clone.mockReturnValue(fakeTrack('clone'))
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [baseTrack],
      getTracks: () => [baseTrack],
    })
    const source = new BrowserSharedMicrophoneSource(getUserMedia as never)
    await source.acquire('microphone-1')

    await expect(source.acquire('microphone-2')).rejects.toMatchObject({
      name: 'InvalidStateError',
    })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('releases a stale stream that resolves after reset', async () => {
    const baseTrack = fakeTrack('late-base')
    let resolveStream!: (stream: unknown) => void
    const getUserMedia = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve
        }),
    )
    const source = new BrowserSharedMicrophoneSource(getUserMedia as never)
    const acquisition = source.acquire('microphone-1')

    await source.reset('microphone-2')
    resolveStream({
      getAudioTracks: () => [baseTrack],
      getTracks: () => [baseTrack],
    })

    await expect(acquisition).rejects.toMatchObject({ name: 'AbortError' })
    expect(baseTrack.stop).toHaveBeenCalledTimes(1)
    expect(baseTrack.clone).not.toHaveBeenCalled()
  })

  it('resets active consumers before acquiring the selected device', async () => {
    const oldBase = fakeTrack('old-base')
    const oldClone = fakeTrack('old-clone')
    oldBase.clone.mockReturnValueOnce(oldClone)
    const newBase = fakeTrack('new-base')
    const newClone = fakeTrack('new-clone')
    newBase.clone.mockReturnValueOnce(newClone)
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce({
        getAudioTracks: () => [oldBase],
        getTracks: () => [oldBase],
      })
      .mockResolvedValueOnce({
        getAudioTracks: () => [newBase],
        getTracks: () => [newBase],
      })
    const source = new BrowserSharedMicrophoneSource(getUserMedia as never)
    await source.acquire('microphone-1')

    await source.reset('microphone-2')
    const next = await source.acquire('microphone-2')

    expect(oldClone.stop).toHaveBeenCalledTimes(1)
    expect(oldBase.stop).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: expect.objectContaining({ deviceId: { exact: 'microphone-2' } }),
    })
    expect(next.track).toBe(newClone)
  })

  it('disposes the base and all active clones idempotently', async () => {
    const baseTrack = fakeTrack('base')
    const firstClone = fakeTrack('first-clone')
    const secondClone = fakeTrack('second-clone')
    baseTrack.clone.mockReturnValueOnce(firstClone).mockReturnValueOnce(secondClone)
    const source = new BrowserSharedMicrophoneSource(
      vi.fn().mockResolvedValue({
        getAudioTracks: () => [baseTrack],
        getTracks: () => [baseTrack],
      }) as never,
    )
    const first = await source.acquire('microphone-1')
    await source.acquire('microphone-1')

    source.dispose()
    source.dispose()
    first.release()

    expect(firstClone.stop).toHaveBeenCalledTimes(1)
    expect(secondClone.stop).toHaveBeenCalledTimes(1)
    expect(baseTrack.stop).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent acquisitions into one physical capture', async () => {
    const baseTrack = fakeTrack('base')
    const firstClone = fakeTrack('first-clone')
    const secondClone = fakeTrack('second-clone')
    baseTrack.clone.mockReturnValueOnce(firstClone).mockReturnValueOnce(secondClone)
    let resolveStream!: (stream: unknown) => void
    const getUserMedia = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve
        }),
    )
    const source = new BrowserSharedMicrophoneSource(getUserMedia as never)

    const first = source.acquire('microphone-1')
    const second = source.acquire('microphone-1')

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    resolveStream({
      getAudioTracks: () => [baseTrack],
      getTracks: () => [baseTrack],
    })
    const leases = await Promise.all([first, second])

    expect(leases.map((lease: MicrophoneLease) => lease.track)).toEqual([
      firstClone,
      secondClone,
    ])
  })

  it('shares one physical track until the last independent clone is released', async () => {
    const baseTrack = fakeTrack('base')
    const firstClone = fakeTrack('first-clone')
    const secondClone = fakeTrack('second-clone')
    baseTrack.clone.mockReturnValueOnce(firstClone).mockReturnValueOnce(secondClone)
    const getUserMedia = vi.fn().mockResolvedValue({
      getAudioTracks: () => [baseTrack],
      getTracks: () => [baseTrack],
    })
    const source = new BrowserSharedMicrophoneSource(getUserMedia as never)

    const first = await source.acquire('microphone-1')
    const second = await source.acquire('microphone-1')

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(first.track).toBe(firstClone)
    expect(second.track).toBe(secondClone)

    first.release()
    expect(firstClone.stop).toHaveBeenCalledTimes(1)
    expect(secondClone.stop).not.toHaveBeenCalled()
    expect(baseTrack.stop).not.toHaveBeenCalled()

    second.release()
    expect(secondClone.stop).toHaveBeenCalledTimes(1)
    expect(baseTrack.stop).toHaveBeenCalledTimes(1)
  })
})
