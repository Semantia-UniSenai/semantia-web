import { buildAudioConstraints } from '../useAudioInputDevices'

export interface MicrophoneLease {
  track: MediaStreamTrack
  release(): void
}

export interface SharedMicrophoneSource {
  acquire(deviceId: string): Promise<MicrophoneLease>
  reset(deviceId: string): Promise<void>
  dispose(): void
  onEnded?(listener: () => void): () => void
}

type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>

export class BrowserSharedMicrophoneSource {
  private baseTrack: MediaStreamTrack | null = null
  private acquiring: Promise<void> | null = null
  private generation = 0
  private activeDeviceId: string | null = null
  private baseEndedListener: (() => void) | null = null
  private readonly clones = new Set<MediaStreamTrack>()
  private readonly endedListeners = new Set<() => void>()
  private readonly getUserMedia: GetUserMedia

  constructor(getUserMedia?: GetUserMedia) {
    this.getUserMedia =
      getUserMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints))
  }

  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener)
    return () => this.endedListeners.delete(listener)
  }

  async acquire(deviceId: string): Promise<MicrophoneLease> {
    if (this.activeDeviceId && this.activeDeviceId !== deviceId) {
      throw new DOMException('Reset microphone before changing device', 'InvalidStateError')
    }
    const activeGeneration = this.generation
    if (!this.baseTrack) {
      if (!this.acquiring) this.activeDeviceId = deviceId
      const acquisition = this.acquiring ?? this.openBaseTrack(deviceId, activeGeneration)
      this.acquiring = acquisition
      try {
        await acquisition
      } catch (cause) {
        if (activeGeneration === this.generation) this.activeDeviceId = null
        throw cause
      } finally {
        if (this.acquiring === acquisition) this.acquiring = null
      }
    }
    const clone = this.baseTrack!.clone()
    this.clones.add(clone)
    let released = false
    return {
      track: clone,
      release: () => {
        if (released) return
        released = true
        if (!this.clones.delete(clone)) return
        clone.stop()
        if (this.clones.size === 0) this.releaseBaseTrack()
      },
    }
  }

  reset(deviceId: string): Promise<void> {
    void deviceId
    this.invalidate()
    return Promise.resolve()
  }

  dispose(): void {
    this.invalidate()
  }

  private invalidate(): void {
    this.generation += 1
    this.acquiring = null
    this.activeDeviceId = null
    this.clones.forEach((clone) => clone.stop())
    this.clones.clear()
    this.releaseBaseTrack()
  }

  private async openBaseTrack(
    deviceId: string,
    activeGeneration: number,
  ): Promise<void> {
    const stream = await this.getUserMedia({
      audio: buildAudioConstraints(deviceId),
    })
    if (activeGeneration !== this.generation) {
      stream.getTracks().forEach((track) => track.stop())
      throw new DOMException('Microphone acquisition superseded', 'AbortError')
    }
    const [audioTrack] = stream.getAudioTracks()
    if (!audioTrack) {
      stream.getTracks().forEach((track) => track.stop())
      throw new DOMException('No microphone track', 'NotFoundError')
    }
    this.baseTrack = audioTrack
    this.baseEndedListener = () => {
      if (this.baseTrack !== audioTrack) return
      this.invalidate()
      for (const listener of this.endedListeners) listener()
    }
    audioTrack.addEventListener('ended', this.baseEndedListener, { once: true })
  }

  private releaseBaseTrack(): void {
    if (this.baseTrack && this.baseEndedListener) {
      this.baseTrack.removeEventListener('ended', this.baseEndedListener)
    }
    this.baseEndedListener = null
    this.baseTrack?.stop()
    this.baseTrack = null
    this.activeDeviceId = null
  }
}
