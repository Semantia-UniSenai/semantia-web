import { describe, expect, it, vi } from 'vitest'
import type { SessionDetailDto } from '../api/generated/model'
import type { LiveSocket } from './socket'
import type { AckError, ChatMessage, RaisedHand, SessionState } from './types'
import { useLiveSession, type UseLiveSessionOptions } from './useLiveSession'

const ME_ID = 'user-me'

// O composable usa o useAuth() real (singleton). Mockar o módulo é o caminho
// mais estável: independe de ordem de import/localStorage e cobre também o
// getToken importado por ./socket.
vi.mock('../stores/auth', async () => {
  const { computed, ref } = await import('vue')
  const user = ref({
    id: 'user-me',
    name: 'Eu Mesmo',
    email: 'me@escola.dev',
    role: 'ALUNO',
  })
  const token = ref<string | null>('jwt-mock')
  return {
    useAuth: () => ({
      user,
      token,
      isAuthenticated: computed(() => !!token.value),
      isProfessor: computed(() => false),
      setSession: vi.fn(),
      logout: vi.fn(),
    }),
    getToken: () => token.value,
  }
})

type Handler = (...args: unknown[]) => void

class FakeSocket {
  connected = false
  io = { on: vi.fn() }
  emits: Array<{ event: string; args: unknown[] }> = []
  removeAllListeners = vi.fn(() => this)
  disconnect = vi.fn(() => {
    this.connected = false
    return this
  })

  private handlers = new Map<string, Handler[]>()

  on = (event: string, handler: Handler) => {
    const list = this.handlers.get(event) ?? []
    list.push(handler)
    this.handlers.set(event, list)
    return this
  }

  emit = (event: string, ...args: unknown[]) => {
    this.emits.push({ event, args })
    return this
  }

  /** Dispara os handlers registrados pelo composable (como o servidor faria). */
  fire(event: string, ...args: unknown[]) {
    for (const h of this.handlers.get(event) ?? []) h(...args)
  }

  lastEmit(event: string) {
    return [...this.emits].reverse().find((e) => e.event === event)
  }

  /** Ack (última função) do último emit de um evento — para responder manualmente. */
  lastAck(event: string): ((r: unknown) => void) | undefined {
    const found = this.lastEmit(event)
    const fn = found?.args.filter((a) => typeof a === 'function').at(-1)
    return fn as ((r: unknown) => void) | undefined
  }

  asLiveSocket(): LiveSocket {
    return this as unknown as LiveSocket
  }
}

function makeSession(overrides: Partial<SessionDetailDto> = {}): SessionDetailDto {
  return {
    id: 'sess-1',
    title: 'Aula de Lógica',
    teacherId: 'prof-1',
    classId: null,
    joinToken: 'jt-1',
    status: 'LIVE',
    startedAt: '2026-07-02T10:00:00.000Z',
    endedAt: null,
    teacherName: 'Marina',
    className: null,
    ...overrides,
  }
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session: makeSession(),
    participants: [{ userId: 'prof-1', name: 'Marina', role: 'PROFESSOR' }],
    raisedHands: [],
    chat: [],
    transcript: [],
    ...overrides,
  }
}

function makeHand(userId: string, name = 'Alguém'): RaisedHand {
  return { userId, name, at: '2026-07-02T10:05:00.000Z' }
}

function makeChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    userId: 'user-x',
    name: 'Fulano',
    role: 'ALUNO',
    text: 'oi',
    at: '2026-07-02T10:06:00.000Z',
    ...overrides,
  }
}

function setup(opts: Omit<UseLiveSessionOptions, 'socketFactory'> = {}) {
  const socket = new FakeSocket()
  const live = useLiveSession({ ...opts, socketFactory: () => socket.asLiveSocket() })
  return { socket, live }
}

/** setup + connect + servidor aceitou a conexão. */
function setupConnected(opts: Omit<UseLiveSessionOptions, 'socketFactory'> = {}) {
  const ctx = setup(opts)
  ctx.live.connect('sess-1', 'tok-1')
  ctx.socket.connected = true
  ctx.socket.fire('connect')
  return ctx
}

