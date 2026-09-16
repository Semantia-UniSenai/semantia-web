import { computed, onBeforeUnmount, ref } from 'vue'
import { useAuth } from '../stores/auth'
import { readGuestAccess } from './guestAccess'
import { createLiveSocket, type LiveSocket } from './socket'
import type { BackendAudioSegment } from './useBackendAudioFinalizer'
import type {
  Ack,
  AckError,
  AdmissionEntry,
  ChatMessage,
  LiveSessionDetails,
  MediaCredentials,
  Participant,
  ParticipantRole,
  RaisedHand,
  TranscriptAdaptation,
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
  id?: string
  seq: number
  startMs?: number
  endMs?: number | null
  text: string
  cleaningStrategyVersion?: string
  confidence?: number | null
  createdAt?: string
  at?: string
  adaptation?: TranscriptAdaptation | null
}

interface SocketTranscriptAdaptedEvent {
  segmentId: string
  sessionId: string
  seq: number
  adaptation: TranscriptAdaptation
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
  admissionQueue?: AdmissionEntry[]
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
    ...(entry.id ? { id: entry.id } : {}),
    seq: entry.seq,
    startMs: entry.startMs ?? 0,
    endMs: entry.endMs ?? null,
    text: entry.text,
    cleaningStrategyVersion:
      entry.cleaningStrategyVersion ?? 'legacy-unversioned',
    confidence: entry.confidence ?? null,
    createdAt: entry.createdAt ?? entry.at ?? '',
    ...(entry.adaptation !== undefined
      ? { adaptation: entry.adaptation }
      : {}),
  }
}

interface PendingAudio extends BackendAudioSegment {
  clientSegmentId: string
  attempts: number
  queuedAt: number
}

export interface BackendTranscriptionStatus {
  clientSegmentId: string
  state: 'processing' | 'complete' | 'failed'
  engine?: string | null
  model?: string | null
  inferenceMs?: number | null
  code?: string
}

