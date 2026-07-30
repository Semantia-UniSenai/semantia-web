<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getRoom,
  removeRoomMember,
  updateRoom,
  updateRoomMemberRole,
} from '../api/generated/rooms/rooms'
import {
  createRoomSession,
  listRoomSessions,
  startSession,
} from '../api/generated/sessions/sessions'
import type { RoomDetailsDto, SessionDto } from '../api/generated/model'
import RoomsHeader from '../components/rooms/RoomsHeader.vue'

const route = useRoute()
const router = useRouter()
const roomId = computed(() => String(route.params.id))
const room = ref<RoomDetailsDto | null>(null)
const sessions = ref<SessionDto[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const title = ref('')
const copied = ref('')
const editingName = ref('')
const canManage = computed(() => room.value?.currentUserRole === 'HOST' || room.value?.currentUserRole === 'MODERATOR')
const isHost = computed(() => room.value?.currentUserRole === 'HOST')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [details, history] = await Promise.all([
      getRoom(roomId.value),
      listRoomSessions(roomId.value),
    ])
    room.value = details
    sessions.value = history
    editingName.value = details.name
  } catch {
    error.value = 'A sala não existe ou você não tem acesso.'
  } finally {
    loading.value = false
  }
}

async function createPreparedSession() {
  const value = title.value.trim()
  if (!value) return
  busy.value = true
  try {
    const created = await createRoomSession(roomId.value, { title: value })
    sessions.value = [created, ...sessions.value]
    title.value = ''
  } catch {
    error.value = 'Não foi possível preparar a sessão.'
  } finally {
    busy.value = false
  }
}

async function start(id: string) {
  busy.value = true
  try {
    const started = await startSession(id)
    sessions.value = sessions.value.map((session) => session.id === id ? started : session)
    await router.push(`/sala/${id}`)
  } catch {
    error.value = 'Não foi possível iniciar a sessão.'
  } finally {
    busy.value = false
  }
}

async function saveName() {
  if (!room.value || editingName.value.trim().length < 2) return
  await updateRoom(room.value.id, { name: editingName.value.trim() })
  await load()
}

async function setRole(userId: string, role: 'MODERATOR' | 'PARTICIPANT') {
  await updateRoomMemberRole(roomId.value, userId, { role })
  await load()
}

async function remove(userId: string) {
  if (!confirm('Remover esta pessoa da sala?')) return
  await removeRoomMember(roomId.value, userId)
  await load()
}

async function copy(value: string, label: string) {
  await navigator.clipboard.writeText(value)
  copied.value = label
  window.setTimeout(() => (copied.value = ''), 1800)
}

function roomInviteLink() {
  return room.value ? `${location.origin}/convite/sala/${room.value.inviteCode}` : ''
}

function sessionInviteLink(token: string) {
  return `${location.origin}/convite/sessao/${token}`
}

function statusLabel(status: SessionDto['status']) {
  return status === 'PREPARING' ? 'Em preparação' : status === 'LIVE' ? 'Ao vivo' : 'Encerrada'
}

onMounted(load)
</script>