describe('useLiveSession — conexão e join', () => {
  it("connect deixa status 'connecting' e o evento connect emite session:join", () => {
    const { socket, live } = setup()

    live.connect('sess-1', 'tok-1')
    expect(live.status.value).toBe('connecting')
    expect(socket.lastEmit('session:join')).toBeUndefined()

    socket.fire('connect')
    expect(live.status.value).toBe('connected')

    const join = socket.lastEmit('session:join')
    expect(join).toBeDefined()
    expect(join!.args[0]).toEqual({ sessionId: 'sess-1', token: 'tok-1' })
    expect(typeof join!.args[1]).toBe('function')
  })

  it('ack de join com ok:false seta joinError, vai a offline e desconecta', () => {
    const { socket, live } = setup()
    live.connect('sess-1')
    socket.fire('connect')

    const error: AckError = { code: 'FORBIDDEN', message: 'Sem acesso à sessão' }
    socket.lastAck('session:join')!({ ok: false, error })

    expect(live.joinError.value).toEqual(error)
    expect(live.status.value).toBe('offline')
    expect(socket.disconnect).toHaveBeenCalled()
  })

  it('ack de join ok não mexe em joinError nem status', () => {
    const { socket, live } = setup()
    live.connect('sess-1')
    socket.fire('connect')

    socket.lastAck('session:join')!({ ok: true })

    expect(live.joinError.value).toBeNull()
    expect(live.status.value).toBe('connected')
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it('registra reconnect_attempt no manager (s.io) e ele seta reconnecting', () => {
    const { socket, live } = setupConnected()

    expect(socket.io.on).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function))
    const handler = socket.io.on.mock.calls.find(
      (c) => c[0] === 'reconnect_attempt',
    )![1] as () => void

    handler()
    expect(live.status.value).toBe('reconnecting')
  })

  it("disconnect do socket vira 'reconnecting' quando a aula não terminou", () => {
    const { socket, live } = setupConnected()

    socket.fire('disconnect')
    expect(live.status.value).toBe('reconnecting')
  })

  it('disconnect depois de session:ended NÃO vira reconnecting', () => {
    const { socket, live } = setupConnected()
    socket.fire('session:state', makeState())
    socket.fire('session:ended', { sessionId: 'sess-1', endedAt: '2026-07-02T11:00:00Z' })

    socket.fire('disconnect')
    expect(live.status.value).not.toBe('reconnecting')
  })
})

describe('useLiveSession — session:state', () => {
  it('preenche session/participants/raisedHands/chat/transcript', () => {
    const { socket, live } = setupConnected()
    const state = makeState({
      raisedHands: [makeHand('user-x', 'Fulano')],
      chat: [makeChatMessage()],
      transcript: [{ seq: 1, text: 'Bom dia.', at: '2026-07-02T10:01:00Z' }],
    })

    socket.fire('session:state', state)

    expect(live.session.value).toEqual(state.session)
    expect(live.participants.value).toEqual(state.participants)
    expect(live.raisedHands.value).toEqual(state.raisedHands)
    expect(live.chat.value).toEqual(state.chat)
    expect(live.transcript.value).toEqual(state.transcript)
    expect(live.ended.value).toBe(false)
    expect(live.joinError.value).toBeNull()
  })

  it('ended reflete status ENDED da sessão', () => {
    const { socket, live } = setupConnected()
    socket.fire('session:state', makeState({ session: makeSession({ status: 'ENDED' }) }))
    expect(live.ended.value).toBe(true)
  })

  it('isOwner é true quando o teacherId é o usuário logado', () => {
    const { socket, live } = setupConnected()
    expect(live.isOwner.value).toBe(false)

    socket.fire('session:state', makeState({ session: makeSession({ teacherId: ME_ID }) }))
    expect(live.isOwner.value).toBe(true)
  })
})

describe('useLiveSession — presença', () => {
  it('presence:joined deduplica por userId', () => {
    const { socket, live } = setupConnected()
    socket.fire('session:state', makeState())

    const joined = { user: { userId: 'user-x', name: 'Fulano', role: 'ALUNO' } }
    socket.fire('presence:joined', joined)
    socket.fire('presence:joined', joined)

    expect(live.participants.value.filter((p) => p.userId === 'user-x')).toHaveLength(1)
    expect(live.participants.value).toHaveLength(2)
  })

  it('presence:left remove o participante', () => {
    const { socket, live } = setupConnected()
    socket.fire('session:state', makeState())
    socket.fire('presence:joined', {
      user: { userId: 'user-x', name: 'Fulano', role: 'ALUNO' },
    })

    socket.fire('presence:left', { userId: 'user-x' })

    expect(live.participants.value.some((p) => p.userId === 'user-x')).toBe(false)
    expect(live.participants.value).toHaveLength(1)
  })
})

