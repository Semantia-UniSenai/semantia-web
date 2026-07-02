import type { SessionDetailDto, UserRole } from '../api/generated/model'

/**
 * Tipos do protocolo Socket.IO `/live` — espelham o contrato do LiveGateway
 * da API (ver semantia-api/src/modules/live/live.gateway.ts).
 */

export interface LiveParticipant {
  userId: string
  name: string
  role: UserRole
}

export interface RaisedHand {
  userId: string
  name: string
  at: string
}

export interface ChatMessage {
  id: string
  userId: string
  name: string
  role: UserRole
  text: string
  at: string
}

export interface TranscriptEntry {
  seq: number
  text: string
  at: string
}

export interface SessionState {
  session: SessionDetailDto
  participants: LiveParticipant[]
  raisedHands: RaisedHand[]
  chat: ChatMessage[]
  transcript: TranscriptEntry[]
}

export interface AckError {
  code: string
  message: string
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: AckError }

/** Eventos servidor → cliente. */
export interface ServerToClientEvents {
  'session:state': (state: SessionState) => void
  'session:ended': (payload: { sessionId: string; endedAt: string }) => void
  'presence:joined': (payload: { user: LiveParticipant }) => void
  'presence:left': (payload: { userId: string }) => void
  'transcript:partial': (payload: { text: string; at: string }) => void
  'transcript:final': (payload: TranscriptEntry) => void
  'hand:raised': (payload: RaisedHand) => void
  'hand:lowered': (payload: { userId: string }) => void
  'chat:message': (payload: ChatMessage) => void
  error: (payload: AckError) => void
}

/** Eventos cliente → servidor (todos com ack). */
export interface ClientToServerEvents {
  'session:join': (
    body: { sessionId: string; token?: string },
    ack: (r: Ack) => void,
  ) => void
  'session:leave': (ack: (r: Ack) => void) => void
  'transcript:partial': (body: { text: string }, ack: (r: Ack) => void) => void
  'transcript:final': (
    body: { text: string },
    ack: (r: Ack<{ seq: number }>) => void,
  ) => void
  'hand:raise': (ack: (r: Ack) => void) => void
  'hand:lower': (ack: (r: Ack) => void) => void
  'chat:send': (body: { text: string }, ack: (r: Ack<{ id: string }>) => void) => void
  'session:end': (ack: (r: Ack) => void) => void
}
