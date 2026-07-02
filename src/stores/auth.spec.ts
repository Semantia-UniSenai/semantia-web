import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from './auth'

const TOKEN_KEY = 'semantia.token'
const USER_KEY = 'semantia.user'

const professor: AuthUser = {
  id: 'u-prof',
  name: 'Marina Prof',
  email: 'marina@escola.dev',
  role: 'PROFESSOR',
}

const aluno: AuthUser = {
  id: 'u-aluno',
  name: 'João Aluno',
  email: 'joao@escola.dev',
  role: 'ALUNO',
}

/**
 * O estado do módulo é singleton (refs criadas no load do módulo), então cada
 * teste recarrega o módulo com vi.resetModules + import dinâmico para partir
 * do localStorage corrente.
 */
async function loadAuth() {
  vi.resetModules()
  return await import('./auth')
}

beforeEach(() => {
  localStorage.clear()
})

describe('useAuth', () => {
  it('setSession persiste token e user no localStorage e nos refs', async () => {
    const { useAuth } = await loadAuth()
    const auth = useAuth()

    auth.setSession('jwt-123', professor)

    expect(auth.token.value).toBe('jwt-123')
    expect(auth.user.value).toEqual(professor)
    expect(auth.isAuthenticated.value).toBe(true)
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-123')
    expect(JSON.parse(localStorage.getItem(USER_KEY)!)).toEqual(professor)
  })

  it('hidrata token e user do localStorage no load do módulo', async () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-persistido')
    localStorage.setItem(USER_KEY, JSON.stringify(aluno))

    const { useAuth } = await loadAuth()
    const auth = useAuth()

    expect(auth.token.value).toBe('jwt-persistido')
    expect(auth.user.value).toEqual(aluno)
  })

  it('user corrompido no localStorage vira null (sem explodir)', async () => {
    localStorage.setItem(USER_KEY, '{json quebrado')

    const { useAuth } = await loadAuth()
    expect(useAuth().user.value).toBeNull()
  })

  it('logout limpa refs e localStorage', async () => {
    const { useAuth } = await loadAuth()
    const auth = useAuth()
    auth.setSession('jwt-123', professor)

    auth.logout()

    expect(auth.token.value).toBeNull()
    expect(auth.user.value).toBeNull()
    expect(auth.isAuthenticated.value).toBe(false)
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(USER_KEY)).toBeNull()
  })

  it('isProfessor é true para PROFESSOR e false para ALUNO/deslogado', async () => {
    const { useAuth } = await loadAuth()
    const auth = useAuth()

    expect(auth.isProfessor.value).toBe(false)

    auth.setSession('t', professor)
    expect(auth.isProfessor.value).toBe(true)

    auth.setSession('t', aluno)
    expect(auth.isProfessor.value).toBe(false)
  })

  it('getToken reflete o token corrente (fora do composable)', async () => {
    const { useAuth, getToken } = await loadAuth()
    expect(getToken()).toBeNull()

    const auth = useAuth()
    auth.setSession('jwt-xyz', aluno)
    expect(getToken()).toBe('jwt-xyz')

    auth.logout()
    expect(getToken()).toBeNull()
  })
})