<template>
  <div class="page">
    <RoomsHeader back-to="/app/salas" back-label="Salas" />
    <main class="wrap">
      <div v-if="loading" class="state">Carregando sala…</div>
      <div v-else-if="error && !room" class="state state--error">{{ error }}</div>
      <template v-else-if="room">
        <header class="hero">
          <div>
            <span class="role">{{ room.currentUserRole === 'HOST' ? 'Você é anfitrião' : room.currentUserRole === 'MODERATOR' ? 'Você é moderador' : 'Você participa' }}</span>
            <h1>{{ room.name }}</h1>
            <p>Organizada por {{ room.hostName }}</p>
          </div>
          <button class="ghost" type="button" @click="copy(roomInviteLink(), 'room')">
            {{ copied === 'room' ? 'Convite copiado' : 'Copiar convite da sala' }}
          </button>
        </header>

        <p v-if="error" class="alert" role="alert">{{ error }}</p>

        <section v-if="canManage" class="manager-grid">
          <form class="card" @submit.prevent="createPreparedSession">
            <p class="eyebrow">Nova sessão</p>
            <h2>Preparar antes de abrir</h2>
            <p>Defina o título. A plateia só entra depois que você iniciar.</p>
            <label>Título<input v-model="title" required maxlength="160" placeholder="Ex.: Reunião semanal" /></label>
            <button type="submit" :disabled="busy">{{ busy ? 'Preparando…' : 'Criar em preparação' }}</button>
          </form>
          <form class="card card--muted" @submit.prevent="saveName">
            <p class="eyebrow">Configuração</p>
            <h2>Identidade da sala</h2>
            <p>Moderadores também podem atualizar esta configuração.</p>
            <label>Nome<input v-model="editingName" required maxlength="120" /></label>
            <button type="submit">Salvar nome</button>
          </form>
        </section>

        <section class="section">
          <div class="section__head"><div><p class="eyebrow">Histórico</p><h2>Sessões</h2></div><span>{{ sessions.length }}</span></div>
          <p v-if="sessions.length === 0" class="empty">Nenhuma sessão criada nesta sala.</p>
          <ul v-else class="session-list">
            <li v-for="session in sessions" :key="session.id">
              <div><span class="status" :class="`status--${session.status.toLowerCase()}`">{{ statusLabel(session.status) }}</span><h3>{{ session.title }}</h3><time>{{ new Date(session.createdAt).toLocaleString('pt-BR') }}</time></div>
              <div class="row-actions">
                <button v-if="canManage && session.joinToken" class="ghost" type="button" @click="copy(sessionInviteLink(session.joinToken), session.id)">{{ copied === session.id ? 'Link copiado' : 'Copiar link' }}</button>
                <button v-if="canManage && session.status === 'PREPARING'" type="button" :disabled="busy" @click="start(session.id)">Iniciar agora</button>
                <RouterLink v-else-if="session.status !== 'PREPARING'" class="button-link" :to="`/sala/${session.id}`">{{ session.status === 'LIVE' ? 'Entrar' : 'Ler transcript' }}</RouterLink>
              </div>
            </li>
          </ul>
        </section>

        <section class="section">
          <div class="section__head"><div><p class="eyebrow">Acesso contextual</p><h2>Participantes</h2></div><span>{{ room.members.length }}</span></div>
          <p v-if="room.members.length === 0" class="empty">Compartilhe o convite para adicionar participantes.</p>
          <ul v-else class="member-list">
            <li v-for="member in room.members" :key="member.userId">
              <div class="avatar" aria-hidden="true">{{ member.name.charAt(0).toUpperCase() }}</div>
              <div><strong>{{ member.name }}</strong><span>{{ member.email }}</span></div>
              <span class="member-role">{{ member.role === 'MODERATOR' ? 'Moderador' : 'Participante' }}</span>
              <div v-if="isHost" class="row-actions">
                <button class="ghost" type="button" @click="setRole(member.userId, member.role === 'MODERATOR' ? 'PARTICIPANT' : 'MODERATOR')">{{ member.role === 'MODERATOR' ? 'Tornar participante' : 'Tornar moderador' }}</button>
                <button class="danger" type="button" @click="remove(member.userId)">Remover</button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page{min-height:100svh;background:var(--bg)}.wrap{width:min(1060px,calc(100% - 32px));margin:0 auto;padding:48px 0 80px}.hero{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:28px}.hero h1{margin:12px 0 5px;font:800 clamp(32px,5vw,52px)/1 var(--display)}.hero p{margin:0;color:var(--muted)}.role,.status,.member-role{display:inline-flex;padding:6px 10px;border-radius:999px;background:rgba(91,134,212,.12);color:var(--brand);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.manager-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.card,.section{padding:24px;border:1px solid var(--line);border-radius:20px;background:var(--surface);box-shadow:var(--shadow-sm)}.card--muted{background:linear-gradient(145deg,var(--surface),rgba(91,134,212,.06))}.card h2,.section h2{margin:2px 0 7px}.card p{color:var(--muted)}.eyebrow{margin:0;color:var(--brand)!important;font-size:11px!important;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.card label{display:grid;gap:6px;margin-top:18px;color:var(--ink-soft);font-size:13px;font-weight:700}input{padding:12px 14px;border:1px solid var(--line);border-radius:11px;background:var(--bg);font:inherit;color:var(--ink)}button,.button-link{padding:11px 15px;border:0;border-radius:11px;background:var(--brand);color:white;font:700 13px var(--display);cursor:pointer;text-decoration:none}.card>button{width:100%;margin-top:12px}.ghost{border:1px solid var(--line);background:var(--surface);color:var(--ink-soft)}.danger{background:rgba(192,54,44,.1);color:#aa352d}.alert{padding:12px 16px;border-radius:12px;background:rgba(192,54,44,.08);color:#aa352d}.section{margin-top:20px}.section__head{display:flex;justify-content:space-between;align-items:center}.section__head>span{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--bg-2);font-weight:800}.session-list,.member-list{list-style:none;padding:0;margin:18px 0 0}.session-list li,.member-list li{display:flex;align-items:center;gap:14px;padding:16px 0;border-top:1px solid var(--line)}.session-list li:first-child,.member-list li:first-child{border-top:0}.session-list h3{margin:7px 0 2px}.session-list time,.member-list span{color:var(--muted);font-size:12px}.row-actions{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}.status--live{background:rgba(35,160,105,.12);color:#18774f}.status--ended{background:var(--bg-2);color:var(--muted)}.member-list>li>div:nth-child(2){display:grid;gap:3px}.avatar{display:grid!important;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--brand);color:white;font-weight:800}.member-role{margin-left:auto}.member-list .row-actions{margin-left:0}.empty,.state{padding:36px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:16px}.state--error{color:#aa352d}@media(max-width:760px){.manager-grid{grid-template-columns:1fr}.hero,.session-list li,.member-list li{align-items:flex-start;flex-direction:column}.row-actions,.member-role{margin-left:0}.wrap{width:min(100% - 22px,1060px)}}
</style>
