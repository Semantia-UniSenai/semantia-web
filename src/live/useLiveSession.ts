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
  SessionState,
  TranscriptEntry,
} from './types'

export interface UseLiveSessionOptions {
  socketFactory?: (accessToken?: string | null) => LiveSocket
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
  const ended = computed(() => session.value?.status === 'ENDED')
  const joined = computed(() => !!session.value && status.value === 'connected')
  const currentParticipantId = ref<string | null>(user.value?.id ?? null)

  function connect(sessionId: string, joinToken?: string) {
    disconnect()
    const guest = readGuestAccess(sessionId)
    currentParticipantId.value = user.value?.id ?? guest?.participant.participantId ?? null
    const activeToken = accountToken.value ?? guest?.accessToken ?? null
    const next = socketFactory(activeToken)
    socket.value = next
    status.value = 'connecting'
    joinError.value = null

    next.on('connect', () => {
      status.value = 'connected'
      next.emit(
        'session:join',
        { sessionId, token: joinToken },
        (ack: Ack) => {
          if (!ack.ok) {
            joinError.value = ack.error
            status.value = 'offline'
            next.disconnect()
          }
        },
      )
    })
    next.on('disconnect', () => {
      status.value = 'offline'
    })
    next.on('connect_error', (error: Error) => {
      joinError.value = { code: 'CONNECTION_ERROR', message: error.message }
      status.value = 'offline'
    })
    next.on('session:state', (state: SessionState) => {
      session.value = state.session
      role.value = state.role
      canManage.value = state.canManage
      participants.value = state.participants
      raisedHands.value = state.raisedHands
      chat.value = state.chat
      transcript.value = state.transcript
    })
    next.on('presence:joined', (participant: Participant) => {
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
    next.on('chat:message', (message: ChatMessage) => {
      chat.value = [...chat.value, message]
    })
    next.on('transcript:partial', ({ text }: { text: string }) => {
      partialText.value = text
    })
    next.on('transcript:final', (entry: TranscriptEntry) => {
      partialText.value = ''
      transcript.value = [...transcript.value, entry].sort((a, b) => a.seq - b.seq)
    })
    next.on('session:ended', ({ endedAt }: { endedAt: string }) => {
      if (session.value) {
        session.value = { ...session.value, status: 'ENDED', endedAt }
      }
      partialText.value = ''
    })
    next.connect()
  }

  function emitAck<T>(event: string, payload?: unknown): Promise<Ack<T>> {
    return new Promise((resolve) => {
      const active = socket.value
      if (!active?.connected) {
        resolve({ ok: false, error: { code: 'OFFLINE', message: 'Sem conexão com a sala' } })
        return
      }
      const callback = (ack: Ack<T>) => {
        if (!ack.ok) actionError.value = ack.error
        resolve(ack)
      }
      if (payload === undefined) active.emit(event, callback)
      else active.emit(event, payload, callback)
    })
  }

  const publishPartial = (text: string) => emitAck('transcript:partial', { text })
  const publishFinal = (text: string, startMs: number, endMs?: number, confidence?: number) =>
    emitAck<{ seq: number }>('transcript:final', { text, startMs, endMs, confidence })
  const sendChat = (text: string) => emitAck('chat:send', { text })
  const raiseHand = () => emitAck('hand:raise')
  const lowerHand = () => emitAck('hand:lower')
  const lowerParticipantHand = (participantId: string) =>
    emitAck('hand:lower-for', { participantId })
  const endSession = () => emitAck('session:end')

  function disconnect() {
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
    ended,
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