describe('useLiveSession — transcrição', () => {
  it('transcript:partial seta partialText', () => {
    const { socket, live } = setupConnected()
    socket.fire('transcript:partial', { text: 'em formaç', at: '2026-07-02T10:02:00Z' })
    expect(live.partialText.value).toBe('em formaç')
  })

  it('transcript:final limpa partial, apende e deduplica por seq', () => {
    const { socket, live } = setupConnected()
    socket.fire('transcript:partial', { text: 'em formação', at: '2026-07-02T10:02:00Z' })

    const entry = { seq: 1, text: 'Em formação.', at: '2026-07-02T10:02:01Z' }
    socket.fire('transcript:final', entry)

    expect(live.partialText.value).toBe('')
    expect(live.transcript.value).toEqual([entry])

    // Redelivery do mesmo seq (reconexão) não duplica.
    socket.fire('transcript:final', { ...entry, text: 'duplicada' })
    expect(live.transcript.value).toHaveLength(1)
    expect(live.transcript.value[0]!.text).toBe('Em formação.')

    socket.fire('transcript:final', { seq: 2, text: 'Próxima.', at: '2026-07-02T10:02:05Z' })
    expect(live.transcript.value.map((t) => t.seq)).toEqual([1, 2])
  })
})

describe('useLiveSession — mãos levantadas', () => {
  it('hand:raised apende e chama onHandRaised para mão de OUTRO usuário', () => {
    const onHandRaised = vi.fn()
    const { socket, live } = setupConnected({ onHandRaised })

    const hand = makeHand('user-x', 'Fulano')
    socket.fire('hand:raised', hand)

    expect(live.raisedHands.value).toEqual([hand])
    expect(onHandRaised).toHaveBeenCalledTimes(1)
    expect(onHandRaised).toHaveBeenCalledWith(hand)
  })

  it('hand:raised da PRÓPRIA mão não chama onHandRaised (mas entra na fila)', () => {
    const onHandRaised = vi.fn()
    const { socket, live } = setupConnected({ onHandRaised })

    const mine = makeHand(ME_ID, 'Eu Mesmo')
    socket.fire('hand:raised', mine)

    expect(live.raisedHands.value).toEqual([mine])
    expect(onHandRaised).not.toHaveBeenCalled()
  })

  it('hand:raised duplicada do mesmo usuário não duplica nem reapita', () => {
    const onHandRaised = vi.fn()
    const { socket, live } = setupConnected({ onHandRaised })

    socket.fire('hand:raised', makeHand('user-x'))
    socket.fire('hand:raised', makeHand('user-x'))

    expect(live.raisedHands.value).toHaveLength(1)
    expect(onHandRaised).toHaveBeenCalledTimes(1)
  })

  it('hand:lowered remove e myHandRaised acompanha a própria mão', () => {
    const { socket, live } = setupConnected()
    expect(live.myHandRaised.value).toBe(false)

    socket.fire('hand:raised', makeHand(ME_ID, 'Eu Mesmo'))
    socket.fire('hand:raised', makeHand('user-x', 'Fulano'))
    expect(live.myHandRaised.value).toBe(true)

    socket.fire('hand:lowered', { userId: ME_ID })
    expect(live.myHandRaised.value).toBe(false)
    expect(live.raisedHands.value.map((h) => h.userId)).toEqual(['user-x'])
  })
})

describe('useLiveSession — chat e fim da aula', () => {
  it('chat:message apende', () => {
    const { socket, live } = setupConnected()
    const m1 = makeChatMessage({ id: 'm1', text: 'primeira' })
    const m2 = makeChatMessage({ id: 'm2', text: 'segunda' })

    socket.fire('chat:message', m1)
    socket.fire('chat:message', m2)

    expect(live.chat.value).toEqual([m1, m2])
  })

  it('session:ended seta ended, limpa partial e mãos, e marca a sessão como ENDED', () => {
    const { socket, live } = setupConnected()
    socket.fire('session:state', makeState())
    socket.fire('transcript:partial', { text: 'meio da frase', at: '2026-07-02T10:59:59Z' })
    socket.fire('hand:raised', makeHand('user-x'))

    socket.fire('session:ended', { sessionId: 'sess-1', endedAt: '2026-07-02T11:00:00Z' })

    expect(live.ended.value).toBe(true)
    expect(live.partialText.value).toBe('')
    expect(live.raisedHands.value).toEqual([])
    expect(live.session.value?.status).toBe('ENDED')
  })
})

