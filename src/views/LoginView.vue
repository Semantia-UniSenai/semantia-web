<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { signIn } from '../api/generated/auth/auth'
import { useAuth } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const { setSession } = useAuth()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    const res = await signIn({ email: email.value, password: password.value })
    setSession(res.accessToken, res.user)
    const redirect = (route.query.redirect as string) || '/app'
    router.push(redirect)
  } catch (e: unknown) {
    error.value = extractError(e, 'E-mail ou senha inválidos.')
  } finally {
    loading.value = false
  }
}

function extractError(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string | string[] } } }
  const msg = err?.response?.data?.message
  if (Array.isArray(msg)) return msg[0]
  return msg || fallback
}
</script>

<template>
  <main class="auth">
    <RouterLink class="auth__brand" to="/">
      <img src="/brand/semantia-mark.png" alt="" width="34" height="36" />
      <span>Semantia</span>
    </RouterLink>

    <form class="card" @submit.prevent="onSubmit">
      <h1>Entrar</h1>
      <p class="sub">Gerencie suas salas e acompanhe as sessões de comunicação acessível.</p>

      <label>
        E-mail
        <input v-model="email" type="email" required autocomplete="email" placeholder="voce@email.com" />
      </label>
      <label>
        Senha
        <input v-model="password" type="password" required autocomplete="current-password" placeholder="••••••••" />
      </label>

      <p v-if="error" class="err" role="alert">{{ error }}</p>

      <button class="btn" type="submit" :disabled="loading">
        {{ loading ? 'Entrando…' : 'Entrar' }}
      </button>

      <p class="alt">
        Não tem conta?
        <RouterLink to="/criar-conta">Criar conta</RouterLink>
      </p>
    </form>
  </main>
</template>

<style scoped>
.auth {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 32px 20px;
  background: radial-gradient(60% 50% at 50% 0%, rgba(91, 134, 212, 0.1), transparent 70%), var(--bg);
}
.auth__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  font-family: var(--display);
  font-weight: 800;
  font-size: 20px;
  color: var(--ink);
}
.card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 32px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow-md);
}
.card h1 {
  font-size: 26px;
  font-weight: 800;
}
.sub {
  color: var(--ink-soft);
  font-size: 14.5px;
  margin-top: -6px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-soft);
}
input {
  padding: 12px 14px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--bg);
  font: inherit;
  color: var(--ink);
}
input:focus {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}
.btn {
  margin-top: 6px;
  padding: 13px;
  border: 0;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-family: var(--display);
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  box-shadow: var(--shadow-brand);
}
.btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
.err {
  color: #c0362c;
  font-size: 13.5px;
  font-weight: 600;
}
.alt {
  text-align: center;
  font-size: 14px;
  color: var(--ink-soft);
}
.alt a {
  color: var(--brand);
  font-weight: 700;
}
@media (max-width: 400px) {
  .auth {
    padding: 24px 14px;
  }
  .card {
    padding: 26px 20px;
  }
}
</style>
