import { describe, expect, it, vi } from 'vitest'
import { RoomEvent, Track } from 'livekit-client'
import { LiveKitConferenceClient } from './livekit-conference-client'

class FakeRoom {
  handlers = new Map<string, Set<(...args: any[]) => void>>()
  connect = vi.fn().mockResolvedValue(undefined)
  disconnect = vi.fn().mockResolvedValue(undefined)
  startAudio = vi.fn().mockResolvedValue(undefined)
  switchActiveDevice = vi.fn().mockResolvedValue(true)
  localParticipant = {
    identity: 'local-1',
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    setCameraEnabled: vi.fn().mockResolvedValue(undefined),
  }
  on = vi.fn((event: string, handler: (...args: any[]) => void) => {
    const handlers = this.handlers.get(event) ?? new Set()
    handlers.add(handler)
    this.handlers.set(event, handlers)
    return this
  })
  off = vi.fn((event: string, handler: (...args: any[]) => void) => {
    this.handlers.get(event)?.delete(handler)
    return this
  })

  fire(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }
}

function setup(supported = true) {
  const room = new FakeRoom()
  const runtime = {
    isBrowserSupported: vi.fn(() => supported),
    createRoom: vi.fn(() => room),
    supportsAdaptiveStream: vi.fn(() => true),
    supportsDynacast: vi.fn(() => true),
  }
  const client = new LiveKitConferenceClient(runtime as never)
  return { client, room, runtime }
}

