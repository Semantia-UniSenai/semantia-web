export function extractApiError(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string | string[] } } }
  const msg = err?.response?.data?.message
  if (Array.isArray(msg)) return msg[0] ?? fallback
  return msg || fallback
}

export function apiErrorStatus(e: unknown): number | undefined {
  const err = e as { response?: { status?: number } }
  return err?.response?.status
}
