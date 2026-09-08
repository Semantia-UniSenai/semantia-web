import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { ConferenceEvent, ConferenceTrackRef } from './media/types'
import { useConferenceMedia } from './useConferenceMedia'

class FakeConferenceClient {
  connect = vi.fn().mockResolvedValue(undefined)
  disconnect = vi.fn().mockResolvedValue(undefined)
  setMicrophoneEnabled = vi.fn().mockResolvedValue(undefined)
  publishMicrophoneTrack = vi.fn().mockResolvedValue(undefined)
  unpublishMicrophoneTrack = vi.fn().mockResolvedValue(undefined)
  setCameraEnabled = vi.fn().mockResolvedValue(undefined)
  switchDevice = vi.fn().mockResolvedValue(undefined)
  startAudio = vi.fn().mockResolvedValue(undefined)
  listener: ((event: ConferenceEvent) => void) | null = null

  onEvent(listener: (event: ConferenceEvent) => void) {
    this.listener = listener
    return () => {
      if (this.listener === listener) this.listener = null
    }
  }

  fire(event: ConferenceEvent) {
    this.listener?.(event)
  }
}

function setup() {
  const joined = ref(false)
  const ended = ref(false)
  const textConnectionStatus = ref<'offline' | 'connecting' | 'connected'>(
    'connected',
  )
  const requestMediaCredentials = vi.fn().mockResolvedValue({
    ok: true,
    serverUrl: 'wss://media.example.test',
    participantToken: 'ephemeral-token',
    expiresInSeconds: 600,
  })
  const leasedMicrophoneTrack = { stop: vi.fn() } as unknown as MediaStreamTrack
  const releaseMicrophoneLease = vi.fn()
  const microphoneSource = {
    acquire: vi.fn().mockResolvedValue({
      track: leasedMicrophoneTrack,
      release: releaseMicrophoneLease,
    }),
    reset: vi.fn(),
    dispose: vi.fn(),
  }
  const clients: FakeConferenceClient[] = []
  const clientFactory = vi.fn(() => {
    const client = new FakeConferenceClient()
    clients.push(client)
    return client
  })
  let media!: ReturnType<typeof useConferenceMedia>
  const wrapper = mount(
    defineComponent({
      setup() {
        media = useConferenceMedia({
          joined,
          ended,
          textConnectionStatus,
          requestMediaCredentials,
          microphoneSource,
          clientFactory,
        })
        return () => h('div')
      },
    }),
  )
  return {
    joined,
    ended,
    textConnectionStatus,
    requestMediaCredentials,
    microphoneSource,
    leasedMicrophoneTrack,
    releaseMicrophoneLease,
    clients,
    clientFactory,
    media,
    wrapper,
  }
}

