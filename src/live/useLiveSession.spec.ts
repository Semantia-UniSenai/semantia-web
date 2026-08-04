import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { LiveSocket } from './socket'
import type { AckError, ChatMessage, SessionState, TranscriptEntry } from './types'
import { saveGuestAccess } from './guestAccess'
import type { BackendAudioSegment } from './useBackendAudioFinalizer'
import { MAX_PENDING_AUDIO_AGE_MS, useLiveSession } from './useLiveSession'

const MAX_PENDING_FINALS = 50
const MAX_PENDING_AUDIO = 8
const audioSegment: BackendAudioSegment = {
  pcm16: new ArrayBuffer(32_000),
  sampleRate: 16_000,
  durationMs: 1_000,
}

vi.mock('../stores/auth', async () => {
  const { computed, ref } = await import('vue')
  const token = ref('account-jwt')
  const user = ref({ id: 'account-1', name: 'Ana', email: 'ana@empresa.dev' })
  return {
    useAuth: () => ({ user, token, isAuthenticated: computed(() => true) }),
    getToken: () => token.value,
  }
})

class FakeSocket {
  connected = false
  connect = vi.fn(() => this)
  disconnect = vi.fn(() => { this.connected = false; return this })
  removeAllListeners = vi.fn(() => this)
  emitted: Array<{ event: string; args: unknown[] }> = []
  handlers = new Map<string, Array<(...args: any[]) => void>>()

  on(event: string, handler: (...args: any[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
    return this
  }

  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args })
    return this
  }

  fire(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }

  last(event: string) {
    return [...this.emitted].reverse().find((item) => item.event === event)
  }

  ack(event: string, value: unknown) {
    const callback = [...(this.last(event)?.args ?? [])]
      .reverse()
      .find((item: unknown) => typeof item === 'function')
    ;(callback as (result: unknown) => void)(value)
  }

  asSocket() { return this as unknown as LiveSocket }
}

const session = {
  id: 'session-1',
  title: 'Reunião semanal',
  roomId: 'room-1',
  joinToken: 'invite-1',
  status: 'LIVE' as const,
  createdAt: '2026-07-30T10:00:00.000Z',
  startedAt: '2026-07-30T10:01:00.000Z',
  endedAt: null,
  roomName: 'Planejamento',
  hostId: 'account-1',
  hostName: 'Ana',
}

const state: SessionState = {
  session,
  role: 'HOST',
  canManage: true,
  participants: [{ participantId: 'account-1', name: 'Ana', role: 'HOST' }],
  raisedHands: [],
  chat: [],
  transcript: [],
}