describe('LiveKitConferenceClient', () => {
  it('finishes local cleanup when the SDK disconnect rejects', async () => {
    const { client, room } = setup()
    const events: any[] = []
    const track = {
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      isMuted: false,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    room.disconnect.mockRejectedValueOnce(new Error('transport already gone'))
    client.onEvent((event: unknown) => events.push(event))
    await client.connect('wss://media.example.test', 'ephemeral-token')
    room.fire(
      RoomEvent.TrackSubscribed,
      track,
      { source: Track.Source.Microphone, isMuted: false },
      { identity: 'remote-1', name: 'Bruno' },
    )

    await expect(client.disconnect()).resolves.toBeUndefined()
    const eventCountAfterDisconnect = events.length
    room.fire(RoomEvent.Reconnecting)

    expect(track.detach).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toEqual({ type: 'status', status: 'idle' })
    expect(events).toHaveLength(eventCountAfterDisconnect)
  })

  it('detaches the previous track when reconnection replaces the same source', () => {
    const { client, room } = setup()
    const participant = { identity: 'remote-1', name: 'Bruno' }
    const publication = { source: Track.Source.Microphone, isMuted: false }
    const firstTrack = {
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      isMuted: false,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    const replacementTrack = {
      ...firstTrack,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    client.onEvent(() => undefined)
    room.fire(RoomEvent.TrackSubscribed, firstTrack, publication, participant)

    room.fire(RoomEvent.TrackSubscribed, replacementTrack, publication, participant)

    expect(firstTrack.detach).toHaveBeenCalledTimes(1)
    expect(replacementTrack.detach).not.toHaveBeenCalled()
  })

  it('reports an unexpected SDK disconnect as failed', () => {
    const { client, room } = setup()
    const events: any[] = []
    client.onEvent((event: unknown) => events.push(event))

    room.fire(RoomEvent.Disconnected)

    expect(events).toEqual([{ type: 'status', status: 'failed' }])
  })

  it('maps a disconnected media participant by stable identity', () => {
    const { client, room } = setup()
    const events: any[] = []
    client.onEvent((event: unknown) => events.push(event))

    room.fire(RoomEvent.ParticipantDisconnected, {
      identity: 'remote-1',
      name: 'Bruno',
    })

    expect(events).toEqual([
      { type: 'participant-disconnected', participantId: 'remote-1' },
    ])
  })

  it('maps a connected media participant by stable identity', () => {
    const { client, room } = setup()
    const events: any[] = []
    client.onEvent((event: unknown) => events.push(event))

    room.fire(RoomEvent.ParticipantConnected, {
      identity: 'remote-1',
      name: 'Bruno',
    })

    expect(events).toEqual([
      {
        type: 'participant-connected',
        participant: { participantId: 'remote-1', name: 'Bruno' },
      },
    ])
  })

  it('disconnects idempotently and removes every media listener and track', async () => {
    const { client, room } = setup()
    const events: any[] = []
    const track = {
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      isMuted: false,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    client.onEvent((event: unknown) => events.push(event))
    await client.connect('wss://media.example.test', 'ephemeral-token')
    room.fire(
      RoomEvent.TrackSubscribed,
      track,
      { source: Track.Source.Microphone, isMuted: false },
      { identity: 'remote-1', name: 'Bruno' },
    )

    await client.disconnect()
    await client.disconnect()
    const eventCountAfterDisconnect = events.length
    room.fire(RoomEvent.Reconnecting)

    expect(room.disconnect).toHaveBeenCalledTimes(1)
    expect(room.disconnect).toHaveBeenCalledWith(true)
    expect(track.detach).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toEqual({ type: 'status', status: 'idle' })
    expect(events).toHaveLength(eventCountAfterDisconnect)
  })

  it('switches active devices without exact constraints', async () => {
    const { client, room } = setup()

    await client.switchDevice('audioinput', 'microphone-2')

    expect(room.switchActiveDevice).toHaveBeenCalledWith(
      'audioinput',
      'microphone-2',
      false,
    )
  })

  it('enables the selected camera with an ideal constraint', async () => {
    const { client, room } = setup()

    await client.setCameraEnabled(true, 'camera-1')

    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true, {
      deviceId: { ideal: 'camera-1' },
    })
  })

  it('enables the selected conference microphone with an ideal constraint', async () => {
    const { client, room } = setup()

    await client.setMicrophoneEnabled(true, 'microphone-1')

    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true, {
      deviceId: { ideal: 'microphone-1' },
    })
  })

  it('starts remote audio only through an explicit adapter call', async () => {
    const { client, room } = setup()

    await client.startAudio()

    expect(room.startAudio).toHaveBeenCalledTimes(1)
  })

  it('reports when browser autoplay blocks remote audio', () => {
    const { client, room } = setup()
    const events: any[] = []
    client.onEvent((event: unknown) => events.push(event))

    room.fire(RoomEvent.AudioPlaybackStatusChanged, false)

    expect(events).toEqual([{ type: 'audio-playback', blocked: true }])
  })

  it('maps SDK media device errors to a recoverable event', () => {
    const { client, room } = setup()
    const events: any[] = []
    client.onEvent((event: unknown) => events.push(event))

    room.fire(
      RoomEvent.MediaDevicesError,
      new DOMException('Permission denied by browser', 'NotAllowedError'),
      'audioinput',
    )

    expect(events).toEqual([
      {
        type: 'device-error',
        code: 'MEDIA_DEVICE_NOT_ALLOWED',
        kind: 'audioinput',
        message: 'Permita o acesso ao dispositivo no navegador',
      },
    ])
  })

  it('reports failed when the provider connection rejects', async () => {
    const { client, room } = setup()
    const events: any[] = []
    room.connect.mockRejectedValueOnce(new Error('provider unavailable'))
    client.onEvent((event: unknown) => events.push(event))

    await expect(
      client.connect('wss://media.example.test', 'ephemeral-token'),
    ).rejects.toMatchObject({ code: 'MEDIA_CONNECTION_FAILED' })
    expect(events).toEqual([
      { type: 'status', status: 'connecting' },
      { type: 'status', status: 'failed' },
    ])
  })

  it('maps SDK reconnection without adding duplicate tracks', () => {
    const { client, room } = setup()
    const events: any[] = []
    client.onEvent((event: unknown) => events.push(event))

    room.fire(RoomEvent.Reconnecting)
    room.fire(RoomEvent.Reconnected)

    expect(events).toEqual([
      { type: 'status', status: 'reconnecting' },
      { type: 'status', status: 'connected' },
    ])
    expect(events.filter((event) => event.type === 'track-added')).toHaveLength(0)
  })

  it('updates the existing track when a remote publication is unmuted', () => {
    const { client, room } = setup()
    const events: any[] = []
    const track = {
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      isMuted: true,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    const publication = { source: Track.Source.Microphone, isMuted: true }
    const participant = { identity: 'remote-1', name: 'Bruno' }
    client.onEvent((event: unknown) => events.push(event))
    room.fire(RoomEvent.TrackSubscribed, track, publication, participant)

    publication.isMuted = false
    room.fire(RoomEvent.TrackUnmuted, publication, participant)

    expect(events.at(-1)).toMatchObject({
      type: 'track-updated',
      track: { key: 'remote-1:microphone', muted: false },
    })
    expect(events.filter((event) => event.type === 'track-added')).toHaveLength(1)
  })

  it('updates the existing track when a remote publication is muted', () => {
    const { client, room } = setup()
    const events: any[] = []
    const track = {
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      isMuted: false,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    const publication = { source: Track.Source.Microphone, isMuted: false }
    const participant = { identity: 'remote-1', name: 'Bruno' }
    client.onEvent((event: unknown) => events.push(event))
    room.fire(RoomEvent.TrackSubscribed, track, publication, participant)

    publication.isMuted = true
    room.fire(RoomEvent.TrackMuted, publication, participant)

    expect(events.at(-1)).toMatchObject({
      type: 'track-updated',
      track: { key: 'remote-1:microphone', muted: true },
    })
    expect(events.filter((event) => event.type === 'track-added')).toHaveLength(1)
  })

  it('detaches and removes a remote track when its subscription ends', () => {
    const { client, room } = setup()
    const events: any[] = []
    const track = {
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      isMuted: false,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    const publication = { source: Track.Source.Microphone, isMuted: false }
    const participant = { identity: 'remote-1', name: 'Bruno' }
    client.onEvent((event: unknown) => events.push(event))
    room.fire(RoomEvent.TrackSubscribed, track, publication, participant)

    room.fire(RoomEvent.TrackUnsubscribed, track, publication, participant)

    expect(track.detach).toHaveBeenCalledWith()
    expect(events.at(-1)).toEqual({
      type: 'track-removed',
      trackKey: 'remote-1:microphone',
    })
  })

  it('maps a subscribed remote track to a stable conference track', () => {
    const { client, room } = setup()
    const events: any[] = []
    const element = document.createElement('audio')
    const track = {
      kind: Track.Kind.Audio,
      source: Track.Source.Microphone,
      isMuted: false,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    client.onEvent((event: unknown) => events.push(event))

    room.fire(
      RoomEvent.TrackSubscribed,
      track,
      { source: Track.Source.Microphone, isMuted: false },
      { identity: 'remote-1', name: 'Bruno' },
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'track-added',
      track: {
        key: 'remote-1:microphone',
        participantId: 'remote-1',
        participantName: 'Bruno',
        kind: 'audio',
        source: 'microphone',
        muted: false,
        isLocal: false,
      },
    })
    events[0].track.attach(element)
    expect(track.attach).toHaveBeenCalledWith(element)
  })

  it('reports connecting and connected through its own event contract', async () => {
    const { client } = setup()
    const events: unknown[] = []
    const unsubscribe = client.onEvent((event: unknown) => events.push(event))

    await client.connect('wss://media.example.test', 'ephemeral-token')

    expect(events).toEqual([
      { type: 'status', status: 'connecting' },
      { type: 'status', status: 'connected' },
    ])
    unsubscribe()
  })

  it('enables adaptive media only when runtime capabilities support it', () => {
    const { runtime } = setup()

    expect(runtime.createRoom).toHaveBeenCalledWith({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 24 },
      },
    })
  })

  it('fails closed before connecting when the browser is unsupported', async () => {
    const { client, room } = setup(false)

    await expect(
      client.connect('wss://media.example.test', 'ephemeral-token'),
    ).rejects.toMatchObject({ code: 'MEDIA_BROWSER_UNSUPPORTED' })
    expect(room.connect).not.toHaveBeenCalled()
  })
})
