export type ConferenceStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export type MediaKind = 'audio' | 'video'
export type MediaSource = 'microphone' | 'camera'

export interface ConferenceTrackRef {
  key: string
  participantId: string
  participantName: string
  kind: MediaKind
  source: MediaSource
  muted: boolean
  isLocal: boolean
  attach(element: HTMLMediaElement): void
  detach(element?: HTMLMediaElement): void
}

export interface ConferenceParticipantRef {
  participantId: string
  name: string
}

export type ConferenceEvent =
  | { type: 'status'; status: ConferenceStatus }
  | { type: 'participant-connected'; participant: ConferenceParticipantRef }
  | { type: 'participant-disconnected'; participantId: string }
  | { type: 'track-added'; track: ConferenceTrackRef }
  | { type: 'track-updated'; track: ConferenceTrackRef }
  | { type: 'track-removed'; trackKey: string }
  | { type: 'audio-playback'; blocked: boolean }
  | {
      type: 'device-error'
      code: string
      kind?: MediaDeviceKind
      message: string
    }

export class ConferenceClientError extends Error {
  readonly code: string

  constructor(
    code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ConferenceClientError'
    this.code = code
  }
}