describe('useLiveSession — ações com ack', () => {
  it('sendChat emite chat:send e resolve null em ack ok', async () => {
    const { socket, live } = setupConnected()

    const p = live.sendChat('minha dúvida')
    expect(socket.lastEmit('chat:send')!.args[0]).toEqual({ text: 'minha dúvida' })

    socket.lastAck('chat:send')!({ ok: true, id: 'm1' })
    await expect(p).resolves.toBeNull()
  })

  it('sendChat resolve o AckError em ack não-ok', async () => {
    const { socket, live } = setupConnected()
    const error: AckError = { code: 'ENDED', message: 'Aula encerrada' }

    const p = live.sendChat('tarde demais')
    socket.lastAck('chat:send')!({ ok: false, error })

    await expect(p).resolves.toEqual(error)
  })

  it('publishFinal / publishPartial emitem transcript:* com o texto', async () => {
    const { socket, live } = setupConnected()

    const pf = live.publishFinal('Frase pronta.')
    expect(socket.lastEmit('transcript:final')!.args[0]).toEqual({ text: 'Frase pronta.' })
    socket.lastAck('transcript:final')!({ ok: true, seq: 7 })
    await expect(pf).resolves.toBeNull()

    const pp = live.publishPartial('metade da fra')
    expect(socket.lastEmit('transcript:partial')!.args[0]).toEqual({ text: 'metade da fra' })
    socket.lastAck('transcript:partial')!({ ok: true })
    await expect(pp).resolves.toBeNull()
  })

  it('raiseHand / lowerHand / endSession emitem só o ack e resolvem o erro', async () => {
    const { socket, live } = setupConnected()

    const raise = live.raiseHand()
    socket.lastAck('hand:raise')!({ ok: true })
    await expect(raise).resolves.toBeNull()

    const lower = live.lowerHand()
    const error: AckError = { code: 'NOT_RAISED', message: 'Mão não estava levantada' }
    socket.lastAck('hand:lower')!({ ok: false, error })
    await expect(lower).resolves.toEqual(error)

    const end = live.endSession()
    socket.lastAck('session:end')!({ ok: true })
    await expect(end).resolves.toBeNull()
  })

  it("sem connect, as ações resolvem { code: 'OFFLINE' }", async () => {
    const { live } = setup()

    await expect(live.sendChat('oi')).resolves.toMatchObject({ code: 'OFFLINE' })
    await expect(live.raiseHand()).resolves.toMatchObject({ code: 'OFFLINE' })
    await expect(live.publishFinal('x')).resolves.toMatchObject({ code: 'OFFLINE' })
    await expect(live.endSession()).resolves.toMatchObject({ code: 'OFFLINE' })
  })
})

describe('useLiveSession — leave', () => {
  it('leave emite session:leave (socket conectado), remove listeners e desconecta', async () => {
    const { socket, live } = setupConnected()

    live.leave()

    expect(socket.lastEmit('session:leave')).toBeDefined()
    expect(socket.removeAllListeners).toHaveBeenCalled()
    expect(socket.disconnect).toHaveBeenCalled()
    // Socket zerado: qualquer ação volta OFFLINE.
    await expect(live.sendChat('depois do leave')).resolves.toMatchObject({
      code: 'OFFLINE',
    })
  })

  it('leave sem socket conectado não emite session:leave, só desconecta', () => {
    const { socket, live } = setup()
    live.connect('sess-1')
    // fire('connect') nunca aconteceu → socket.connected segue false.

    live.leave()

    expect(socket.lastEmit('session:leave')).toBeUndefined()
    expect(socket.disconnect).toHaveBeenCalled()
  })

  it('connect de novo derruba o socket anterior', () => {
    const sockets: FakeSocket[] = []
    const live = useLiveSession({
      socketFactory: () => {
        const s = new FakeSocket()
        sockets.push(s)
        return s.asLiveSocket()
      },
    })

    live.connect('sess-1')
    live.connect('sess-1')

    expect(sockets).toHaveLength(2)
    expect(sockets[0]!.removeAllListeners).toHaveBeenCalled()
    expect(sockets[0]!.disconnect).toHaveBeenCalled()
  })
})
