<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CaptionStage from '../components/live/CaptionStage.vue'
import LiveIcon from '../components/live/LiveIcon.vue'
import ChatPanel from '../components/live/ChatPanel.vue'
import HandsQueue from '../components/live/HandsQueue.vue'
import MicControl from '../components/live/MicControl.vue'
import { playHandChime } from '../live/chime'
import { stripDisfluencies } from '../live/disfluencies'
import { useLiveSession } from '../live/useLiveSession'
import { useSpeechRecognition } from '../live/useSpeechRecognition'
import { useAuth } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const { user } = useAuth()

const live = useLiveSession({
  onHandRaised: () => {
    // Aviso sonoro só faz sentido para quem OUVE a sala — o professor.
    if (live.isOwner.value) playHandChime()
  },
})

// ── Transcrição (só o professor dono usa) ────────────────────────────────
// Parciais são frequentes; um trailing throttle segura o flood sem perder o
// último estado (o que importa pra legenda é sempre o texto mais recente).
const PARTIAL_THROTTLE_MS = 150
let partialTimer: ReturnType<typeof setTimeout> | null = null
let pendingPartial: string | null = null

function pushPartial(text: string) {
  pendingPartial = text
  if (partialTimer) return
  partialTimer = setTimeout(() => {
    partialTimer = null
    if (pendingPartial !== null) {
      void live.publishPartial(pendingPartial)
      pendingPartial = null
    }
  }, PARTIAL_THROTTLE_MS)
}

const speech = useSpeechRecognition({
  onPartial: pushPartial,
  onFinal: (text) => {
    if (partialTimer) {
      clearTimeout(partialTimer)
      partialTimer = null
      pendingPartial = null
    }
    // Limpa vícios ANTES de publicar: toda a sala (e a persistência) recebe
    // o texto já filtrado. A parcial segue literal — é só o "ao vivo cru".
    const clean = stripDisfluencies(text)
    if (clean) void live.publishFinal(clean)
  },
})

// ── Painel lateral (chat / mãos / pessoas) ───────────────────────────────
type PanelTab = 'chat' | 'hands' | 'people'
const panelOpen = ref(false)
const panelTab = ref<PanelTab>('chat')
const unreadChat = ref(0)

watch(
  () => live.chat.value.length,
  (len, prev) => {
    if (len > (prev ?? 0) && !(panelOpen.value && panelTab.value === 'chat')) {
      unreadChat.value += len - (prev ?? 0)
    }
  },
)

function openPanel(tab: PanelTab) {
  if (panelOpen.value && panelTab.value === tab) {
    panelOpen.value = false
    return
  }
  panelTab.value = tab
  panelOpen.value = true
  if (tab === 'chat') unreadChat.value = 0
}

watch([panelOpen, panelTab], ([open, tab]) => {
  if (open && tab === 'chat') unreadChat.value = 0
})

// ── Ações ────────────────────────────────────────────────────────────────
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copyInvite() {
  const token = live.session.value?.joinToken
  if (!token) return
  await navigator.clipboard.writeText(`${location.origin}/aula/convite/${token}`)
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = false), 2200)
}

async function toggleHand() {
  if (live.myHandRaised.value) await live.lowerHand()
  else await live.raiseHand()
}

const confirmingEnd = ref(false)
async function endClass() {
  if (!confirmingEnd.value) {
    confirmingEnd.value = true
    return
  }
  confirmingEnd.value = false
  speech.stop()
  await live.endSession()
}

function leaveRoom() {
  speech.stop()
  live.leave()
  router.push(back.value)
}

// Professor com turma volta pra turma; resto volta pro hub.
const back = computed(() => {
  const classId = live.session.value?.classId
  return classId ? `/app/turmas/${classId}` : '/app'
})

// ── Ciclo de vida ────────────────────────────────────────────────────────
onMounted(() => {
  const sessionId = String(route.params.id)
  const token = typeof route.query.token === 'string' ? route.query.token : undefined
  live.connect(sessionId, token)
})

