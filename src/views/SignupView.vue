<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { signUp } from '../api/generated/auth/auth'
import type { UserRole } from '../api/generated/model'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { setSession } = useAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const role = ref<UserRole>('ALUNO')
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (password.value.length < 8) {
    error.value = 'A senha precisa de pelo menos 8 caracteres.'
    return
  }
  loading.value = true
  try {
    const res = await signUp({
      name: name.value,
      email: email.value,
      password: password.value,
      role: role.value,
    })
    setSession(res.accessToken, res.user)
    router.push('/app')
  } catch (e: unknown) {
    error.value = extractError(e, 'Não foi possível criar a conta.')
  } finally {
    loading.value = false
  }
}

function extractError(e: unknown, fallback: string): string {
  const err = e as { response?: { status?: number; data?: { message?: string | string[] } } }
  if (err?.response?.status === 409) return 'Esse e-mail já está cadastrado.'
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
      <h1>Criar conta</h1>
      <p class="sub">Grátis. Aulas ao vivo com transcrição, treino de datilologia e ranking.</p>

      <fieldset class="roles">
        <legend>Como você vai usar o Semantia?</legend>
        <div class="roles__grid">
          <label class="roles__opt" :class="{ on: role === 'ALUNO' }">
            <input v-model="role" type="radio" name="role" value="ALUNO" />
            <strong>Sou aluno</strong>
            <span>Assisto às aulas com legendas ao vivo</span>
          </label>
          <label class="roles__opt" :class="{ on: role === 'PROFESSOR' }">
            <input v-model="role" type="radio" name="role" value="PROFESSOR" />
            <strong>Sou professor</strong>
            <span>Crio turmas e dou aulas transcritas</span>
          </label>
        </div>
      </fieldset>

      <label>
        Nome
        <input v-model="name" type="text" required autocomplete="name" placeholder="Seu nome" />
      </label>
      <label>
        E-mail
        <input v-model="email" type="email" required autocomplete="email" placeholder="voce@email.com" />
      </label>
      <label>
        Senha
        <input v-model="password" type="password" required autocomplete="new-password" placeholder="mínimo 8 caracteres" />
      </label>

      <p v-if="error" class="err" role="alert">{{ error }}</p>

      <button class="btn" type="submit" :disabled="loading">
        {{ loading ? 'Criando…' : 'Criar conta' }}
      </button>

      <p class="alt">
        Já tem conta?
        <RouterLink to="/entrar">Entrar</RouterLink>
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
.roles {
  border: 0;
  padding: 0;
  margin: 0;
}
.roles legend {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-soft);
  margin-bottom: 8px;
}
.roles__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.roles__opt {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 13px;
  border: 1.5px solid var(--line);
  border-radius: 13px;
  background: var(--bg);
  cursor: pointer;
  font-weight: 500;
}
.roles__opt input {
  position: absolute;
  opacity: 0;
  inset: 0;
  cursor: pointer;
}
.roles__opt strong {
  font-size: 14.5px;
  color: var(--ink);
}
.roles__opt span {
  font-size: 12px;
  line-height: 1.35;
  color: var(--muted);
}
.roles__opt.on {
  border-color: var(--blue);
  background: rgba(91, 134, 212, 0.08);
}
.roles__opt:has(input:focus-visible) {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}
@media (max-width: 420px) {
  .roles__grid {
    grid-template-columns: 1fr;
  }
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
