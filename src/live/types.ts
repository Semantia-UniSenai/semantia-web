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

export interface LiveSessionDetails {
  id: string
  title: string
  roomId: string
  joinToken: string
  status: SessionStatus
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  roomName: string
  hostId: string
  hostName: string
}

export interface SessionState {
  session: LiveSessionDetails
  role: ParticipantRole
  canManage: boolean
  participants: Participant[]
  raisedHands: RaisedHand[]
  chat: ChatMessage[]
  transcript: TranscriptEntry[]
}

export interface AckError {
  code: string
  message: string
}

export type Ack<T = unknown> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; error: AckError }
