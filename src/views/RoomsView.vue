<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createRoom, joinRoom, listRooms } from '../api/generated/rooms/rooms'
import type { RoomSummaryDto } from '../api/generated/model'
import RoomsHeader from '../components/rooms/RoomsHeader.vue'

const router = useRouter()
const rooms = ref<RoomSummaryDto[]>([])
const loading = ref(true)
const creating = ref(false)
const joining = ref(false)
const roomName = ref('')
const inviteCode = ref('')
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    rooms.value = await listRooms()
  } catch {
    error.value = 'Não foi possível carregar suas salas.'
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  const name = roomName.value.trim()
  if (name.length < 2) return
  creating.value = true
  error.value = ''
  try {
    const room = await createRoom({ name })
    roomName.value = ''
    await router.push(`/app/salas/${room.id}`)
  } catch {
    error.value = 'Não foi possível criar a sala.'
  } finally {
    creating.value = false
  }
}

async function onJoin() {
  const code = inviteCode.value.trim().toUpperCase()
  if (!code) return
  joining.value = true
  error.value = ''
  try {
    const room = await joinRoom({ inviteCode: code })
    await router.push(`/app/salas/${room.id}`)
  } catch {
    error.value = 'Convite inválido, expirado ou sem autorização.'
  } finally {
    joining.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <RoomsHeader back-to="/app" back-label="Início" />
    <main class="wrap">
      <header class="hero">
        <div>
          <p class="eyebrow">Comunicação acessível</p>
          <h1>Suas salas</h1>
          <p>Crie contextos para reuniões, palestras, eventos e encontros com transcrição em tempo real.</p>
        </div>
        <span class="counter">{{ rooms.length }} {{ rooms.length === 1 ? 'sala' : 'salas' }}</span>
      </header>

      <section class="actions" aria-label="Criar ou acessar sala">
        <form class="panel" @submit.prevent="onCreate">
          <span class="panel__icon" aria-hidden="true">＋</span>
          <div>
            <h2>Criar sala</h2>
            <p>Você será o anfitrião e poderá autorizar moderadores.</p>
          </div>
          <label>
            <span>Nome da sala</span>
            <input v-model="roomName" required minlength="2" maxlength="120" placeholder="Ex.: Reunião de planejamento" />
          </label>
          <button type="submit" :disabled="creating">{{ creating ? 'Criando…' : 'Criar sala' }}</button>
        </form>

        <form class="panel panel--soft" @submit.prevent="onJoin">
          <span class="panel__icon" aria-hidden="true">→</span>
          <div>
            <h2>Entrar com código</h2>
            <p>Use o código enviado pelo anfitrião para fazer parte da sala.</p>
          </div>
          <label>
            <span>Código de convite</span>
            <input v-model="inviteCode" required autocomplete="off" placeholder="AB12CD34" />
          </label>
          <button type="submit" :disabled="joining">{{ joining ? 'Verificando…' : 'Entrar na sala' }}</button>
        </form>
      </section>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <section class="rooms" aria-labelledby="rooms-title">
        <div class="section-head">
          <h2 id="rooms-title">Salas acessíveis</h2>
          <button type="button" @click="load">Atualizar</button>
        </div>
        <div v-if="loading" class="empty">Carregando salas…</div>
        <div v-else-if="rooms.length === 0" class="empty">
          <strong>Nenhuma sala por aqui ainda.</strong>
          <span>Crie uma sala ou use um convite para começar.</span>
        </div>
        <ul v-else class="grid">
          <li v-for="room in rooms" :key="room.id">
            <RouterLink class="room-card" :to="`/app/salas/${room.id}`">
              <span class="role">{{ room.currentUserRole === 'HOST' ? 'Anfitrião' : room.currentUserRole === 'MODERATOR' ? 'Moderador' : 'Participante' }}</span>
              <h3>{{ room.name }}</h3>
              <p>Por {{ room.hostName }}</p>
              <footer>
                <span>{{ room.memberCount }} {{ room.memberCount === 1 ? 'participante' : 'participantes' }}</span>
                <span aria-hidden="true">Abrir →</span>
              </footer>
            </RouterLink>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page{min-height:100svh;background:var(--bg)}.wrap{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:54px 0 80px}.hero{display:flex;justify-content:space-between;gap:32px;align-items:end;margin-bottom:30px}.eyebrow{margin:0 0 8px;color:var(--brand);font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:12px}.hero h1{font:800 clamp(34px,5vw,58px)/1 var(--display);margin:0}.hero p{max-width:680px;color:var(--ink-soft);font-size:17px;line-height:1.6}.counter,.role{border-radius:999px;padding:7px 11px;background:rgba(91,134,212,.12);color:var(--brand);font-size:12px;font-weight:800;white-space:nowrap}.actions{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{display:grid;grid-template-columns:auto 1fr;gap:12px 16px;padding:24px;border:1px solid var(--line);border-radius:20px;background:var(--surface);box-shadow:var(--shadow-sm)}.panel--soft{background:linear-gradient(145deg,var(--surface),rgba(91,134,212,.06))}.panel__icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--brand);color:white;font-size:23px}.panel h2{margin:0 0 4px;font-size:20px}.panel p{margin:0;color:var(--muted);font-size:13.5px}.panel label{grid-column:1/-1;display:grid;gap:6px;font-size:13px;font-weight:700;color:var(--ink-soft)}input{padding:13px 14px;border:1px solid var(--line);border-radius:11px;background:var(--bg);font:inherit;color:var(--ink)}input:focus{outline:2px solid var(--blue);outline-offset:1px}.panel button{grid-column:1/-1;padding:12px;border:0;border-radius:11px;background:var(--brand);color:white;font:700 14px var(--display);cursor:pointer}.panel button:disabled{opacity:.55}.alert{padding:12px 16px;border:1px solid rgba(192,54,44,.3);border-radius:12px;background:rgba(192,54,44,.07);color:#a9342c}.rooms{margin-top:40px}.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.section-head h2{font-size:22px}.section-head button{border:0;background:none;color:var(--brand);font-weight:700;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;list-style:none;padding:0}.room-card{display:flex;min-height:185px;flex-direction:column;padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--surface);text-decoration:none;color:var(--ink);transition:.2s}.room-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-md);border-color:rgba(91,134,212,.5)}.room-card .role{align-self:flex-start}.room-card h3{margin:18px 0 6px;font-size:20px}.room-card p{margin:0;color:var(--muted)}.room-card footer{display:flex;justify-content:space-between;gap:8px;margin-top:auto;padding-top:18px;color:var(--ink-soft);font-size:12px}.empty{display:flex;flex-direction:column;gap:5px;align-items:center;padding:46px;border:1px dashed var(--line);border-radius:18px;color:var(--muted)}@media(max-width:800px){.actions,.grid{grid-template-columns:1fr}.hero{align-items:start;flex-direction:column}.counter{display:none}}@media(max-width:520px){.wrap{width:min(100% - 22px,1120px);padding-top:34px}.panel{padding:18px}}
</style>
