import type { ConferenceEvent } from './types'

export interface ConferenceClient {
  connect(serverUrl: string, token: string): Promise<void>
  disconnect(): Promise<void>
  setMicrophoneEnabled(enabled: boolean, deviceId?: string): Promise<void>
  publishMicrophoneTrack(track: MediaStreamTrack): Promise<void>
  unpublishMicrophoneTrack(): Promise<void>
  setCameraEnabled(enabled: boolean, deviceId?: string): Promise<void>
  switchDevice(
    kind: 'audioinput' | 'videoinput' | 'audiooutput',
    deviceId: string,
  ): Promise<void>
  startAudio(): Promise<void>
  onEvent(listener: (event: ConferenceEvent) => void): () => void
}
