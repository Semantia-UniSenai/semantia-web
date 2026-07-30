<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { joinRoom } from '../api/generated/rooms/rooms'
import { useAuth } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const { isAuthenticated } = useAuth()
const code = computed(() => String(route.params.code).toUpperCase())
const joining = ref(false)
const error = ref('')

async function accept() {
  if (!isAuthenticated.value) {
    await router.push({ path: '/entrar', query: { redirect: route.fullPath } })
    return
  }
  joining.value = true
  try {
    const room = await joinRoom({ inviteCode: code.value })
    await router.push(`/app/salas/${room.id}`)
  } catch {
    error.value = 'Este convite não existe ou você não tem autorização para usá-lo.'
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <main class="invite">
    <RouterLink class="brand" to="/">Semantia</RouterLink>
    <section class="card">
      <span class="glyph" aria-hidden="true">↗</span>
      <p class="eyebrow">Convite de sala</p>
      <h1>Você recebeu acesso a uma sala de comunicação</h1>
      <p>Entre para acompanhar sessões, consultar transcripts permitidos e participar conforme as regras do anfitrião.</p>
      <code>{{ code }}</code>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="button" :disabled="joining" @click="accept">{{ joining ? 'Entrando…' : isAuthenticated ? 'Aceitar convite' : 'Entrar para aceitar' }}</button>
      <RouterLink class="alt" to="/app/salas">Ver minhas salas</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.invite{min-height:100svh;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at top,rgba(91,134,212,.16),transparent 48%),var(--bg)}.brand{position:absolute;top:28px;left:32px;color:var(--ink);font:800 20px var(--display);text-decoration:none}.card{width:min(520px,100%);display:flex;flex-direction:column;align-items:center;gap:14px;padding:42px;border:1px solid var(--line);border-radius:24px;background:var(--surface);box-shadow:var(--shadow-md);text-align:center}.glyph{display:grid;place-items:center;width:62px;height:62px;border-radius:20px;background:var(--brand);color:white;font-size:30px}.eyebrow{margin:6px 0 -6px;color:var(--brand)!important;font-size:12px!important;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.card h1{margin:0;font:800 30px/1.12 var(--display)}.card p{margin:0;color:var(--ink-soft);line-height:1.6}code{padding:9px 14px;border-radius:10px;background:var(--bg-2);font-weight:800;letter-spacing:.12em}.card button{width:100%;padding:13px;border:0;border-radius:12px;background:var(--brand);color:#fff;font:700 15px var(--display);cursor:pointer}.alt{color:var(--brand);font-size:13px;font-weight:700}.error{color:#aa352d!important}@media(max-width:520px){.card{padding:30px 22px}.brand{top:18px;left:20px}}
</style>