const AUDIO_RETRY_DELAY_MS = 1_000
const MAX_AUDIO_ATTEMPTS = 3
export const MAX_PENDING_AUDIO = 8
export const MAX_PENDING_AUDIO_AGE_MS = 60_000
const AUDIO_ACK_TIMEOUT_MS = 50_000

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
  const pendingAudioCount = ref(0)
  const transcriptionStatus = ref<BackendTranscriptionStatus | null>(null)
  const admissionQueue = ref<AdmissionEntry[]>([])
  const admissionStatus = ref<'none' | 'waiting' | 'denied'>('none')
  const ended = computed(() => session.value?.status === 'ENDED')
  const canPublishTranscript = computed(() => role.value === 'HOST' && !ended.value)
  const joined = computed(() => !!session.value && status.value === 'connected')
  const currentParticipantId = ref<string | null>(user.value?.id ?? null)
  let joinedSocket = false
  let pendingAudio: PendingAudio[] = []
  let flushingAudio = false
  let audioRetryTimer: ReturnType<typeof setTimeout> | null = null
  let audioExpiryTimer: ReturnType<typeof setTimeout> | null = null
  let audioDrainSucceeded = true
  const pendingAdaptations = new Map<string, TranscriptAdaptation>()
  const audioDrainWaiters: Array<(drained: boolean) => void> = []
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
      if (audioRetryTimer) clearTimeout(audioRetryTimer)
      audioRetryTimer = null
    })
    next.on('connect_error', (error: Error) => {
      joinError.value = { code: 'CONNECTION_ERROR', message: error.message }
      status.value = 'offline'
    })
    next.on('session:state', (state: SocketSessionState) => {
      joinedSocket = true
      admissionStatus.value = 'none'
      session.value = state.session
      role.value = state.self?.role ?? state.role ?? null
      currentParticipantId.value =
        state.self?.participantId ?? currentParticipantId.value
      canManage.value = state.canManage
      participants.value = state.participants
      raisedHands.value = state.raisedHands
      admissionQueue.value = state.admissionQueue ?? []
      chat.value = state.chat.map(normalizeChatMessage)
      transcript.value = state.transcript.map(normalizeTranscriptEntry)
      void flushPendingAudio()
    })
    next.on('admission:waiting', () => {
      admissionStatus.value = 'waiting'
    })
    next.on('admission:denied', () => {
      admissionStatus.value = 'denied'
    })
    next.on('admission:request', (entry: AdmissionEntry) => {
      admissionQueue.value = [
        ...admissionQueue.value.filter((e) => e.admissionId !== entry.admissionId),
        entry,
      ]
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
    next.on('transcript:final', (entry: SocketTranscriptEntry) => {
      const normalized = normalizeTranscriptEntry(entry)
      const pending = normalized.id ? pendingAdaptations.get(normalized.id) : undefined
      const existing = transcript.value.find(
        (item) =>
          (normalized.id && item.id === normalized.id) || item.seq === normalized.seq,
      )
      const adaptation = pending ?? normalized.adaptation ?? existing?.adaptation
      const nextEntry = {
        ...existing,
        ...normalized,
        ...(adaptation !== undefined ? { adaptation } : {}),
      }
      if (normalized.id) pendingAdaptations.delete(normalized.id)
      transcript.value = [
        ...transcript.value.filter(
          (item) =>
            !(
              (normalized.id && item.id === normalized.id) ||
              item.seq === normalized.seq
            ),
        ),
        nextEntry,
      ].sort((a, b) => a.seq - b.seq)
    })
    next.on('transcript:adapted', (event: SocketTranscriptAdaptedEvent) => {
      if (session.value?.id !== event.sessionId) return
      const index = transcript.value.findIndex(
        (item) => item.id === event.segmentId || item.seq === event.seq,
      )
      if (index < 0) {
        const pending = pendingAdaptations.get(event.segmentId)
        if (
          pending &&
          (pending.contextVersion > event.adaptation.contextVersion ||
            (pending.contextVersion === event.adaptation.contextVersion &&
              Date.parse(pending.at) > Date.parse(event.adaptation.at)))
        ) {
          return
        }
        pendingAdaptations.set(event.segmentId, event.adaptation)
        return
      }
      const current = transcript.value[index]?.adaptation
      if (
        current &&
        (current.contextVersion > event.adaptation.contextVersion ||
          (current.contextVersion === event.adaptation.contextVersion &&
            Date.parse(current.at) > Date.parse(event.adaptation.at)))
      ) {
        return
      }
      transcript.value = transcript.value.map((item, itemIndex) =>
        itemIndex === index ? { ...item, adaptation: event.adaptation } : item,
      )
    })
    next.on('transcription:status', (event: BackendTranscriptionStatus) => {
      transcriptionStatus.value = event
    })
    next.on('session:ended', ({ endedAt }: { endedAt: string }) => {
      cancelPendingAcks({ code: 'SESSION_READ_ONLY', message: 'A sala foi encerrada' })
      if (session.value) {
        session.value = { ...session.value, status: 'ENDED', endedAt }
      }
      clearPendingAudio()
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

  function replacePendingAudio(next: PendingAudio[]) {
    pendingAudio = next
    pendingAudioCount.value = next.length
    scheduleAudioExpiry()
    if (next.length === 0 && audioDrainWaiters.length > 0) {
      const drained = audioDrainSucceeded
      audioDrainSucceeded = true
      for (const resolve of audioDrainWaiters.splice(0)) resolve(drained)
    }
  }

  function waitForAudioDrain(): Promise<boolean> {
    if (pendingAudio.length === 0) return Promise.resolve(true)
    return new Promise((resolve) => audioDrainWaiters.push(resolve))
  }

  function scheduleAudioExpiry() {
    if (audioExpiryTimer) clearTimeout(audioExpiryTimer)
    audioExpiryTimer = null
    const first = pendingAudio[0]
    if (!first) return
    const remaining = Math.max(
      0,
      first.queuedAt + MAX_PENDING_AUDIO_AGE_MS - Date.now(),
    )
    audioExpiryTimer = setTimeout(() => {
      audioExpiryTimer = null
      const now = Date.now()
      const retained = pendingAudio.filter(
        (item) => now - item.queuedAt < MAX_PENDING_AUDIO_AGE_MS,
      )
      if (retained.length !== pendingAudio.length) {
        audioDrainSucceeded = false
        replacePendingAudio(retained)
        actionError.value = {
          code: 'AUDIO_EXPIRED',
          message: 'Um áudio temporário expirou antes da reconexão',
        }
        return
      }
      scheduleAudioExpiry()
    }, remaining)
  }

  async function publishAudioSegment(
    segment: BackendAudioSegment,
    requestedClientSegmentId?: string,
  ): Promise<
    Ack<{
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
    if (
      !(segment.pcm16 instanceof ArrayBuffer) ||
      segment.pcm16.byteLength === 0 ||
      segment.pcm16.byteLength % 2 !== 0 ||
      segment.pcm16.byteLength > 960_000 ||
      segment.sampleRate !== 16_000 ||
      segment.durationMs < 250 ||
      segment.durationMs > 30_000
    ) {
      const audioError = {
        code: 'INVALID_AUDIO',
        message: 'O segmento de áudio é inválido',
      }
      actionError.value = audioError
      return { ok: false, error: audioError }
    }
    const clientSegmentId = requestedClientSegmentId || createClientSegmentId()
    if (pendingAudio.some((item) => item.clientSegmentId === clientSegmentId)) {
      return { ok: true, queued: true, clientSegmentId }
    }
    if (pendingAudio.length >= MAX_PENDING_AUDIO) {
      const queueError = {
        code: 'AUDIO_QUEUE_FULL',
        message: 'A fila temporária de áudio atingiu o limite',
      }
      actionError.value = queueError
      return { ok: false, error: queueError }
    }
    if (pendingAudio.length === 0) audioDrainSucceeded = true
    replacePendingAudio([
      ...pendingAudio,
      {
        ...segment,
        clientSegmentId,
        attempts: 0,
        queuedAt: Date.now(),
      },
    ])
    void flushPendingAudio()
    return { ok: true, queued: true, clientSegmentId }
  }

  async function flushPendingAudio() {
    if (
      flushingAudio ||
      !joinedSocket ||
      !socket.value?.connected ||
      ended.value
    ) {
      return
    }
    flushingAudio = true
    try {
      while (pendingAudio.length > 0 && socket.value?.connected && joinedSocket) {
        const current = pendingAudio[0]
        if (!current) break
        if (Date.now() - current.queuedAt >= MAX_PENDING_AUDIO_AGE_MS) {
          audioDrainSucceeded = false
          replacePendingAudio(
            pendingAudio.filter((item) => item.clientSegmentId !== current.clientSegmentId),
          )
          actionError.value = {
            code: 'AUDIO_EXPIRED',
            message: 'Um áudio temporário expirou antes da reconexão',
          }
          continue
        }
        const { attempts: _attempts, queuedAt: _queuedAt, ...payload } = current
        const ack = await emitAck<{
          seq: number | null
          replayed: boolean
          engine: string | null
          model: string | null
          inferenceMs: number | null
        }>('transcription:audio', payload, AUDIO_ACK_TIMEOUT_MS)
        if (
          ended.value ||
          !socket.value?.connected ||
          !joinedSocket ||
          !pendingAudio.some((item) => item.clientSegmentId === current.clientSegmentId)
        ) {
          return
        }
        if (ack.ok) {
          replacePendingAudio(
            pendingAudio.filter((item) => item.clientSegmentId !== current.clientSegmentId),
          )
          continue
        }

        current.attempts += 1
        const retryable = [
          'OFFLINE',
          'ACK_TIMEOUT',
          'ASR_BUSY',
          'ASR_UNAVAILABLE',
        ].includes(ack.error.code)
        if (!retryable || current.attempts >= MAX_AUDIO_ATTEMPTS) {
          audioDrainSucceeded = false
          replacePendingAudio(
            pendingAudio.filter((item) => item.clientSegmentId !== current.clientSegmentId),
          )
          if (retryable) {
            actionError.value = {
              code: 'AUDIO_DELIVERY_FAILED',
              message: 'Não foi possível confirmar o processamento do áudio',
            }
          }
          continue
        }
        scheduleAudioRetry()
        break
      }
    } finally {
      flushingAudio = false
    }
  }

  function scheduleAudioRetry() {
    if (audioRetryTimer) return
    audioRetryTimer = setTimeout(() => {
      audioRetryTimer = null
      void flushPendingAudio()
    }, AUDIO_RETRY_DELAY_MS)
  }

  function clearPendingAudio() {
    if (pendingAudio.length > 0) audioDrainSucceeded = false
    if (audioRetryTimer) clearTimeout(audioRetryTimer)
    audioRetryTimer = null
    if (audioExpiryTimer) clearTimeout(audioExpiryTimer)
    audioExpiryTimer = null
    replacePendingAudio([])
    transcriptionStatus.value = null
  }

  const sendChat = (text: string) => emitAck('chat:send', { text })
  const raiseHand = () => emitAck('hand:raise')
  const lowerHand = () => emitAck('hand:lower')
  const lowerParticipantHand = (participantId: string) =>
    emitAck('hand:lower-for', { participantId })
  const endSession = () => emitAck('session:end')

  function requestMediaCredentials(): Promise<Ack<MediaCredentials>> {
    if (!joinedSocket) {
      const error = {
        code: 'NOT_JOINED',
        message: 'Entre na sala antes de conectar a mídia',
      }
      actionError.value = error
      return Promise.resolve({ ok: false, error })
    }
    return emitAck<MediaCredentials>('media:credentials')
  }

  async function approveAdmission(admissionId: string) {
    const result = await emitAck('admission:approve', { admissionId })
    if (result.ok) {
      admissionQueue.value = admissionQueue.value.filter(
        (e) => e.admissionId !== admissionId,
      )
    }
    return result
  }

  async function rejectAdmission(admissionId: string) {
    const result = await emitAck('admission:reject', { admissionId })
    if (result.ok) {
      admissionQueue.value = admissionQueue.value.filter(
        (e) => e.admissionId !== admissionId,
      )
    }
    return result
  }

  function disconnect() {
    cancelPendingAcks({ code: 'OFFLINE', message: 'Socket desconectado' })
    clearPendingAudio()
    pendingAdaptations.clear()
    joinedSocket = false
    admissionQueue.value = []
    admissionStatus.value = 'none'
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
    pendingAudioCount,
    transcriptionStatus,
    ended,
    canPublishTranscript,
    joined,
    currentParticipantId,
    connect,
    disconnect,
    publishAudioSegment,
    waitForAudioDrain,
    sendChat,
    raiseHand,
    lowerHand,
    lowerParticipantHand,
    endSession,
    requestMediaCredentials,
    admissionQueue,
    admissionStatus,
    approveAdmission,
    rejectAdmission,
  }
}
