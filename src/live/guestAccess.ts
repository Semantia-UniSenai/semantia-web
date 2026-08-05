import type { GuestAccessDto } from '../api/generated/model'

const key = (sessionId: string) => `semantia.guest.${sessionId}`

export function saveGuestAccess(access: GuestAccessDto): void {
  sessionStorage.setItem(key(access.sessionId), JSON.stringify(access))
}

export function readGuestAccess(sessionId: string): GuestAccessDto | null {
  const raw = sessionStorage.getItem(key(sessionId))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as GuestAccessDto
    if (!value.accessToken || !value.participant?.participantId) return null
    return value
  } catch {
    return null
  }
}

export function clearGuestAccess(sessionId: string): void {
  sessionStorage.removeItem(key(sessionId))
}
