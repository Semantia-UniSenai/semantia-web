<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { signUp } from '../api/generated/auth/auth'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { setSession } = useAuth()
const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (password.value.length < 8) {
    error.value = 'A senha precisa de pelo menos 8 caracteres.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = await signUp({ name: name.value, email: email.value, password: password.value })
    setSession(response.accessToken, response.user)
    await router.push('/app')
  } catch (reason: unknown) {
    const status = (reason as { response?: { status?: number } }).response?.status
    error.value = status === 409 ? 'Esse e-mail já está cadastrado.' : 'Não foi possível criar sua conta.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth">
    <RouterLink class="brand" to="/">Semantia</RouterLink>
    <form class="card" @submit.prevent="submit">
      <p class="eyebrow">Conta do anfitrião</p>
      <h1>Criar conta</h1>
      <p class="sub">Papéis de anfitrião, moderador e participante são definidos dentro de cada sala.</p>
      <label>Nome<input v-model="name" required autocomplete="name" placeholder="Seu nome" /></label>
      <label>E-mail<input v-model="email" required type="email" autocomplete="email" placeholder="voce@empresa.com" /></label>
      <label>Senha<input v-model="password" required type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" /></label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Criando…' : 'Criar conta' }}</button>
      <p class="alt">Já tem conta? <RouterLink to="/entrar">Entrar</RouterLink></p>
    </form>
  </main>
</template>

<style scoped>
.auth{min-height:100svh;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at top,rgba(91,134,212,.13),transparent 48%),var(--bg)}.brand{position:absolute;top:28px;left:32px;color:var(--ink);font:800 20px var(--display);text-decoration:none}.card{width:min(420px,100%);display:grid;gap:15px;padding:36px;border:1px solid var(--line);border-radius:22px;background:var(--surface);box-shadow:var(--shadow-md)}.eyebrow{margin:0;color:var(--brand-ink);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.card h1{margin:-5px 0 0;font:800 32px var(--display)}.sub{margin:-8px 0 4px;color:var(--muted);line-height:1.55}.card label{display:grid;gap:6px;color:var(--ink-soft);font-size:13px;font-weight:700}.card input{padding:13px 14px;border:1px solid var(--field-border);border-radius:11px;background:var(--bg);font:inherit}.card button{padding:13px;border:0;border-radius:12px;background:var(--brand);color:white;font:700 15px var(--display);cursor:pointer}.alt{text-align:center;color:var(--muted);font-size:13px}.alt a{color:var(--brand-ink);font-weight:800}.error{color:#aa352d;font-size:13px}@media(max-width:500px){.card{padding:28px 21px}.brand{top:18px;left:20px}}
</style>