watch(live.ended, (ended) => {
  if (ended) speech.stop()
})

onBeforeUnmount(() => {
  if (partialTimer) clearTimeout(partialTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
  speech.stop()
})

const statusLabel = computed(() => {
  if (live.ended.value) return 'Encerrada'
  switch (live.status.value) {
    case 'connected':
      return 'Ao vivo'
    case 'reconnecting':
      return 'Reconectando…'
    case 'offline':
      return 'Desconectado'
    default:
      return 'Conectando…'
  }
})
</script>

<template>
  <div class="room" :class="{ ended: live.ended.value }">
    <!-- Erro de acesso -->
    <div v-if="live.joinError.value" class="room__gate">
      <div class="gate-card" role="alert">
        <h1>Não deu para entrar</h1>
        <p>{{
          live.joinError.value.code === 'FORBIDDEN'
            ? 'Você não tem acesso a esta aula. Peça o link de convite ao professor ou entre na turma antes.'
            : live.joinError.value.code === 'NOT_FOUND'
              ? 'Aula não encontrada. Confira o link com o professor.'
              : live.joinError.value.message
        }}</p>
        <RouterLink class="gate-card__btn" to="/app">Voltar ao início</RouterLink>
      </div>
    </div>

    <template v-else>
      <header class="room__bar">
        <div class="room__info">
          <button
            type="button"
            class="iconbtn"
            aria-label="Sair da aula"
            title="Sair da aula"
            @click="leaveRoom"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M14 6 8 12l6 6"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div class="room__titles">
            <h1>{{ live.session.value?.title ?? 'Carregando…' }}</h1>
            <p v-if="live.session.value">
              {{ live.session.value.className ?? 'Aula avulsa' }} ·
              {{ live.session.value.teacherName }}
            </p>
          </div>
        </div>

        <div class="room__acts">
          <span
            class="status"
            :class="{
              live: statusLabel === 'Ao vivo',
              warn: live.status.value === 'reconnecting',
            }"
          >
            <span class="status__dot" aria-hidden="true"></span>
            {{ statusLabel }}
          </span>

          <button
            v-if="live.isOwner.value && !live.ended.value"
            type="button"
            class="btn btn--ghost"
            @click="copyInvite"
          >
            {{ copied ? 'Link copiado ✓' : 'Copiar convite' }}
          </button>

          <button
            v-if="live.isOwner.value && !live.ended.value"
            type="button"
            class="btn btn--danger"
            @blur="confirmingEnd = false"
            @click="endClass"
          >
            {{ confirmingEnd ? 'Confirmar encerramento?' : 'Encerrar aula' }}
          </button>
        </div>
      </header>

      <div v-if="live.ended.value" class="room__endedbanner" role="status">
        Esta aula foi encerrada. A transcrição continua disponível para leitura.
      </div>

      <main class="room__main" :class="{ 'panel-open': panelOpen }">
        <section class="room__stagecol">
          <MicControl
            v-if="live.isOwner.value"
            class="room__mic"
            :supported="speech.supported"
            :listening="speech.listening.value"
            :error="speech.error.value"
            :disabled="live.ended.value || live.status.value !== 'connected'"
            @start="speech.start"
            @stop="speech.stop"
          />
          <CaptionStage
            :transcript="live.transcript.value"
            :partial-text="live.partialText.value"
          />
        </section>

        <aside v-if="panelOpen" class="room__panel">
          <header class="room__paneltop">
            <h2>
              {{
                panelTab === 'chat'
                  ? 'Chat'
                  : panelTab === 'hands'
                    ? 'Mãos levantadas'
                    : 'Participantes'
              }}
            </h2>
            <button
              type="button"
              class="iconbtn"
              aria-label="Fechar painel"
              @click="panelOpen = false"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="m6 6 12 12M18 6 6 18"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </header>

          <ChatPanel
            v-if="panelTab === 'chat'"
            :messages="live.chat.value"
            :my-user-id="user?.id"
            :disabled="live.ended.value"
            @send="(t) => live.sendChat(t)"
          />
          <HandsQueue v-else-if="panelTab === 'hands'" :hands="live.raisedHands.value" />
          <ul v-else class="people">
            <li v-for="p in live.participants.value" :key="p.userId">
              <span class="people__avatar" aria-hidden="true">{{
                p.name.slice(0, 1).toUpperCase()
              }}</span>
              <span class="people__name">
                {{ p.name }}<em v-if="p.userId === user?.id"> (você)</em>
              </span>
              <span v-if="p.role === 'PROFESSOR'" class="people__badge">Professor</span>
            </li>
          </ul>
        </aside>
      </main>

      <nav class="room__dock" aria-label="Ações da aula">
        <button
          v-if="!live.isOwner.value"
          type="button"
          class="dockbtn dockbtn--hand"
          :class="{ active: live.myHandRaised.value }"
          :disabled="live.ended.value || live.status.value !== 'connected'"
          @click="toggleHand"
        >
          <LiveIcon class="dockbtn__icon" name="hand" />
          <span class="dockbtn__label">{{
            live.myHandRaised.value ? 'Abaixar a mão' : 'Levantar a mão'
          }}</span>
        </button>

        <button
          type="button"
          class="dockbtn"
          :class="{ active: panelOpen && panelTab === 'chat' }"
          @click="openPanel('chat')"
        >
          <LiveIcon class="dockbtn__icon" name="chat" />
          <span class="dockbtn__label">Chat</span>
          <span v-if="unreadChat > 0" class="dockbtn__pill">{{ unreadChat }}</span>
        </button>

        <button
          v-if="live.isOwner.value"
          type="button"
          class="dockbtn"
          :class="{ active: panelOpen && panelTab === 'hands' }"
          @click="openPanel('hands')"
        >
          <LiveIcon class="dockbtn__icon" name="hand" />
          <span class="dockbtn__label">Mãos</span>
          <span v-if="live.raisedHands.value.length > 0" class="dockbtn__pill">
            {{ live.raisedHands.value.length }}
          </span>
        </button>

        <button
          type="button"
          class="dockbtn"
          :class="{ active: panelOpen && panelTab === 'people' }"
          @click="openPanel('people')"
        >
          <LiveIcon class="dockbtn__icon" name="people" />
          <span class="dockbtn__label">Pessoas</span>
          <span class="dockbtn__pill dockbtn__pill--soft">{{
            live.participants.value.length
          }}</span>
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.room {
  display: flex;
  flex-direction: column;
  height: 100svh;
  background: var(--bg);
}

