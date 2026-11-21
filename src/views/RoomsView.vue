<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createMeeting, listRooms } from '../api/generated/rooms/rooms'
import type { RoomSummaryDto } from '../api/generated/model'
import RoomsHeader from '../components/rooms/RoomsHeader.vue'

const router = useRouter()
const rooms = ref<RoomSummaryDto[]>([])
const loading = ref(true)
const creating = ref(false)
const invite = ref('')
const error = ref('')

const meetings = computed(() => rooms.value.filter((room) => room.meetingId))

async function load() {
  loading.value = true
  error.value = ''
  try {
    rooms.value = await listRooms()
  } catch {
    error.value = 'Não foi possível carregar suas reuniões.'
  } finally {
    loading.value = false
  }
}

async function openMeeting() {
  creating.value = true
  error.value = ''
  try {
    const meeting = await createMeeting({})
    await router.push(`/sala/${meeting.meetingId}`)
  } catch {
    error.value = 'Não foi possível abrir a reunião.'
  } finally {
    creating.value = false
  }
}

async function openInvite() {
  const value = invite.value.trim()
  const token = value.match(/\/convite\/(?:reuniao|sessao)\/([\w-]+)/)?.[1]
    ?? (/^[\w-]{16,}$/.test(value) ? value : '')
  if (!token) {
    error.value = 'Cole um link de convite válido.'
    return
  }
  await router.push(`/convite/reuniao/${token}`)
}

function statusLabel(status: RoomSummaryDto['meetingStatus']) {
  return status === 'LIVE' ? 'Ao vivo' : 'Encerrada'
}

function meetingAction(status: RoomSummaryDto['meetingStatus']) {
  return status === 'LIVE' ? 'Entrar' : 'Ler transcrição'
}

