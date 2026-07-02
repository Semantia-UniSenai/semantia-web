import { computed, ref } from 'vue'
import type { UserRole } from '../api/generated/model'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
}

const TOKEN_KEY = 'semantia.token'
const USER_KEY = 'semantia.user'

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

// singleton state (módulo carregado uma vez)
const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
const user = ref<AuthUser | null>(readUser())

export function useAuth() {
  const isAuthenticated = computed(() => !!token.value)
  const isProfessor = computed(() => user.value?.role === 'PROFESSOR')

  function setSession(newToken: string, newUser: AuthUser) {
    token.value = newToken
    user.value = newUser
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, isAuthenticated, isProfessor, setSession, logout }
}

export function getToken(): string | null {
  return token.value
}
