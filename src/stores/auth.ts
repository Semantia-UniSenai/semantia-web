import { computed, ref } from 'vue'

export interface AuthUser {
  id: string
  name: string
  email: string
}

const TOKEN_KEY = 'semantia.token'
const USER_KEY = 'semantia.user'

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (
      typeof value.id !== 'string' ||
      typeof value.name !== 'string' ||
      typeof value.email !== 'string'
    ) {
      return null
    }
    return { id: value.id, name: value.name, email: value.email }
  } catch {
    return null
  }
}

const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
const user = ref<AuthUser | null>(readUser())

export function useAuth() {
  const isAuthenticated = computed(() => !!token.value)

  function setSession(newToken: string, newUser: AuthUser) {
    const sanitized = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
    }
    token.value = newToken
    user.value = sanitized
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(sanitized))
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, isAuthenticated, setSession, logout }
}

export function getToken(): string | null {
  return token.value
}
