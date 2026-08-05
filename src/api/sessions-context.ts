import type { SessionDto } from './generated/model'
import { customInstance } from './mutator'

export interface AudienceContext {
  meetingType: 'escola' | 'empresa' | 'palestra' | 'evento' | 'comunidade'
  ageRange: 'criancas' | 'adolescentes' | 'adultos' | 'misto'
  portugueseFamiliarity: 'baixa' | 'media' | 'alta'
  domain: string
  simplificationLevel: 'leve' | 'moderada' | 'alta'
}

export interface SessionWithContext extends SessionDto {
  audienceContext: AudienceContext | null
}

export const updateSessionContext = (
  sessionId: string,
  context: AudienceContext,
): Promise<SessionWithContext> =>
  customInstance({
    url: `/api/sessions/${sessionId}/context`,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    data: context,
  })
