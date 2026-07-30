<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  createGuestAccess,
  resolveSessionToken,
} from '../api/generated/sessions/sessions'
import type { ResolvedSessionDto } from '../api/generated/model'
import { saveGuestAccess } from '../live/guestAccess'

const route = useRoute()
const router = useRouter()
const token = computed(() => String(route.params.token))
const session = ref<ResolvedSessionDto | null>(null)
const displayName = ref('')
const loading = ref(true)
const entering = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    session.value = await resolveSessionToken({ token: token.value })
  } catch {
    error.value = 'Este convite não existe, expirou ou a sessão já foi encerrada.'
  } finally {
    loading.value = false
  }
})

async function enter() {
  if (!session.value || displayName.value.trim().length < 2) return
  entering.value = true
  error.value = ''
  try {
    const access = await createGuestAccess({
      joinToken: token.value,
      displayName: displayName.value.trim(),
    })
    saveGuestAccess(access)
    await router.push(`/sala/${access.sessionId}`)
  } catch {
    error.value = 'Não foi possível validar sua entrada. Peça um novo convite.'
  } finally {
    entering.value = false
  }
}
</script>

<template>
  <main class="invite">
    <RouterLink class="brand" to="/">Semantia</RouterLink>
    <section class="card" aria-live="polite">
      <div v-if="loading" class="state">Validando convite…</div>
      <template v-else-if="session">
        <span class="live"><i aria-hidden="true"></i> Sessão ao vivo</span>
        <p class="eyebrow">{{ session.roomName }}</p>
        <h1>{{ session.title }}</h1>
        <p>Entre como participante convidado. Você não precisa criar uma conta.</p>
        <form @submit.prevent="enter">
          <label>Como devemos chamar você?<input v-model="displayName" required minlength="2" maxlength="80" autocomplete="name" placeholder="Seu nome" /></label>
          <button type="submit" :disabled="entering">{{ entering ? 'Validando…' : 'Entrar na sessão' }}</button>
        </form>
      </template>
      <template v-else>
        <span class="expired" aria-hidden="true">×</span>
        <h1>Convite indisponível</h1>
        <p>{{ error }}</p>
        <RouterLink class="button" to="/">Voltar ao início</RouterLink>
      </template>
      <p v-if="session && error" class="error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.invite{min-height:100svh;display:grid;place-items:center;padding:28px;background:linear-gradient(145deg,#12182a,#263354)}.brand{position:absolute;top:28px;left:32px;color:white;font:800 20px var(--display);text-decoration:none}.card{width:min(530px,100%);padding:42px;border:1px solid rgba(255,255,255,.1);border-radius:26px;background:var(--surface);box-shadow:0 32px 90px rgba(0,0,0,.36);text-align:center}.live{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;background:rgba(35,160,105,.12);color:#18774f;font-size:11px;font-weight:800;text-transform:uppercase}.live i{width:7px;height:7px;border-radius:50%;background:#23a069}.eyebrow{margin:24px 0 7px;color:var(--brand);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.card h1{margin:0;font:800 34px/1.1 var(--display)}.card>p{color:var(--ink-soft);line-height:1.6}.card form{display:grid;gap:14px;margin-top:25px;text-align:left}.card label{display:grid;gap:7px;color:var(--ink-soft);font-size:13px;font-weight:700}.card input{padding:13px 14px;border:1px solid var(--line);border-radius:11px;background:var(--bg);font:inherit}.card button,.button{padding:13px;border:0;border-radius:12px;background:var(--brand);color:white;font:700 15px var(--display);text-decoration:none;text-align:center;cursor:pointer}.expired{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 18px;border-radius:18px;background:rgba(192,54,44,.1);color:#aa352d;font-size:34px}.error{color:#aa352d!important}.state{color:var(--muted)}@media(max-width:520px){.card{padding:32px 22px}.brand{top:18px;left:20px}}
</style>