/* ── Barra superior ─────────────────────────────────────────────── */
.room__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.room__info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.room__titles {
  min-width: 0;
}
.room__titles h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 17px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.room__titles p {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.room__acts {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}
.status__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--muted);
}
.status.live {
  color: #b03050;
}
.status.live .status__dot {
  background: #ff5c7a;
  animation: live-pulse 1.6s ease-in-out infinite;
}
.status.warn {
  color: #8a6116;
}
.status.warn .status__dot {
  background: #ffb020;
}
@keyframes live-pulse {
  50% {
    opacity: 0.35;
  }
}

.btn {
  padding: 9px 15px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface);
  font: inherit;
  font-weight: 700;
  font-size: 13.5px;
  color: var(--ink-soft);
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover {
  color: var(--ink);
  border-color: var(--blue);
}
.btn--danger {
  border-color: rgba(216, 79, 107, 0.4);
  color: #b03050;
}
.btn--danger:hover {
  background: rgba(216, 79, 107, 0.08);
  border-color: #d84f6b;
  color: #a12844;
}
.iconbtn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink-soft);
  cursor: pointer;
  flex-shrink: 0;
}
.iconbtn:hover {
  color: var(--ink);
  border-color: var(--blue);
}

/* ── Banner de encerrada ────────────────────────────────────────── */
.room__endedbanner {
  padding: 9px 16px;
  background: rgba(255, 176, 32, 0.12);
  border-bottom: 1px solid rgba(255, 176, 32, 0.35);
  font-size: 13.5px;
  font-weight: 600;
  color: #7a5512;
  text-align: center;
}

