import { computed, onBeforeUnmount, ref } from 'vue'
import { useAuth } from '../stores/auth'
import { readGuestAccess } from './guestAccess'
import { createLiveSocket, type LiveSocket } from './socket'
import type {
  Ack,
  AckError,
  ChatMessage,
  LiveSessionDetails,
  Participant,
  ParticipantRole,
  RaisedHand,
  TranscriptEntry,
} from './types'

export interface UseLiveSessionOptions {
  socketFactory?: (accessToken?: string | null) => LiveSocket
}

interface SocketChatMessage {
  id: string
  participantId: string
  participantName?: string
  participantRole?: ParticipantRole
  name?: string
  role?: ParticipantRole
  text: string
  createdAt?: string
  at?: string
}

interface SocketTranscriptEntry {
  seq: number
  startMs?: number
  endMs?: number | null
  text: string
  confidence?: number | null
  createdAt?: string
  at?: string
}

interface SocketSessionState {
  session: LiveSessionDetails
  role?: ParticipantRole
  self?: Participant
  canManage: boolean
  participants: Participant[]
  raisedHands: RaisedHand[]
  chat: SocketChatMessage[]
  transcript: SocketTranscriptEntry[]
}

function normalizeChatMessage(message: SocketChatMessage): ChatMessage {
  return {
    id: message.id,
    participantId: message.participantId,
    participantName: message.participantName ?? message.name ?? 'Participante',
    participantRole: message.participantRole ?? message.role ?? 'PARTICIPANT',
    text: message.text,
    createdAt: message.createdAt ?? message.at ?? '',
  }
}

function normalizeTranscriptEntry(entry: SocketTranscriptEntry): TranscriptEntry {
  return {
    seq: entry.seq,
    startMs: entry.startMs ?? 0,
    endMs: entry.endMs ?? null,
    text: entry.text,
    confidence: entry.confidence ?? null,
    createdAt: entry.createdAt ?? entry.at ?? '',
  }
}

interface PendingFinal {
  text: string
  startMs: number
  endMs?: number
  confidence?: number
  clientSegmentId: string
  attempts: number
  queuedAt: number
}

const FINAL_ACK_TIMEOUT_MS = 5_000
const FINAL_RETRY_DELAY_MS = 1_000
const MAX_FINAL_ATTEMPTS = 3
export const MAX_PENDING_FINALS = 50
export const MAX_PENDING_FINAL_AGE_MS = 120_000

