import {
  isBrowserSupported,
  Room,
  RoomEvent,
  supportsAdaptiveStream,
  supportsDynacast,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RoomOptions,
  type Participant,
  type TrackPublication,
} from 'livekit-client'
import type { ConferenceClient } from './conference-client'
import {
  ConferenceClientError,
  type ConferenceEvent,
  type ConferenceTrackRef,
} from './types'

interface LiveKitRuntime {
  isBrowserSupported(): boolean
  createRoom(options: RoomOptions): Room
  supportsAdaptiveStream?(): boolean
  supportsDynacast?(): boolean
}

const browserRuntime: LiveKitRuntime = {
  isBrowserSupported,
  createRoom: (options) => new Room(options),
  supportsAdaptiveStream,
  supportsDynacast,
}

export class LiveKitConferenceClient implements ConferenceClient {
  private readonly room: Room
  private readonly runtime: LiveKitRuntime
  private readonly listeners = new Set<(event: ConferenceEvent) => void>()
  private readonly tracks = new Map<string, ConferenceTrackRef>()
  private publishedMicrophoneTrack: MediaStreamTrack | null = null
  private disconnected = false

  constructor(runtime: LiveKitRuntime = browserRuntime) {
    this.runtime = runtime
    this.room = runtime.createRoom({
      adaptiveStream: runtime.supportsAdaptiveStream?.() ?? false,
      dynacast: runtime.supportsDynacast?.() ?? false,
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 24 },
      },
    })
    this.room.on(RoomEvent.TrackSubscribed, this.onTrackSubscribed)
    this.room.on(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed)
    this.room.on(RoomEvent.TrackMuted, this.onTrackMuted)
    this.room.on(RoomEvent.TrackUnmuted, this.onTrackUnmuted)
    this.room.on(RoomEvent.Reconnecting, this.onReconnecting)
    this.room.on(RoomEvent.Reconnected, this.onReconnected)
    this.room.on(RoomEvent.Disconnected, this.onDisconnected)
    this.room.on(RoomEvent.MediaDevicesError, this.onMediaDevicesError)
    this.room.on(RoomEvent.ParticipantConnected, this.onParticipantConnected)
    this.room.on(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected)
    this.room.on(
      RoomEvent.AudioPlaybackStatusChanged,
      this.onAudioPlaybackStatusChanged,
    )
  }

  async connect(serverUrl: string, token: string): Promise<void> {
    if (!this.runtime.isBrowserSupported()) {
      throw new ConferenceClientError(
        'MEDIA_BROWSER_UNSUPPORTED',
        'Este navegador não oferece suporte à chamada',
      )
    }
    this.emit({ type: 'status', status: 'connecting' })
    try {
      await this.room.connect(serverUrl, token)
      this.emit({ type: 'status', status: 'connected' })
    } catch (cause) {
      this.emit({ type: 'status', status: 'failed' })
      throw new ConferenceClientError(
        'MEDIA_CONNECTION_FAILED',
        'Não foi possível conectar o áudio e vídeo',
        { cause },
      )
    }
  }

  async disconnect(): Promise<void> {
    if (this.disconnected) return
    this.disconnected = true
    for (const track of this.tracks.values()) track.detach()
    this.tracks.clear()
    this.publishedMicrophoneTrack = null
    this.removeRoomListeners()
    await this.room.disconnect(true).catch(() => undefined)
    this.emit({ type: 'status', status: 'idle' })
    this.listeners.clear()
  }

  async switchDevice(kind: MediaDeviceKind, deviceId: string): Promise<void> {
    await this.room.switchActiveDevice(kind, deviceId, false)
  }

  async setCameraEnabled(enabled: boolean, deviceId?: string): Promise<void> {
    const publication = await this.room.localParticipant.setCameraEnabled(
      enabled,
      deviceId ? { deviceId: { ideal: deviceId } } : undefined,
    )
    const participant = this.room.localParticipant
    const trackKey = `${participant.identity}:${Track.Source.Camera}`
    if (!enabled || !publication?.track) {
      const previousTrack = this.tracks.get(trackKey)
      if (previousTrack) {
        previousTrack.detach()
        this.tracks.delete(trackKey)
        this.emit({ type: 'track-removed', trackKey })
      }
      return
    }
    const localTrack = publication.track
    const conferenceTrack: ConferenceTrackRef = {
      key: trackKey,
      participantId: participant.identity,
      participantName: participant.name || participant.identity,
      kind: 'video',
      source: Track.Source.Camera,
      muted: publication.isMuted || localTrack.isMuted,
      isLocal: true,
      attach: (element: HTMLMediaElement) => {
        localTrack.attach(element)
      },
      detach: (element?: HTMLMediaElement) => {
        if (element) localTrack.detach(element)
        else localTrack.detach()
      },
    }
    const previousTrack = this.tracks.get(trackKey)
    if (previousTrack) previousTrack.detach()
    this.tracks.set(trackKey, conferenceTrack)
    this.emit({ type: 'track-added', track: conferenceTrack })
  }

  async setMicrophoneEnabled(
    enabled: boolean,
    deviceId?: string,
  ): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(
      enabled,
      deviceId ? { deviceId: { ideal: deviceId } } : undefined,
    )
  }

  async publishMicrophoneTrack(track: MediaStreamTrack): Promise<void> {
    await this.room.localParticipant.publishTrack(track, {
      source: Track.Source.Microphone,
    })
    this.publishedMicrophoneTrack = track
  }

  async unpublishMicrophoneTrack(): Promise<void> {
    const track = this.publishedMicrophoneTrack
    if (!track) return
    this.publishedMicrophoneTrack = null
    await this.room.localParticipant.unpublishTrack(track, false)
  }

  async startAudio(): Promise<void> {
    await this.room.startAudio()
  }

  onEvent(listener: (event: ConferenceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: ConferenceEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private removeRoomListeners(): void {
    this.room.off(RoomEvent.TrackSubscribed, this.onTrackSubscribed)
    this.room.off(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed)
    this.room.off(RoomEvent.TrackMuted, this.onTrackMuted)
    this.room.off(RoomEvent.TrackUnmuted, this.onTrackUnmuted)
    this.room.off(RoomEvent.Reconnecting, this.onReconnecting)
    this.room.off(RoomEvent.Reconnected, this.onReconnected)
    this.room.off(RoomEvent.Disconnected, this.onDisconnected)
    this.room.off(RoomEvent.MediaDevicesError, this.onMediaDevicesError)
    this.room.off(RoomEvent.ParticipantConnected, this.onParticipantConnected)
    this.room.off(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected)
    this.room.off(
      RoomEvent.AudioPlaybackStatusChanged,
      this.onAudioPlaybackStatusChanged,
    )
  }

  private readonly onReconnecting = (): void => {
    this.emit({ type: 'status', status: 'reconnecting' })
  }

  private readonly onReconnected = (): void => {
    this.emit({ type: 'status', status: 'connected' })
  }

  private readonly onDisconnected = (): void => {
    this.emit({ type: 'status', status: 'failed' })
  }

  private readonly onMediaDevicesError = (
    error: Error,
    kind?: MediaDeviceKind,
  ): void => {
    const notAllowed = error.name === 'NotAllowedError'
    this.emit({
      type: 'device-error',
      code: notAllowed ? 'MEDIA_DEVICE_NOT_ALLOWED' : 'MEDIA_DEVICE_ERROR',
      kind,
      message: notAllowed
        ? 'Permita o acesso ao dispositivo no navegador'
        : 'Não foi possível acessar o dispositivo',
    })
  }

  private readonly onAudioPlaybackStatusChanged = (playing: boolean): void => {
    this.emit({ type: 'audio-playback', blocked: !playing })
  }

  private readonly onParticipantConnected = (
    participant: RemoteParticipant,
  ): void => {
    this.emit({
      type: 'participant-connected',
      participant: {
        participantId: participant.identity,
        name: participant.name || participant.identity,
      },
    })
  }

  private readonly onParticipantDisconnected = (
    participant: RemoteParticipant,
  ): void => {
    this.emit({
      type: 'participant-disconnected',
      participantId: participant.identity,
    })
  }

  private readonly onTrackSubscribed = (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void => {
    const source = publication.source
    if (source !== Track.Source.Microphone && source !== Track.Source.Camera) return
    if (track.kind !== Track.Kind.Audio && track.kind !== Track.Kind.Video) return
    const conferenceTrack: ConferenceTrackRef = {
      key: `${participant.identity}:${source}`,
      participantId: participant.identity,
      participantName: participant.name || participant.identity,
      kind: track.kind,
      source,
      muted: publication.isMuted || track.isMuted,
      isLocal: false,
      attach: (element: HTMLMediaElement) => {
        track.attach(element)
      },
      detach: (element?: HTMLMediaElement) => {
        if (element) track.detach(element)
        else track.detach()
      },
    }
    const previousTrack = this.tracks.get(conferenceTrack.key)
    if (previousTrack) previousTrack.detach()
    this.tracks.set(conferenceTrack.key, conferenceTrack)
    this.emit({ type: 'track-added', track: conferenceTrack })
  }

  private readonly onTrackUnsubscribed = (
    _track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void => {
    const trackKey = `${participant.identity}:${publication.source}`
    const conferenceTrack = this.tracks.get(trackKey)
    if (!conferenceTrack) return
    conferenceTrack.detach()
    this.tracks.delete(trackKey)
    this.emit({ type: 'track-removed', trackKey })
  }

  private readonly onTrackMuted = (
    publication: TrackPublication,
    participant: Participant,
  ): void => this.updateTrackMuted(publication, participant, true)

  private readonly onTrackUnmuted = (
    publication: TrackPublication,
    participant: Participant,
  ): void => this.updateTrackMuted(publication, participant, false)

  private updateTrackMuted(
    publication: TrackPublication,
    participant: Participant,
    muted: boolean,
  ): void {
    const conferenceTrack = this.tracks.get(
      `${participant.identity}:${publication.source}`,
    )
    if (!conferenceTrack) return
    conferenceTrack.muted = muted
    this.emit({ type: 'track-updated', track: conferenceTrack })
  }
}
