import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { LiveSocket } from './socket'
import type { AckError, ChatMessage, SessionState, TranscriptEntry } from './types'
import { useLiveSession } from './useLiveSession'

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

  it('hydrates contextual role, permissions and presence', () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', state)
    expect(live.role.value).toBe('HOST')
    expect(live.canManage.value).toBe(true)
    expect(live.participants.value[0]?.participantId).toBe('account-1')
    socket.fire('presence:joined', { participantId: 'guest-1', name: 'Bruno', role: 'GUEST' })
    expect(live.participants.value).toHaveLength(2)
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

  it('switches to read-only when the session ends', () => {
    const { socket, live } = setup()
    live.connect('session-1')
    socket.fire('session:state', state)
    socket.fire('session:ended', { endedAt: '2026-07-30T11:00:00.000Z' })
    expect(live.ended.value).toBe(true)
    expect(live.session.value?.endedAt).toBe('2026-07-30T11:00:00.000Z')
  })
})
