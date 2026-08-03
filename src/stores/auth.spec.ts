import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from './auth'

const TOKEN_KEY = 'semantia.token'
const USER_KEY = 'semantia.user'

const account: AuthUser = {
  id: 'user-1',
  name: 'Marina Lima',
  email: 'marina@empresa.dev',
}

async function loadAuth() {
  vi.resetModules()
  return await import('./auth')
}

beforeEach(() => {
  localStorage.clear()
})

describe('useAuth without global roles', () => {
  it('persists only the account identity and token', async () => {
    const { useAuth } = await loadAuth()
    const auth = useAuth()
    auth.setSession('jwt-123', account)
    expect(auth.token.value).toBe('jwt-123')
    expect(auth.user.value).toEqual(account)
    expect(auth.isAuthenticated.value).toBe(true)
    expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toEqual(account)
  })

  it('sanitizes a legacy role stored in the browser', async () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-persistido')
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ ...account, role: 'PROFESSOR' }),
    )
    const { useAuth } = await loadAuth()
    expect(useAuth().user.value).toEqual(account)
    expect(useAuth().user.value).not.toHaveProperty('role')
  })

  it('turns malformed or incomplete stored users into null', async () => {
    localStorage.setItem(USER_KEY, JSON.stringify({ id: account.id }))
    const { useAuth } = await loadAuth()
    expect(useAuth().user.value).toBeNull()
  })

  it('clears refs and storage on logout', async () => {
    const { useAuth } = await loadAuth()
    const auth = useAuth()
    auth.setSession('jwt-123', account)
    auth.logout()
    expect(auth.token.value).toBeNull()
    expect(auth.user.value).toBeNull()
    expect(auth.isAuthenticated.value).toBe(false)
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
  })

  it('exposes the current token outside the composable', async () => {
    const { useAuth, getToken } = await loadAuth()
    const auth = useAuth()
    auth.setSession('jwt-xyz', account)
    expect(getToken()).toBe('jwt-xyz')
  })
})