function meetingDate(room: RoomSummaryDto) {
  const value = typeof room.startedAt === 'string' ? room.startedAt : room.createdAt
  return new Date(value).toLocaleString('pt-BR')
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
          <h1>Reuniões simples e instantâneas.</h1>
          <p>Abra a reunião agora, copie o link e convide quem precisa acompanhar a transcrição.</p>
        </div>
        <span class="counter">{{ meetings.length }} {{ meetings.length === 1 ? 'reunião' : 'reuniões' }}</span>
      </header>

      <section class="quick" aria-label="Ações rápidas de reunião">
        <article class="start-card">
          <span class="start-card__icon" aria-hidden="true">＋</span>
          <div>
            <p class="eyebrow">Começar agora</p>
            <h2>Nova reunião</h2>
            <p>Sem configuração prévia. O convite fica disponível assim que você entrar.</p>
          </div>
          <button type="button" :disabled="creating" @click="openMeeting">
            {{ creating ? 'Abrindo…' : 'Nova reunião' }}
          </button>
        </article>

        <form class="invite-card" @submit.prevent="openInvite">
          <div>
            <p class="eyebrow">Recebeu um convite?</p>
            <h2>Entrar em uma reunião</h2>
            <p>Cole o link enviado pelo anfitrião.</p>
          </div>
          <label>
            <span>Link de convite</span>
            <input v-model="invite" required autocomplete="off" placeholder="https://…/convite/reuniao/…" />
          </label>
          <button type="submit">Continuar</button>
        </form>
      </section>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>

      <section class="rooms" aria-labelledby="rooms-title">
        <div class="section-head">
          <div>
            <p class="eyebrow">Acesso rápido</p>
            <h2 id="rooms-title">Reuniões recentes</h2>
          </div>
          <button type="button" @click="load">Atualizar</button>
        </div>
        <div v-if="loading" class="empty">Carregando reuniões…</div>
        <div v-else-if="meetings.length === 0" class="empty">
          <strong>Nenhuma reunião por aqui ainda.</strong>
          <span>Clique em “Nova reunião” para começar imediatamente.</span>
        </div>
        <ul v-else class="grid">
          <li v-for="room in meetings" :key="room.id">
            <RouterLink class="room-card" :to="`/sala/${room.meetingId}`">
              <div class="room-card__top">
                <span class="status" :class="{ 'status--ended': room.meetingStatus === 'ENDED' }">
                  <i aria-hidden="true"></i>{{ statusLabel(room.meetingStatus) }}
                </span>
                <span class="role">{{ room.currentUserRole === 'HOST' ? 'Anfitrião' : room.currentUserRole === 'MODERATOR' ? 'Moderador' : 'Participante' }}</span>
              </div>
              <h3>{{ room.name }}</h3>
              <p>Por {{ room.hostName }}</p>
              <footer>
                <time>{{ meetingDate(room) }}</time>
                <span>{{ meetingAction(room.meetingStatus) }} →</span>
              </footer>
            </RouterLink>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page{min-height:100svh;background:var(--bg)}.wrap{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:54px 0 80px}.hero{display:flex;justify-content:space-between;gap:32px;align-items:end;margin-bottom:30px}.eyebrow{margin:0 0 8px;color:var(--brand-ink);font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:11px}.hero h1{max-width:760px;font:800 clamp(38px,5vw,64px)/.98 var(--display);letter-spacing:-.04em;margin:0}.hero p{max-width:690px;color:var(--ink-soft);font-size:17px;line-height:1.6}.counter,.role{border-radius:999px;padding:7px 11px;background:rgba(91,134,212,.12);color:var(--brand-ink);font-size:11px;font-weight:800;white-space:nowrap}.quick{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.start-card,.invite-card{padding:26px;border:1px solid var(--line);border-radius:22px;background:var(--surface);box-shadow:var(--shadow-sm)}.start-card{display:grid;grid-template-columns:auto 1fr;gap:16px;background:linear-gradient(145deg,var(--surface),rgba(91,134,212,.08))}.start-card__icon{display:grid;place-items:center;width:50px;height:50px;border-radius:15px;background:var(--brand);color:#fff;font-size:28px}.start-card h2,.invite-card h2{margin:0 0 6px;font-size:24px}.start-card p:not(.eyebrow),.invite-card p:not(.eyebrow){margin:0;color:var(--muted);line-height:1.55}.start-card button{grid-column:1/-1;min-height:48px}.invite-card{display:grid;gap:16px}.invite-card label{display:grid;gap:6px;color:var(--ink-soft);font-size:13px;font-weight:700}.invite-card input{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid var(--field-border);border-radius:11px;background:var(--bg);font:inherit;color:var(--ink)}.invite-card input:focus{outline:2px solid var(--blue);outline-offset:1px}.start-card button,.invite-card button{padding:13px 16px;border:0;border-radius:12px;background:var(--brand);color:#fff;font:800 14px var(--display);cursor:pointer}.start-card button:disabled{opacity:.6;cursor:wait}.alert{padding:12px 16px;border:1px solid rgba(192,54,44,.3);border-radius:12px;background:rgba(192,54,44,.07);color:#a9342c}.rooms{margin-top:42px}.section-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:14px}.section-head h2{margin:0;font-size:24px}.section-head button{border:0;background:none;color:var(--brand-ink);font-weight:800;cursor:pointer}.empty{display:flex;min-height:150px;flex-direction:column;align-items:center;justify-content:center;gap:7px;border:1px dashed var(--line);border-radius:18px;color:var(--muted);text-align:center}.empty strong{color:var(--ink)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;list-style:none;margin:0;padding:0}.room-card{display:flex;min-height:170px;flex-direction:column;padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--surface);color:inherit;text-decoration:none;box-shadow:var(--shadow-sm);transition:transform .18s ease,border-color .18s ease}.room-card:hover{transform:translateY(-2px);border-color:rgba(91,134,212,.45)}.room-card__top{display:flex;justify-content:space-between;gap:10px}.status{display:inline-flex;align-items:center;gap:6px;color:#178356;font-size:11px;font-weight:900;text-transform:uppercase}.status i{width:7px;height:7px;border-radius:50%;background:#23a069}.status--ended{color:var(--muted)}.status--ended i{background:#8c96aa}.room-card h3{margin:24px 0 5px;font-size:20px}.room-card p{margin:0;color:var(--muted);font-size:13px}.room-card footer{display:flex;justify-content:space-between;gap:12px;margin-top:auto;padding-top:20px;color:var(--ink-soft);font-size:12px;font-weight:700}.room-card time{font-weight:500;color:var(--muted)}
@media(max-width:850px){.hero{align-items:flex-start;flex-direction:column}.quick{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.wrap{padding-top:34px}.hero h1{font-size:42px}.counter{display:none}.grid{grid-template-columns:1fr}.room-card footer{flex-direction:column}.start-card,.invite-card{padding:21px}}
</style>
