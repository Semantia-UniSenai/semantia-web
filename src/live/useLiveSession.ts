import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import type { SessionDetailDto } from '../api/generated/model'
import { useAuth } from '../stores/auth'
import { createLiveSocket, type LiveSocket } from './socket'
import type {
  Ack,
  AckError,
  ChatMessage,
  LiveParticipant,
  RaisedHand,
  SessionState,
  TranscriptEntry,
} from './types'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface UseLiveSessionOptions {
  /** Chamado quando um aluno levanta a mão (para o professor tocar o aviso sonoro). */
  onHandRaised?: (hand: RaisedHand) => void
  /** Fábrica injetável do socket (para testes). */
  socketFactory?: () => LiveSocket
}

/**
 * Estado reativo da sala ao vivo — um espelho, no cliente, do que o
 * LiveGateway transmite. Toda mutação chega por evento do servidor; as ações
 * locais só emitem e aguardam o ack.
 */
export function useLiveSession(options: UseLiveSessionOptions = {}) {
  const { user } = useAuth()

  const socket = shallowRef<LiveSocket | null>(null)

  const status = ref<ConnectionStatus>('connecting')
  const joinError = ref<AckError | null>(null)
  const session = ref<SessionDetailDto | null>(null)
  const participants = ref<LiveParticipant[]>([])
  const raisedHands = ref<RaisedHand[]>([])
  const chat = ref<ChatMessage[]>([])
  const transcript = ref<TranscriptEntry[]>([])
  const partialText = ref('')
  const ended = ref(false)

  const isOwner = computed(
    () => !!session.value && session.value.teacherId === user.value?.id,
  )
  const myHandRaised = computed(() =>
    raisedHands.value.some((h) => h.userId === user.value?.id),
  )

  function bind(s: LiveSocket, sessionId: string, token?: string) {
    const join = () => {
      s.emit('session:join', { sessionId, token }, (r: Ack) => {
        if (!r.ok) {
          joinError.value = r.error
          status.value = 'offline'
          s.disconnect()
        }
      })
    }

    s.on('connect', () => {
      status.value = 'connected'
      // Rejoin idempotente: cobre tanto a 1ª conexão quanto reconexões
      // (o servidor perde a presença quando o socket cai).
      join()
    })
    s.io.on('reconnect_attempt', () => {
      status.value = 'reconnecting'
    })
    // Middleware de auth do namespace rejeita o handshake com UNAUTHORIZED
    // (token inválido/expirado) — não adianta ficar tentando reconectar.
    s.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') {
        joinError.value = {
          code: 'UNAUTHORIZED',
          message: 'Sua sessão expirou. Entre de novo.',
        }
        status.value = 'offline'
        s.disconnect()
      }
    })
    s.on('disconnect', () => {
      if (!ended.value && status.value !== 'offline') status.value = 'reconnecting'
    })

    s.on('session:state', (state: SessionState) => {
      joinError.value = null
      session.value = state.session
      participants.value = state.participants
      raisedHands.value = state.raisedHands
      chat.value = state.chat
      transcript.value = state.transcript
      ended.value = state.session.status === 'ENDED'
    })

    s.on('presence:joined', ({ user: joined }) => {
      if (!participants.value.some((p) => p.userId === joined.userId)) {
        participants.value = [...participants.value, joined]
      }
    })
    s.on('presence:left', ({ userId }) => {
      participants.value = participants.value.filter((p) => p.userId !== userId)
    })

    s.on('transcript:partial', ({ text }) => {
      partialText.value = text
    })
    s.on('transcript:final', (entry) => {
      // A frase consolidada substitui a parcial em formação.
      partialText.value = ''
      if (!transcript.value.some((t) => t.seq === entry.seq)) {
        transcript.value = [...transcript.value, entry]
      }
    })

    s.on('hand:raised', (hand) => {
      if (!raisedHands.value.some((h) => h.userId === hand.userId)) {
        raisedHands.value = [...raisedHands.value, hand]
        // Só o professor recebe o aviso sonoro; a mão do próprio aluno não apita.
        if (hand.userId !== user.value?.id) options.onHandRaised?.(hand)
      }
    })
    s.on('hand:lowered', ({ userId }) => {
      raisedHands.value = raisedHands.value.filter((h) => h.userId !== userId)
    })

    s.on('chat:message', (message) => {
      chat.value = [...chat.value, message]
    })

    s.on('session:ended', () => {
      ended.value = true
      partialText.value = ''
      raisedHands.value = []
      if (session.value) session.value = { ...session.value, status: 'ENDED' }
    })
  }

  function connect(sessionId: string, token?: string) {
    disconnect()
    status.value = 'connecting'
    joinError.value = null
    ended.value = false
    const s = (options.socketFactory ?? createLiveSocket)()
    socket.value = s
    bind(s, sessionId, token)
  }

  function disconnect() {
    const s = socket.value
    socket.value = null
    if (s) {
      s.removeAllListeners()
      s.disconnect()
    }
  }

  /** Emite com ack e resolve o erro (ou null em sucesso). */
  function emitAck(
    emit: (s: LiveSocket, ack: (r: Ack) => void) => void,
  ): Promise<AckError | null> {
    const s = socket.value
    if (!s) return Promise.resolve({ code: 'OFFLINE', message: 'Sem conexão' })
    return new Promise((resolve) => {
      emit(s, (r) => resolve(r.ok ? null : r.error))
    })
  }

  const publishPartial = (text: string) =>
    emitAck((s, ack) => s.emit('transcript:partial', { text }, ack))
  const publishFinal = (text: string) =>
    emitAck((s, ack) => s.emit('transcript:final', { text }, ack))
  const sendChat = (text: string) =>
    emitAck((s, ack) => s.emit('chat:send', { text }, ack))
  const raiseHand = () => emitAck((s, ack) => s.emit('hand:raise', ack))
  const lowerHand = () => emitAck((s, ack) => s.emit('hand:lower', ack))
  const endSession = () => emitAck((s, ack) => s.emit('session:end', ack))

  function leave() {
    const s = socket.value
    if (s?.connected) s.emit('session:leave', () => {})
    disconnect()
  }

  onBeforeUnmount(leave)

  return {
    status,
    joinError,
    session,
    participants,
    raisedHands,
    chat,
    transcript,
    partialText,
    ended,
    isOwner,
    myHandRaised,
    connect,
    leave,
    publishPartial,
    publishFinal,
    sendChat,
    raiseHand,
    lowerHand,
    endSession,
  }
}