function createClientSegmentId() {
  return globalThis.crypto?.randomUUID?.() ??
    `segment-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useLiveSession(options: UseLiveSessionOptions = {}) {
  const { user, token: accountToken } = useAuth()
  const socketFactory = options.socketFactory ?? createLiveSocket
  const socket = ref<LiveSocket | null>(null)
  const status = ref<'offline' | 'connecting' | 'connected'>('offline')
  const joinError = ref<AckError | null>(null)
  const actionError = ref<AckError | null>(null)
  const session = ref<LiveSessionDetails | null>(null)
  const role = ref<ParticipantRole | null>(null)
  const canManage = ref(false)
  const participants = ref<Participant[]>([])
  const raisedHands = ref<RaisedHand[]>([])
  const chat = ref<ChatMessage[]>([])
  const transcript = ref<TranscriptEntry[]>([])
  const partialText = ref('')
  const pendingFinals = ref<PendingFinal[]>([])
  const pendingFinalCount = computed(() => pendingFinals.value.length)
  const ended = computed(() => session.value?.status === 'ENDED')
  const canPublishTranscript = computed(() => role.value === 'HOST' && !ended.value)
  const joined = computed(() => !!session.value && status.value === 'connected')
  const currentParticipantId = ref<string | null>(user.value?.id ?? null)
  let joinedSocket = false
  let flushingFinals = false
  let finalRetryTimer: ReturnType<typeof setTimeout> | null = null
  const pendingAckCancels = new Set<(error: AckError) => void>()

  function connect(sessionId: string, joinToken?: string) {
    disconnect()
    const guest = readGuestAccess(sessionId)
    currentParticipantId.value = guest?.participant.participantId ?? user.value?.id ?? null
    const activeToken = guest?.accessToken ?? accountToken.value ?? null
    const next = socketFactory(activeToken)
    socket.value = next
    status.value = 'connecting'
    joinError.value = null

    next.on('connect', () => {
      status.value = 'connected'
      joinedSocket = false
      next.emit(
        'session:join',
        { sessionId, token: joinToken },
        (ack: Ack) => {
          if (!ack.ok) {
            joinError.value = ack.error
            status.value = 'offline'
            next.disconnect()
            return
          }
        },
      )
    })
    next.on('disconnect', () => {
      status.value = 'offline'
      joinedSocket = false
      cancelPendingAcks({ code: 'OFFLINE', message: 'Socket desconectado' })
      if (finalRetryTimer) clearTimeout(finalRetryTimer)
      finalRetryTimer = null
    })
    next.on('connect_error', (error: Error) => {
      joinError.value = { code: 'CONNECTION_ERROR', message: error.message }
      status.value = 'offline'
    })
    next.on('session:state', (state: SocketSessionState) => {
      joinedSocket = true
      session.value = state.session
      role.value = state.self?.role ?? state.role ?? null
      currentParticipantId.value =
        state.self?.participantId ?? currentParticipantId.value
      canManage.value = state.canManage
      participants.value = state.participants
      raisedHands.value = state.raisedHands
      chat.value = state.chat.map(normalizeChatMessage)
      transcript.value = state.transcript.map(normalizeTranscriptEntry)
      void flushPendingFinals()
    })
    next.on('presence:joined', (event: Participant | { participant: Participant }) => {
      const participant = 'participant' in event ? event.participant : event
      participants.value = [
        ...participants.value.filter((item) => item.participantId !== participant.participantId),
        participant,
      ]
    })
    next.on('presence:left', ({ participantId }: { participantId: string }) => {
      participants.value = participants.value.filter(
        (participant) => participant.participantId !== participantId,
      )
      raisedHands.value = raisedHands.value.filter(
        (hand) => hand.participantId !== participantId,
      )
    })
    next.on('hand:raised', (hand: RaisedHand) => {
      raisedHands.value = [
        ...raisedHands.value.filter((item) => item.participantId !== hand.participantId),
        hand,
      ]
    })
    next.on('hand:lowered', ({ participantId }: { participantId: string }) => {
      raisedHands.value = raisedHands.value.filter(
        (hand) => hand.participantId !== participantId,
      )
    })
    next.on('chat:message', (message: SocketChatMessage) => {
      chat.value = [...chat.value, normalizeChatMessage(message)]
    })
    next.on('transcript:partial', ({ text }: { text: string }) => {
      partialText.value = text
    })
    next.on('transcript:final', (entry: SocketTranscriptEntry) => {
      partialText.value = ''
      transcript.value = [...transcript.value, normalizeTranscriptEntry(entry)].sort(
        (a, b) => a.seq - b.seq,
      )
    })
    next.on('session:ended', ({ endedAt }: { endedAt: string }) => {
      cancelPendingAcks({ code: 'SESSION_READ_ONLY', message: 'A sala foi encerrada' })
      if (session.value) {
        session.value = { ...session.value, status: 'ENDED', endedAt }
      }
      partialText.value = ''
      clearPendingFinals()
    })
    next.connect()
  }

  function cancelPendingAcks(error: AckError) {
    for (const cancel of [...pendingAckCancels]) cancel(error)
  }

  function emitAck<T>(
    event: string,
    payload?: unknown,
    timeoutMs = 0,
  ): Promise<Ack<T>> {
    return new Promise((resolve) => {
      const active = socket.value
      if (!active?.connected) {
        resolve({ ok: false, error: { code: 'OFFLINE', message: 'Sem conexão com a sala' } })
        return
      }
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      let cancel!: (error: AckError) => void
      const settle = (ack: Ack<T>, reportError = true) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        pendingAckCancels.delete(cancel)
        if (!ack.ok && reportError) actionError.value = ack.error
        resolve(ack)
      }
      cancel = (error: AckError) => {
        settle({ ok: false, error }, false)
      }
      pendingAckCancels.add(cancel)
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          settle(
            {
              ok: false,
              error: {
                code: 'ACK_TIMEOUT',
                message: 'A sala não confirmou o envio a tempo',
              },
            },
            false,
          )
        }, timeoutMs)
      }
      const callback = (ack: Ack<T>) => settle(ack)
      if (payload === undefined) active.emit(event, callback)
      else active.emit(event, payload, callback)
    })
  }

  function publishPartial(text: string): Promise<Ack> {
    if (ended.value) {
      return Promise.resolve({
        ok: false,
        error: { code: 'SESSION_READ_ONLY', message: 'A sala foi encerrada' },
      })
    }
    if (!canPublishTranscript.value) {
      const permissionError = {
        code: 'FORBIDDEN',
        message: 'Somente o anfitrião pode publicar legendas',
      }
      actionError.value = permissionError
      return Promise.resolve({ ok: false, error: permissionError })
    }
    return emitAck('transcript:partial', { text })
  }

  async function publishFinal(
    text: string,
    startMs: number,
    endMs?: number,
    confidence?: number,
    requestedClientSegmentId?: string,
  ): Promise<
    Ack<{
      seq?: number
      replayed?: boolean
      queued?: boolean
      clientSegmentId?: string
    }>
  > {
    if (ended.value) {
      return {
        ok: false,
        error: { code: 'SESSION_READ_ONLY', message: 'A sala foi encerrada' },
      }
    }
    if (!canPublishTranscript.value) {
      const permissionError = {
        code: 'FORBIDDEN',
        message: 'Somente o anfitrião pode publicar legendas',
      }
      actionError.value = permissionError
      return { ok: false, error: permissionError }
    }
    const clientSegmentId = requestedClientSegmentId || createClientSegmentId()
    if (pendingFinals.value.some((item) => item.clientSegmentId === clientSegmentId)) {
      return { ok: true, queued: true, clientSegmentId }
    }
    if (pendingFinals.value.length >= MAX_PENDING_FINALS) {
      const queueError = {
        code: 'TRANSCRIPT_QUEUE_FULL',
        message: 'A fila local de legendas atingiu o limite',
      }
      actionError.value = queueError
      return { ok: false, error: queueError }
    }
    pendingFinals.value = [
      ...pendingFinals.value,
      {
        text,
        startMs,
        endMs,
        confidence,
        clientSegmentId,
        attempts: 0,
        queuedAt: Date.now(),
      },
    ]
    void flushPendingFinals()
    return { ok: true, queued: true, clientSegmentId }
  }

  async function flushPendingFinals() {
    if (
      flushingFinals ||
      !joinedSocket ||
      !socket.value?.connected ||
      ended.value
    ) {
      return
    }
    flushingFinals = true
    try {
      while (pendingFinals.value.length > 0 && socket.value?.connected && joinedSocket) {
        const current = pendingFinals.value[0]
        if (!current) break
        if (Date.now() - current.queuedAt > MAX_PENDING_FINAL_AGE_MS) {
          pendingFinals.value = pendingFinals.value.filter(
            (item) => item.clientSegmentId !== current.clientSegmentId,
          )
          actionError.value = {
            code: 'TRANSCRIPT_EXPIRED',
            message: 'Uma legenda pendente expirou antes da reconexão',
          }
          continue
        }
        const { attempts: _attempts, queuedAt: _queuedAt, ...payload } = current
        const ack = await emitAck<{ seq: number; replayed: boolean }>(
          'transcript:final',
          payload,
          FINAL_ACK_TIMEOUT_MS,
        )
        if (
          ended.value ||
          !socket.value?.connected ||
          !joinedSocket ||
          !pendingFinals.value.some(
            (item) => item.clientSegmentId === current.clientSegmentId,
          )
        ) {
          return
        }
        if (ack.ok) {
          pendingFinals.value = pendingFinals.value.filter(
            (item) => item.clientSegmentId !== current.clientSegmentId,
          )
          continue
        }

        current.attempts += 1
        const retryable = ack.error.code === 'OFFLINE' || ack.error.code === 'ACK_TIMEOUT'
        if (!retryable || current.attempts >= MAX_FINAL_ATTEMPTS) {
          pendingFinals.value = pendingFinals.value.filter(
            (item) => item.clientSegmentId !== current.clientSegmentId,
          )
          if (retryable) {
            actionError.value = {
              code: 'TRANSCRIPT_DELIVERY_FAILED',
              message: 'Não foi possível confirmar o envio da legenda final',
            }
          }
          continue
        }
        scheduleFinalRetry()
        break
      }
    } finally {
      flushingFinals = false
    }
  }

  function scheduleFinalRetry() {
    if (finalRetryTimer) return
    finalRetryTimer = setTimeout(() => {
      finalRetryTimer = null
      void flushPendingFinals()
    }, FINAL_RETRY_DELAY_MS)
  }

  function clearPendingFinals() {
    if (finalRetryTimer) clearTimeout(finalRetryTimer)
    finalRetryTimer = null
    pendingFinals.value = []
  }

  const sendChat = (text: string) => emitAck('chat:send', { text })
  const raiseHand = () => emitAck('hand:raise')
  const lowerHand = () => emitAck('hand:lower')
  const lowerParticipantHand = (participantId: string) =>
    emitAck('hand:lower-for', { participantId })
  const endSession = () => emitAck('session:end')

  function disconnect() {
    cancelPendingAcks({ code: 'OFFLINE', message: 'Socket desconectado' })
    clearPendingFinals()
    joinedSocket = false
    socket.value?.removeAllListeners()
    socket.value?.disconnect()
    socket.value = null
    status.value = 'offline'
  }

  onBeforeUnmount(disconnect)

  return {
    status,
    joinError,
    actionError,
    session,
    role,
    canManage,
    participants,
    raisedHands,
    chat,
    transcript,
    partialText,
    pendingFinalCount,
    ended,
    canPublishTranscript,
    joined,
    currentParticipantId,
    connect,
    disconnect,
    publishPartial,
    publishFinal,
    sendChat,
    raiseHand,
    lowerHand,
    lowerParticipantHand,
    endSession,
  }
}
