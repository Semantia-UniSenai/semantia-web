export type ParticipantRole = 'HOST' | 'MODERATOR' | 'PARTICIPANT' | 'GUEST'
export type SessionStatus = 'PREPARING' | 'LIVE' | 'ENDED'

export interface Participant {
  participantId: string
  name: string
  role: ParticipantRole
}

export interface RaisedHand {
  participantId: string
  name: string
  at: string
}

export interface ChatMessage {
  id: string
  participantId: string
  participantName: string
  participantRole: ParticipantRole
  text: string
  createdAt: string
}

export interface TranscriptEntry {
  seq: number
  startMs: number
  endMs?: number | null
  text: string
  confidence?: number | null
  createdAt: string
}

export interface AudienceContext {
  meetingType: string
  ageRange: string
  portugueseFamiliarity: string
  domain: string
  simplificationLevel: string
}

export interface AdmissionEntry {
  admissionId: string
  displayName: string
  isGuest: boolean
  requestedAt: string
}

export interface LiveSessionDetails {
  id: string
  title: string
  roomId: string
  joinToken: string
  status: SessionStatus
  requiresApproval: boolean
  audienceContext: AudienceContext | null
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  roomName: string
  hostId: string
  hostName: string
}

export interface SessionState {
  session: LiveSessionDetails
  self?: Participant & {
    kind?: 'account' | 'guest'
    sessionId?: string
  }
  /** @deprecated Compatibility with pre-envelope gateway fixtures. */
  role?: ParticipantRole
  canManage: boolean
  participants: Participant[]
  raisedHands: RaisedHand[]
  chat: ChatMessage[]
  transcript: TranscriptEntry[]
  admissionQueue?: AdmissionEntry[]
}

export interface AckError {
  code: string
  message: string
}

export type Ack<T = unknown> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; error: AckError }