function setup() {
  const socket = new FakeSocket()
  const factory = vi.fn(() => socket.asSocket())
  let live!: ReturnType<typeof useLiveSession>
  const wrapper = mount(
    defineComponent({
      setup() {
        live = useLiveSession({ socketFactory: factory })
        return () => h('div')
      },
    }),
  )
  return { socket, factory, live, wrapper }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('useLiveSession generic room contract', () => {
  it('authenticates the socket and joins one session', () => {
    const { socket, factory, live } = setup()
    live.connect('session-1', 'invite-1')
    expect(factory).toHaveBeenCalledWith('account-jwt')
    expect(live.status.value).toBe('connecting')
    socket.connected = true
    socket.fire('connect')
    expect(socket.last('session:join')?.args[0]).toEqual({ sessionId: 'session-1', token: 'invite-1' })
  })

  it('usa o acesso específico do convite mesmo quando existe uma conta autenticada', () => {
    saveGuestAccess({
      accessToken: 'guest-jwt',
      sessionId: 'guest-session',
      participant: { participantId: 'guest-1', name: 'Pessoa surda', role: 'GUEST' },
    })
    const { factory, live } = setup()

    live.connect('guest-session')

    expect(factory).toHaveBeenCalledWith('guest-jwt')
    expect(live.currentParticipantId.value).toBe('guest-1')
  })

  it('normaliza os envelopes reais da API para papel, presença, chat e legenda', () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', {
      session,
      canManage: true,
      self: { participantId: 'account-1', name: 'Ana', role: 'HOST' },
      participants: [{ participantId: 'account-1', name: 'Ana', role: 'HOST' }],
      raisedHands: [],
      chat: [{ id: 'message-0', participantId: 'account-1', name: 'Ana', role: 'HOST', text: 'Abertura', at: '2026-07-30T10:01:00.000Z' }],
      transcript: [{ seq: 1, text: 'Bem-vindos', at: '2026-07-30T10:01:05.000Z' }],
    })
    expect(live.role.value).toBe('HOST')
    expect(live.canManage.value).toBe(true)
    expect(live.chat.value[0]).toMatchObject({ participantName: 'Ana', participantRole: 'HOST', createdAt: '2026-07-30T10:01:00.000Z' })
    expect(live.transcript.value[0]).toMatchObject({ text: 'Bem-vindos', createdAt: '2026-07-30T10:01:05.000Z' })

    socket.fire('presence:joined', {
      participant: { participantId: 'guest-1', name: 'Bruno', role: 'GUEST' },
    })
    expect(live.participants.value.at(-1)).toEqual({ participantId: 'guest-1', name: 'Bruno', role: 'GUEST' })

    socket.fire('chat:message', {
      id: 'message-1', participantId: 'guest-1', name: 'Bruno', role: 'GUEST', text: 'Olá', at: '2026-07-30T10:02:00.000Z',
    })
    expect(live.chat.value.at(-1)).toMatchObject({ participantName: 'Bruno', participantRole: 'GUEST' })
  })

  it('hydrates host publication permission from the real gateway self envelope', () => {
    const { socket, live } = setup()
    live.connect('session-1')
    const wireState = {
      session,
      canManage: true,
      self: {
        participantId: 'account-1',
        name: 'Ana',
        role: 'HOST',
        kind: 'account',
      },
      participants: [{ participantId: 'account-1', name: 'Ana', role: 'HOST' }],
      raisedHands: [],
      chat: [],
      transcript: [],
    }

    socket.fire('session:state', wireState as unknown as SessionState)

    expect(live.role.value).toBe('HOST')
    expect(live.canPublishTranscript.value).toBe(true)
  })

  it('keeps transcript and chat payloads generic', () => {
    const { socket, live } = setup()
    live.connect('session-1')
    const transcript: TranscriptEntry = { seq: 1, startMs: 0, endMs: null, text: 'Texto acessível', confidence: null, createdAt: '2026-07-30T10:02:00.000Z' }
    const chat: ChatMessage = { id: 'message-1', participantId: 'guest-1', participantName: 'Bruno', participantRole: 'GUEST', text: 'Entendido', createdAt: '2026-07-30T10:02:05.000Z' }
    socket.fire('transcript:partial', { text: 'Texto' })
    socket.fire('transcript:final', transcript)
    socket.fire('chat:message', chat)
    expect(live.partialText.value).toBe('')
    expect(live.transcript.value).toEqual([transcript])
    expect(live.chat.value).toEqual([chat])
  })

  it('queues ephemeral PCM offline and flushes it once with the same id', async () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', state)

    await expect(
      live.publishAudioSegment(audioSegment, 'audio-client-1'),
    ).resolves.toEqual({
      ok: true,
      queued: true,
      clientSegmentId: 'audio-client-1',
    })
    expect(live.pendingAudioCount.value).toBe(1)
    expect(socket.last('transcription:audio')).toBeUndefined()

    socket.connected = true
    socket.fire('connect')
    socket.ack('session:join', { ok: true })
    socket.fire('session:state', state)
    await Promise.resolve()

    const payload = socket.last('transcription:audio')?.args[0] as Record<string, unknown>
    expect(payload).toMatchObject({
      clientSegmentId: 'audio-client-1',
      sampleRate: 16_000,
      durationMs: 1_000,
    })
    expect(payload.pcm16).toBe(audioSegment.pcm16)
    socket.ack('transcription:audio', {
      ok: true,
      seq: 1,
      replayed: false,
      engine: 'faster-whisper',
      model: 'small',
      inferenceMs: 42,
    })
    await Promise.resolve()
    expect(live.pendingAudioCount.value).toBe(0)
  })

  it('bounds the in-memory PCM queue', async () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', state)
    for (let index = 0; index < MAX_PENDING_AUDIO; index += 1) {
      await live.publishAudioSegment(audioSegment, `audio-client-${index}`)
    }

    await expect(
      live.publishAudioSegment(audioSegment, 'audio-client-overflow'),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'AUDIO_QUEUE_FULL',
        message: 'A fila temporária de áudio atingiu o limite',
      },
    })
    expect(live.pendingAudioCount.value).toBe(MAX_PENDING_AUDIO)
  })

  it('expires PCM from memory while the socket remains offline', async () => {
    vi.useFakeTimers()
    const { socket, live, wrapper } = setup()
    try {
      live.connect('session-1')
      socket.fire('session:state', state)
      await live.publishAudioSegment(audioSegment, 'audio-client-expiring')

      expect(live.pendingAudioCount.value).toBe(1)
      await vi.advanceTimersByTimeAsync(MAX_PENDING_AUDIO_AGE_MS + 1)

      expect(live.pendingAudioCount.value).toBe(0)
      expect(live.actionError.value).toMatchObject({ code: 'AUDIO_EXPIRED' })
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('tracks backend ASR state without exposing audio', () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('transcription:status', {
      clientSegmentId: 'audio-client-1',
      state: 'processing',
    })

    expect(live.transcriptionStatus.value).toEqual({
      clientSegmentId: 'audio-client-1',
      state: 'processing',
    })
  })

  it('surfaces join and command failures', async () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.connected = true
    socket.fire('connect')
    const error: AckError = { code: 'FORBIDDEN', message: 'Sem acesso' }
    socket.ack('session:join', { ok: false, error })
    expect(live.joinError.value).toEqual(error)

    live.connect('session-1')
    socket.connected = true
    const result = live.sendChat('Olá')
    socket.ack('chat:send', { ok: false, error })
    await expect(result).resolves.toEqual({ ok: false, error })
    expect(live.actionError.value).toEqual(error)
  })

  it('queues one final while offline and flushes it once after rejoining', async () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', state)

    await expect(
      (live.publishFinal as any)(
        'Texto acessível',
        100,
        200,
        0.95,
        'segment-client-1',
      ),
    ).resolves.toEqual({
      ok: true,
      queued: true,
      clientSegmentId: 'segment-client-1',
    })
    expect((live as any).pendingFinalCount?.value).toBe(1)
    expect(socket.last('transcript:final')).toBeUndefined()

    socket.connected = true
    socket.fire('connect')
    socket.ack('session:join', { ok: true })
    await Promise.resolve()
    expect(socket.last('transcript:final')).toBeUndefined()

    socket.fire('session:state', state)
    await Promise.resolve()
    expect(socket.last('transcript:final')?.args[0]).toEqual({
      text: 'Texto acessível',
      startMs: 100,
      endMs: 200,
      confidence: 0.95,
      clientSegmentId: 'segment-client-1',
    })

    socket.ack('transcript:final', { ok: true, seq: 1, replayed: false })
    await Promise.resolve()
    expect((live as any).pendingFinalCount?.value).toBe(0)

    socket.fire('disconnect')
    socket.connected = true
    socket.fire('connect')
    socket.ack('session:join', { ok: true })
    socket.fire('session:state', state)
    await Promise.resolve()
    expect(
      socket.emitted.filter((item) => item.event === 'transcript:final'),
    ).toHaveLength(1)
  })

  it('bounds the offline final queue and rejects overflow observably', async () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', state)

    for (let index = 0; index < MAX_PENDING_FINALS; index += 1) {
      await live.publishFinal(`Segmento ${index}`, index * 100)
    }
    const overflow = await live.publishFinal('Segmento excedente', 9_999)

    expect(live.pendingFinalCount.value).toBe(MAX_PENDING_FINALS)
    expect(overflow).toEqual({
      ok: false,
      error: {
        code: 'TRANSCRIPT_QUEUE_FULL',
        message: 'A fila local de legendas atingiu o limite',
      },
    })
    expect(live.actionError.value?.code).toBe('TRANSCRIPT_QUEUE_FULL')
  })

  it('expires stale queued finals before a later reconnect', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T10:00:00.000Z'))
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', state)
    await live.publishFinal('Final antigo', 100, 200, 0.9, 'stale-final-1')

    vi.setSystemTime(new Date('2026-07-30T10:02:01.000Z'))
    socket.connected = true
    socket.fire('connect')
    socket.ack('session:join', { ok: true })
    socket.fire('session:state', state)
    await Promise.resolve()
    await Promise.resolve()

    expect(socket.last('transcript:final')).toBeUndefined()
    expect(live.pendingFinalCount.value).toBe(0)
    expect(live.actionError.value).toEqual({
      code: 'TRANSCRIPT_EXPIRED',
      message: 'Uma legenda pendente expirou antes da reconexão',
    })
    vi.useRealTimers()
  })

  it('never queues a final for a non-host participant', async () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', {
      ...state,
      role: 'MODERATOR',
      canManage: true,
    })

    await expect(live.publishFinal('Texto indevido', 100)).resolves.toEqual({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Somente o anfitrião pode publicar legendas',
      },
    })
    expect(live.pendingFinalCount.value).toBe(0)
    expect(socket.last('transcript:final')).toBeUndefined()
  })

  it('never publishes a partial for a non-host participant', async () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.connected = true
    socket.fire('session:state', {
      ...state,
      role: 'GUEST',
      canManage: false,
    })

    const result = live.publishPartial('Texto parcial indevido')

    expect(socket.last('transcript:partial')).toBeUndefined()
    await expect(result).resolves.toEqual({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Somente o anfitrião pode publicar legendas',
      },
    })
  })

  it('cancels an in-flight final ACK immediately when the session ends', async () => {
    vi.useFakeTimers()
    const { socket, live } = setup()
    live.connect('session-1')
    socket.connected = true
    socket.fire('session:state', state)
    const baselineTimers = vi.getTimerCount()

    await live.publishFinal('Final pendente', 100, 200, 0.9, 'pending-final-1')
    await Promise.resolve()
    expect(socket.last('transcript:final')).toBeDefined()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    socket.fire('session:ended', { endedAt: '2026-07-30T11:00:00.000Z' })
    await Promise.resolve()

    expect(live.pendingFinalCount.value).toBe(0)
    expect(vi.getTimerCount()).toBe(baselineTimers)
    expect(live.actionError.value?.code).not.toBe('TRANSCRIPT_DELIVERY_FAILED')
    vi.useRealTimers()
  })

  it('switches to read-only when the session ends', () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', state)
    socket.fire('session:ended', { endedAt: '2026-07-30T11:00:00.000Z' })
    expect(live.ended.value).toBe(true)
    expect(live.session.value?.endedAt).toBe('2026-07-30T11:00:00.000Z')
  })
})