/* ── Área principal ─────────────────────────────────────────────── */
.room__main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  padding: 14px 16px;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
}
.room__main.panel-open {
  grid-template-columns: 1fr minmax(300px, 360px);
}
.room__stagecol {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
}
.room__mic {
  flex-shrink: 0;
}
.room__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.room__paneltop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}
.room__paneltop h2 {
  margin: 0;
  font-family: var(--display);
  font-size: 15.5px;
  color: var(--ink);
}
.people {
  list-style: none;
  margin: 0;
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.people li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
}
.people li:hover {
  background: var(--bg-2);
}
.people__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  flex-shrink: 0;
}
.people__name {
  flex: 1;
  min-width: 0;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.people__name em {
  font-style: normal;
  color: var(--muted);
  font-weight: 500;
}
.people__badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

/* ── Dock inferior ──────────────────────────────────────────────── */
.room__dock {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.dockbtn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 18px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
  cursor: pointer;
}
.dockbtn:hover {
  border-color: var(--blue);
  color: var(--ink);
}
.dockbtn.active {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}
.dockbtn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dockbtn--hand.active {
  background: linear-gradient(115deg, var(--purple), var(--blue));
  border-color: transparent;
  color: #fff;
  box-shadow: var(--shadow-brand);
}
.dockbtn__icon {
  flex-shrink: 0;
}
.dockbtn__label {
  white-space: nowrap;
}
.dockbtn__pill {
  display: grid;
  place-items: center;
  min-width: 21px;
  height: 21px;
  padding: 0 6px;
  border-radius: 999px;
  background: #ff5c7a;
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
}
.dockbtn__pill--soft {
  background: var(--bg-2);
  color: var(--ink-soft);
}
.dockbtn.active .dockbtn__pill--soft {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

/* ── Gate de erro ───────────────────────────────────────────────── */
.room__gate {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px;
}
.gate-card {
  max-width: 430px;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 34px 30px;
  box-shadow: var(--shadow-md);
}
.gate-card h1 {
  margin: 0 0 8px;
  font-family: var(--display);
  font-size: 24px;
  color: var(--ink);
}
.gate-card p {
  margin: 0 0 20px;
  font-size: 15px;
  color: var(--ink-soft);
}
.gate-card__btn {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  font-size: 14.5px;
  text-decoration: none;
  box-shadow: var(--shadow-brand);
}

/* ── Responsivo ─────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .room__main.panel-open {
    grid-template-columns: 1fr;
  }
  /* Painel vira sheet sobreposto no mobile. */
  .room__main.panel-open .room__panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: 34svh;
    z-index: 40;
    border-radius: 22px 22px 0 0;
    box-shadow: 0 -18px 50px rgba(28, 34, 48, 0.25);
  }
}
@media (max-width: 640px) {
  .room__bar {
    flex-wrap: wrap;
    padding: 8px 12px;
  }
  .room__acts {
    width: 100%;
    justify-content: space-between;
  }
  .btn {
    padding: 8px 12px;
    font-size: 13px;
  }
  .room__main {
    padding: 10px;
    gap: 10px;
  }
  .dockbtn {
    flex: 1;
    justify-content: center;
    padding: 12px 6px;
    font-size: 13px;
    gap: 6px;
  }
  .room__dock {
    gap: 6px;
    padding-left: 8px;
    /* espaço pro botão flutuante do VLibras não cobrir o último item */
    padding-right: 64px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .status.live .status__dot {
    animation: none;
  }
}
</style>