describe('useConferenceMedia', () => {
  it('contains a rejected credential request inside media state', async () => {
    const context = setup()
    context.requestMediaCredentials.mockRejectedValueOnce(
      new Error('socket disconnected'),
    )
    context.joined.value = true
    await nextTick()
    await flushPromises()

    expect(context.media.mediaStatus.value).toBe('failed')
    expect(context.media.mediaError.value).toEqual({
      code: 'MEDIA_UNAVAILABLE',
      message: 'Não foi possível obter acesso à chamada',
    })
    expect(context.media.textConnectionStatus.value).toBe('connected')
    expect(context.clientFactory).not.toHaveBeenCalled()
  })

  it('ignores stale credentials after retry starts a newer attempt', async () => {
    const context = setup()
    let resolveFirstCredentials!: (value: {
      ok: true
      serverUrl: string
      participantToken: string
      expiresInSeconds: number
    }) => void
    context.requestMediaCredentials.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstCredentials = resolve
      }),
    )
    context.joined.value = true
    await nextTick()

    await context.media.retry()
    expect(context.clients).toHaveLength(1)
    expect(context.media.mediaStatus.value).toBe('connected')

    resolveFirstCredentials({
      ok: true,
      serverUrl: 'wss://media.example.test',
      participantToken: 'stale-token',
      expiresInSeconds: 600,
    })
    await flushPromises()

    expect(context.requestMediaCredentials).toHaveBeenCalledTimes(2)
    expect(context.clients).toHaveLength(1)
    expect(context.media.mediaStatus.value).toBe('connected')
  })

  it('does not create a second client when media is already connected', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()

    await context.media.connect()

    expect(context.requestMediaCredentials).toHaveBeenCalledTimes(1)
    expect(context.clientFactory).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh retry while the previous transport connect is pending', async () => {
    const context = setup()
    const pendingClient = new FakeConferenceClient()
    let resolveFirstConnect!: () => void
    pendingClient.connect.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveFirstConnect = resolve
      }),
    )
    context.clientFactory.mockImplementationOnce(() => {
      context.clients.push(pendingClient)
      return pendingClient
    })
    context.joined.value = true
    await nextTick()
    await Promise.resolve()

    const retryPromise = context.media.retry()
    try {
      await flushPromises()
      expect(context.clients).toHaveLength(2)
      expect(context.requestMediaCredentials).toHaveBeenCalledTimes(2)
      expect(context.media.mediaStatus.value).toBe('connected')
    } finally {
      resolveFirstConnect()
      await retryPromise
    }
    expect(pendingClient.disconnect).toHaveBeenCalledTimes(1)
    expect(context.clients[1]?.disconnect).not.toHaveBeenCalled()
    expect(context.media.mediaStatus.value).toBe('connected')
  })

  it('does not restore connected after the session ends during transport connect', async () => {
    const context = setup()
    const pendingClient = new FakeConferenceClient()
    let resolveConnect!: () => void
    pendingClient.connect.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveConnect = resolve
      }),
    )
    context.clientFactory.mockImplementationOnce(() => {
      context.clients.push(pendingClient)
      return pendingClient
    })
    context.joined.value = true
    await nextTick()
    await Promise.resolve()

    context.ended.value = true
    await nextTick()
    await flushPromises()
    resolveConnect()
    await flushPromises()

    expect(pendingClient.disconnect).toHaveBeenCalledTimes(1)
    expect(context.media.mediaStatus.value).toBe('idle')
  })

  it('does not connect after unmount during a pending credential request', async () => {
    const context = setup()
    let resolveCredentials!: (value: {
      ok: true
      serverUrl: string
      participantToken: string
      expiresInSeconds: number
    }) => void
    context.requestMediaCredentials.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCredentials = resolve
      }),
    )
    context.joined.value = true
    await nextTick()
    context.wrapper.unmount()

    resolveCredentials({
      ok: true,
      serverUrl: 'wss://media.example.test',
      participantToken: 'late-token',
      expiresInSeconds: 600,
    })
    await flushPromises()

    expect(context.clientFactory).not.toHaveBeenCalled()
  })

  it('does not connect after the session ends during a pending credential request', async () => {
    const context = setup()
    let resolveCredentials!: (value: {
      ok: true
      serverUrl: string
      participantToken: string
      expiresInSeconds: number
    }) => void
    context.requestMediaCredentials.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCredentials = resolve
      }),
    )
    context.joined.value = true
    await nextTick()
    context.ended.value = true
    await nextTick()

    resolveCredentials({
      ok: true,
      serverUrl: 'wss://media.example.test',
      participantToken: 'late-token',
      expiresInSeconds: 600,
    })
    await flushPromises()

    expect(context.clientFactory).not.toHaveBeenCalled()
    expect(context.media.mediaStatus.value).toBe('idle')
  })

  it('exposes a recoverable device error without dropping media connection', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()

    context.clients[0]?.fire({
      type: 'device-error',
      code: 'MEDIA_DEVICE_NOT_ALLOWED',
      kind: 'audioinput',
      message: 'Permita o acesso ao dispositivo no navegador',
    })

    expect(context.media.mediaStatus.value).toBe('connected')
    expect(context.media.mediaError.value).toEqual({
      code: 'MEDIA_DEVICE_NOT_ALLOWED',
      message: 'Permita o acesso ao dispositivo no navegador',
    })
  })

  it('switches a conference device without reconnecting media', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    const connectedClient = context.clients[0]

    await context.media.switchDevice('audiooutput', 'speaker-2')

    expect(connectedClient?.switchDevice).toHaveBeenCalledWith(
      'audiooutput',
      'speaker-2',
    )
    expect(context.requestMediaCredentials).toHaveBeenCalledTimes(1)
  })

  it('toggles the conference camera without reloading the room', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    const connectedClient = context.clients[0]

    await context.media.toggleCamera('camera-1')

    expect(connectedClient?.setCameraEnabled).toHaveBeenCalledWith(
      true,
      'camera-1',
    )
    expect(context.media.cameraEnabled.value).toBe(true)
  })

  it('releases the microphone lease when provider unpublish fails', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    await context.media.toggleMicrophone('microphone-1')
    context.clients[0]?.unpublishMicrophoneTrack.mockRejectedValueOnce(
      new Error('unpublish failed'),
    )

    await expect(
      context.media.toggleMicrophone('microphone-1'),
    ).rejects.toThrow('unpublish failed')

    expect(context.releaseMicrophoneLease).toHaveBeenCalledTimes(1)
    expect(context.media.microphoneEnabled.value).toBe(false)
  })

  it('releases the microphone lease when provider publication fails', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    context.clients[0]?.publishMicrophoneTrack.mockRejectedValueOnce(
      new Error('publication failed'),
    )

    await expect(
      context.media.toggleMicrophone('microphone-1'),
    ).rejects.toThrow('publication failed')

    expect(context.releaseMicrophoneLease).toHaveBeenCalledTimes(1)
    expect(context.media.microphoneEnabled.value).toBe(false)
  })

  it('toggles the conference microphone without reloading the room', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    const connectedClient = context.clients[0]

    await context.media.toggleMicrophone('microphone-1')
    await context.media.toggleMicrophone('microphone-1')

    expect(context.microphoneSource.acquire).toHaveBeenCalledWith('microphone-1')
    expect(connectedClient?.publishMicrophoneTrack).toHaveBeenCalledWith(
      context.leasedMicrophoneTrack,
    )
    expect(connectedClient?.unpublishMicrophoneTrack).toHaveBeenCalledTimes(1)
    expect(context.releaseMicrophoneLease).toHaveBeenCalledTimes(1)
    expect(connectedClient?.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(context.media.microphoneEnabled.value).toBe(false)
  })

  it('removes a disconnected media participant by stable identity', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    context.clients[0]?.fire({
      type: 'participant-connected',
      participant: { participantId: 'remote-1', name: 'Bruno' },
    })

    context.clients[0]?.fire({
      type: 'participant-disconnected',
      participantId: 'remote-1',
    })

    expect(context.media.participants.value).toEqual([])
  })

  it('adds a media participant by stable identity', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()

    context.clients[0]?.fire({
      type: 'participant-connected',
      participant: { participantId: 'remote-1', name: 'Bruno' },
    })

    expect(context.media.participants.value).toEqual([
      { participantId: 'remote-1', name: 'Bruno' },
    ])
  })

  it('keeps healthy media connected during a temporary text socket outage', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    const connectedClient = context.clients[0]

    context.textConnectionStatus.value = 'offline'
    await nextTick()

    expect(connectedClient?.disconnect).not.toHaveBeenCalled()
    expect(context.media.mediaStatus.value).toBe('connected')
  })

  it('releases media when the owning view unmounts', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    const connectedClient = context.clients[0]

    context.wrapper.unmount()
    await flushPromises()

    expect(connectedClient?.disconnect).toHaveBeenCalledTimes(1)
    expect(connectedClient?.listener).toBeNull()
  })

  it('disconnects media once when the canonical session ends', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    const connectedClient = context.clients[0]

    context.ended.value = true
    await nextTick()
    await flushPromises()
    context.ended.value = true
    await nextTick()

    expect(connectedClient?.disconnect).toHaveBeenCalledTimes(1)
    expect(context.media.mediaStatus.value).toBe('idle')
  })

  it('disconnects idempotently and clears media state', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    const connectedClient = context.clients[0]
    connectedClient?.fire({
      type: 'participant-connected',
      participant: { participantId: 'remote-1', name: 'Bruno' },
    })
    connectedClient?.fire({
      type: 'device-error',
      code: 'MEDIA_DEVICE_ERROR',
      message: 'Dispositivo indisponível',
    })
    await context.media.toggleMicrophone('microphone-1')

    await context.media.disconnect()
    await context.media.disconnect()

    expect(connectedClient?.disconnect).toHaveBeenCalledTimes(1)
    expect(context.releaseMicrophoneLease).toHaveBeenCalledTimes(1)
    expect(connectedClient?.listener).toBeNull()
    expect(context.media.mediaStatus.value).toBe('idle')
    expect(context.media.mediaError.value).toBeNull()
    expect(context.media.participants.value).toEqual([])
    expect(context.media.tracks.value).toEqual([])
    expect(context.media.microphoneEnabled.value).toBe(false)
    expect(context.media.cameraEnabled.value).toBe(false)
  })

  it('resets local controls when replacing the provider client', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    await context.media.toggleMicrophone('microphone-1')
    await context.media.toggleCamera('camera-1')

    await context.media.retry()

    expect(context.releaseMicrophoneLease).toHaveBeenCalledTimes(1)
    expect(context.media.microphoneEnabled.value).toBe(false)
    expect(context.media.cameraEnabled.value).toBe(false)
  })

  it('cleans the failed client before retrying with a new one', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await flushPromises()
    const failedClient = context.clients[0]
    failedClient?.fire({ type: 'status', status: 'failed' })

    await context.media.retry()

    expect(failedClient?.disconnect).toHaveBeenCalledTimes(1)
    expect(failedClient?.listener).toBeNull()
    expect(context.clients).toHaveLength(2)
    expect(context.requestMediaCredentials).toHaveBeenCalledTimes(2)
  })

  it('requests fresh credentials when retrying media', async () => {
    const context = setup()
    context.requestMediaCredentials
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'MEDIA_UNAVAILABLE', message: 'Indisponível' },
      })
      .mockResolvedValueOnce({
        ok: true,
        serverUrl: 'wss://media.example.test',
        participantToken: 'fresh-token',
        expiresInSeconds: 600,
      })

    context.joined.value = true
    await nextTick()
    await flushPromises()
    await context.media.retry()

    expect(context.requestMediaCredentials).toHaveBeenCalledTimes(2)
    expect(context.clients).toHaveLength(1)
    expect(context.clients[0]?.connect).toHaveBeenCalledWith(
      'wss://media.example.test',
      'fresh-token',
    )
  })

  it('releases a partially connected client after connection failure', async () => {
    const context = setup()
    const failingClient = new FakeConferenceClient()
    failingClient.connect.mockRejectedValueOnce(new Error('provider unavailable'))
    context.clientFactory.mockImplementationOnce(() => {
      context.clients.push(failingClient)
      return failingClient
    })

    context.joined.value = true
    await nextTick()
    await flushPromises()

    expect(failingClient.disconnect).toHaveBeenCalledTimes(1)
    expect(failingClient.listener).toBeNull()
  })

  it('contains a provider connection failure inside media state', async () => {
    const context = setup()
    const failingClient = new FakeConferenceClient()
    failingClient.connect.mockRejectedValueOnce(new Error('provider unavailable'))
    context.clientFactory.mockImplementationOnce(() => {
      context.clients.push(failingClient)
      return failingClient
    })

    context.joined.value = true
    await nextTick()
    await flushPromises()

    expect(context.media.mediaStatus.value).toBe('failed')
    expect(context.media.mediaError.value).toEqual({
      code: 'MEDIA_CONNECTION_FAILED',
      message: 'Não foi possível conectar o áudio e vídeo',
    })
    expect(context.media.textConnectionStatus.value).toBe('connected')
  })

  it('keeps the text room connected when media credentials are unavailable', async () => {
    const context = setup()
    context.requestMediaCredentials.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'MEDIA_UNAVAILABLE',
        message: 'Mídia indisponível no momento',
      },
    })

    context.joined.value = true
    await nextTick()
    await Promise.resolve()

    expect(context.media.mediaStatus.value).toBe('failed')
    expect(context.media.mediaError.value).toEqual({
      code: 'MEDIA_UNAVAILABLE',
      message: 'Mídia indisponível no momento',
    })
    expect(context.media.textConnectionStatus.value).toBe('connected')
    expect(context.clientFactory).not.toHaveBeenCalled()
  })

  it('starts blocked audio only after an explicit user action', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await Promise.resolve()
    context.clients[0]?.fire({ type: 'audio-playback', blocked: true })

    await context.media.startAudio()

    expect(context.clients[0]?.startAudio).toHaveBeenCalledTimes(1)
    expect(context.media.audioPlaybackBlocked.value).toBe(false)
  })

  it('exposes blocked remote audio without starting playback automatically', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await Promise.resolve()

    context.clients[0]?.fire({ type: 'audio-playback', blocked: true })

    expect(context.media.audioPlaybackBlocked.value).toBe(true)
    expect(context.clients[0]?.startAudio).not.toHaveBeenCalled()
  })

  it('updates media reconnection without changing text connection state', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await Promise.resolve()

    context.clients[0]?.fire({ type: 'status', status: 'reconnecting' })

    expect(context.media.mediaStatus.value).toBe('reconnecting')
    expect(context.media.textConnectionStatus.value).toBe('connected')
  })

  it('removes a track when its subscription ends', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await Promise.resolve()
    const track: ConferenceTrackRef = {
      key: 'remote-1:microphone',
      participantId: 'remote-1',
      participantName: 'Bruno',
      kind: 'audio',
      source: 'microphone',
      muted: false,
      isLocal: false,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    context.clients[0]?.fire({ type: 'track-added', track })

    context.clients[0]?.fire({
      type: 'track-removed',
      trackKey: 'remote-1:microphone',
    })

    expect(context.media.tracks.value).toEqual([])
  })

  it('replaces a reconnected track with the same stable key', async () => {
    const context = setup()
    context.joined.value = true
    await nextTick()
    await Promise.resolve()
    const baseTrack: ConferenceTrackRef = {
      key: 'remote-1:microphone',
      participantId: 'remote-1',
      participantName: 'Bruno',
      kind: 'audio',
      source: 'microphone',
      muted: false,
      isLocal: false,
      attach: vi.fn(),
      detach: vi.fn(),
    }
    const replacement = { ...baseTrack, muted: true }

    context.clients[0]?.fire({ type: 'track-added', track: baseTrack })
    context.clients[0]?.fire({ type: 'track-added', track: replacement })

    expect(context.media.tracks.value).toHaveLength(1)
    expect(context.media.tracks.value[0]).toMatchObject({
      key: 'remote-1:microphone',
      muted: true,
    })
  })

  it('starts microphone and camera explicitly disabled', async () => {
    const context = setup()

    context.joined.value = true
    await nextTick()
    await Promise.resolve()

    expect(context.media.microphoneEnabled.value).toBe(false)
    expect(context.media.cameraEnabled.value).toBe(false)
    expect(
      context.clients[0]?.setMicrophoneEnabled,
    ).not.toHaveBeenCalled()
    expect(context.clients[0]?.setCameraEnabled).not.toHaveBeenCalled()
  })

  it('connects media only after the text room admits the participant', async () => {
    const context = setup()
    expect(context.requestMediaCredentials).not.toHaveBeenCalled()

    context.joined.value = true
    await nextTick()
    await Promise.resolve()

    expect(context.requestMediaCredentials).toHaveBeenCalledTimes(1)
    expect(context.clientFactory).toHaveBeenCalledTimes(1)
    expect(context.clients[0]?.connect).toHaveBeenCalledWith(
      'wss://media.example.test',
      'ephemeral-token',
    )
  })
})
