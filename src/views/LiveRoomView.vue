<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CaptionStage from '../components/live/CaptionStage.vue'
import ChatPanel from '../components/live/ChatPanel.vue'
import MicControl from '../components/live/MicControl.vue'
import { useAudioInputDevices } from '../live/useAudioInputDevices'
import { useLiveSession } from '../live/useLiveSession'
import { useMeetingTranscription } from '../live/useMeetingTranscription'

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => String(route.params.sessionId))
const inviteToken = computed(() => typeof route.query.token === 'string' ? route.query.token : undefined)
const live = useLiveSession()
const copied = ref(false)
const confirmingEnd = ref(false)
type MeetingPanel = 'chat' | 'participants'

const panel = ref<MeetingPanel | null>(null)
const panelCloseButton = ref<HTMLButtonElement | null>(null)
const panelElement = ref<HTMLElement | null>(null)
const chatTrigger = ref<HTMLButtonElement | null>(null)
const participantsTrigger = ref<HTMLButtonElement | null>(null)
const isCompactPanel = ref(false)
let lastPanelTrigger: MeetingPanel = 'chat'
let panelMediaQuery: MediaQueryList | null = null
const startedAt = Date.now()

const audioInput = useAudioInputDevices()
const transcription = useMeetingTranscription({
  deviceId: audioInput.selectedDeviceId,
  onPartial: (text) => void live.publishPartial(text),
  onFinal: (text) => void live.publishFinal(text, Date.now() - startedAt),
})

const backTo = computed(() => '/app/salas')
const myHand = computed(() => live.raisedHands.value.some((hand) => hand.participantId === live.currentParticipantId.value))
const captionState = computed<'available' | 'paused' | 'preparing' | 'listening' | 'reconnecting' | 'ended'>(() => {
  if (live.ended.value) return 'ended'
  if (live.status.value !== 'connected') return 'reconnecting'
  if (transcription.loading.value) return 'preparing'
  if (transcription.listening.value) return 'listening'
  return live.canPublishTranscript.value ? 'paused' : 'available'
})
const meetingStatusLabel = computed(() => {
  if (live.ended.value) return 'Encerrada'
  if (live.status.value === 'connected') return 'Ao vivo'
  return live.session.value ? 'Reconectando' : 'Conectando'
})

onMounted(() => {
  live.connect(sessionId.value, inviteToken.value)
  void audioInput.refresh(false)
  panelMediaQuery = window.matchMedia('(max-width: 1023px)')
  syncPanelMode()
  panelMediaQuery.addEventListener('change', syncPanelMode)
})
onBeforeUnmount(() => panelMediaQuery?.removeEventListener('change', syncPanelMode))
watch(() => live.ended.value, (ended) => {
  if (ended) {
    transcription.stop()
    void audioInput.stopTest()
  }
})

async function startTranscription() {
  await audioInput.stopTest()
  await transcription.start(audioInput.selectedDeviceId.value)
}

async function changeAudioInput(deviceId: string) {
  await audioInput.selectDevice(deviceId)
}

async function copyInvite() {
  const token = live.session.value?.joinToken
  if (!token) return
  await navigator.clipboard.writeText(`${location.origin}/convite/reuniao/${token}`)
  copied.value = true
  window.setTimeout(() => (copied.value = false), 1800)
}

async function end() {
  if (!confirmingEnd.value) {
    confirmingEnd.value = true
    window.setTimeout(() => (confirmingEnd.value = false), 3000)
    return
  }
  transcription.stop()
  await audioInput.stopTest()
  await live.endSession()
  confirmingEnd.value = false
}

function leave() {
  transcription.stop()
  void audioInput.stopTest()
  live.disconnect()
  if (live.role.value === 'GUEST') router.push('/')
  else router.push(backTo.value)
}

async function togglePanel(nextPanel: MeetingPanel) {
  if (panel.value === nextPanel) {
    closePanel()
    return
  }
  lastPanelTrigger = nextPanel
  panel.value = nextPanel
  await nextTick()
  panelCloseButton.value?.focus()
}

function closePanel() {
  if (!panel.value) return
  const trigger = lastPanelTrigger === 'chat' ? chatTrigger.value : participantsTrigger.value
  panel.value = null
  void nextTick(() => trigger?.focus())
}

function syncPanelMode() {
  isCompactPanel.value = panelMediaQuery?.matches ?? false
}

function trapPanelFocus(event: KeyboardEvent) {
  if (!isCompactPanel.value || !panelElement.value) return
  const focusable = Array.from(
    panelElement.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute('aria-hidden') !== 'true')
  if (focusable.length === 0) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <main class="room" :class="{ 'room--panel-open': panel }">
    <a class="skip-link" href="#captions-main">Ir para a legenda</a>
    <header class="topbar" :inert="isCompactPanel && !!panel">
      <button class="back" type="button" aria-label="Sair da reunião" @click="leave">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14.5 5-7 7 7 7M8 12h11"/></svg>
        <span>Sair</span>
      </button>
      <div class="identity">
        <span
          class="status"
          data-testid="meeting-status"
          :class="{ ended: live.ended.value, reconnecting: live.status.value !== 'connected' }"
        ><i></i>{{ meetingStatusLabel }}</span>
        <strong>{{ live.session.value?.title ?? 'Conectando à reunião…' }}</strong>
        <small>{{ live.session.value?.roomName }}</small>
      </div>
      <div class="topbar__actions">
        <button v-if="live.canManage.value && !live.ended.value" class="ghost" type="button" @click="copyInvite">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>
          <span>{{ copied ? 'Link copiado' : 'Convidar' }}</span>
        </button>
        <button
          v-if="live.canManage.value && !live.ended.value"
          class="danger"
          type="button"
          :aria-label="confirmingEnd ? 'Confirmar encerramento' : 'Encerrar reunião'"
          @click="end"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
          <span>{{ confirmingEnd ? 'Confirmar encerramento' : 'Encerrar' }}</span>
        </button>
      </div>
    </header>

    <section v-if="live.joinError.value" class="fatal" role="alert">
      <h1>Não foi possível entrar</h1>
      <p>{{ live.joinError.value.message }}</p>
      <RouterLink :to="backTo">Voltar às reuniões</RouterLink>
    </section>

    <template v-else>
      <div v-if="live.status.value !== 'connected'" class="connecting" role="status">
        {{ live.session.value ? 'Reconectando à reunião segura…' : 'Conectando à reunião segura…' }}
      </div>
      <div v-if="live.ended.value" class="ended-banner" role="status">Reunião encerrada. O conteúdo está disponível somente para leitura conforme a retenção configurada.</div>

      <div class="workspace" :class="{ 'workspace--panel-open': panel }">
        <section
          id="captions-main"
          class="stage"
          aria-label="Legenda da reunião"
          tabindex="-1"
          :inert="isCompactPanel && !!panel"
        >
          <CaptionStage
            :transcript="live.transcript.value"
            :partial-text="live.partialText.value"
            :caption-state="captionState"
          />
        </section>

        <button
          v-if="panel && isCompactPanel"
          class="panel-backdrop"
          type="button"
          aria-label="Fechar painel da reunião"
          @click="closePanel"
        ></button>

        <aside
          ref="panelElement"
          v-if="panel"
          id="meeting-panel"
          class="side"
          data-testid="meeting-panel"
          :role="isCompactPanel ? 'dialog' : 'complementary'"
          :aria-modal="isCompactPanel ? 'true' : undefined"
          aria-labelledby="meeting-panel-title"
          @keydown.esc.stop="closePanel"
          @keydown.tab="trapPanelFocus"
        >
          <header class="side__header">
            <div>
              <span>{{ panel === 'chat' ? 'Conversa' : 'Presença' }}</span>
              <h2 id="meeting-panel-title">{{ panel === 'chat' ? 'Chat da reunião' : 'Pessoas na reunião' }}</h2>
            </div>
            <button ref="panelCloseButton" type="button" aria-label="Fechar painel" @click="closePanel">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </header>
          <ChatPanel v-if="panel === 'chat'" :messages="live.chat.value" :my-participant-id="live.currentParticipantId.value ?? undefined" :disabled="live.ended.value" @send="live.sendChat" />
          <div v-else class="people">
            <article v-for="participant in live.participants.value" :key="participant.participantId">
              <span class="avatar">{{ participant.name.charAt(0).toUpperCase() }}</span>
              <div><strong>{{ participant.participantId === live.currentParticipantId.value ? 'Você' : participant.name }}</strong><small>{{ participant.role === 'HOST' ? 'Anfitrião' : participant.role === 'MODERATOR' ? 'Moderador' : participant.role === 'GUEST' ? 'Convidado' : 'Participante' }}</small></div>
              <button v-if="live.canManage.value && live.raisedHands.value.some((hand) => hand.participantId === participant.participantId)" type="button" @click="live.lowerParticipantHand(participant.participantId)">✋ Baixar</button>
              <span v-else-if="live.raisedHands.value.some((hand) => hand.participantId === participant.participantId)" class="raised">✋</span>
            </article>
          </div>
        </aside>
      </div>

      <nav
        class="control-bar"
        aria-label="Controles da reunião"
        :inert="isCompactPanel && !!panel"
      >
        <MicControl
          v-if="live.canPublishTranscript.value"
          class="mic"
          :supported="transcription.supported"
          :listening="transcription.listening.value"
          :loading="transcription.loading.value"
          :error="transcription.error.value"
          :local-engine="transcription.engine.value === 'local'"
          :input-state="transcription.inputState.value"
          :audio-level="transcription.audioLevel.value"
          :transport="transcription.transport.value ?? undefined"
          :has-hypothesis="transcription.hasHypothesis.value"
          :quality-status="transcription.qualityStatus.value"
          :quality-progress="transcription.qualityProgress.value"
          :audio-devices-supported="audioInput.supported"
          :audio-devices="audioInput.devices.value"
          :selected-device-id="audioInput.selectedDeviceId.value"
          :audio-devices-loading="audioInput.loading.value"
          :audio-device-error="audioInput.error.value"
          :microphone-test-state="audioInput.testState.value"
          :microphone-test-level="audioInput.testLevel.value"
          :disabled="live.ended.value"
          @start="startTranscription"
          @stop="transcription.stop"
          @refresh-audio-devices="audioInput.refresh"
          @select-audio-device="changeAudioInput"
          @start-microphone-test="audioInput.startTest"
          @stop-microphone-test="audioInput.stopTest"
        />
        <button
          v-if="!live.canManage.value && !live.ended.value"
          class="hand meeting-control"
          :class="{ active: myHand }"
          type="button"
          :aria-pressed="myHand"
          @click="myHand ? live.lowerHand() : live.raiseHand()"
        >
          <span class="control-icon" aria-hidden="true">✋</span>
          <span class="control-copy"><strong>{{ myHand ? 'Baixar mão' : 'Levantar mão' }}</strong><small>{{ myHand ? 'Sinal ativo' : 'Pedir a palavra' }}</small></span>
        </button>
        <button
          ref="chatTrigger"
          class="meeting-control"
          type="button"
          aria-controls="meeting-panel"
          :aria-expanded="panel === 'chat'"
          @click="togglePanel('chat')"
        >
          <span class="control-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5Z"/></svg></span>
          <span class="control-copy"><strong>Chat</strong><small>{{ live.chat.value.length }} {{ live.chat.value.length === 1 ? 'mensagem' : 'mensagens' }}</small></span>
        </button>
        <button
          ref="participantsTrigger"
          class="meeting-control"
          type="button"
          aria-controls="meeting-panel"
          :aria-expanded="panel === 'participants'"
          @click="togglePanel('participants')"
        >
          <span class="control-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75"/></svg></span>
          <span class="control-copy"><strong>Pessoas</strong><small>{{ live.participants.value.length }} na reunião</small></span>
        </button>
      </nav>
    </template>
  </main>
</template>

<style scoped>
.room{min-height:100svh;background:#111728;color:#eef2ff}.topbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;min-height:72px;padding:10px 20px;border-bottom:1px solid rgba(255,255,255,.1);background:#161e32}.back,.ghost,.danger{justify-self:start;padding:9px 13px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:transparent;color:#dce4fa;font:700 12px var(--display);cursor:pointer}.identity{display:grid;justify-items:center;gap:2px}.identity strong{font:700 15px var(--display)}.identity small{color:#8895b3}.status{display:flex;align-items:center;gap:6px;color:#54dda3;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.status i{width:7px;height:7px;border-radius:50%;background:#46d795}.status.ended{color:#aab3c7}.status.ended i{background:#78839d}.topbar__actions{display:flex;justify-content:flex-end;gap:8px}.topbar__actions .ghost,.topbar__actions .danger{justify-self:auto}.danger{border-color:rgba(231,88,110,.35);color:#ff9aac}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 340px;height:calc(100svh - 72px);min-height:0}.stage{position:relative;display:flex;min-width:0;min-height:0;overflow-y:auto;flex-direction:column;padding:24px}.stage>:first-child{flex:1;min-height:180px}.mic{margin-top:18px}.hand{align-self:center;margin-top:18px;padding:13px 20px;border:1px solid rgba(255,255,255,.15);border-radius:13px;background:#25314f;color:white;font:700 14px var(--display);cursor:pointer}.hand.active{background:#d99a27}.side{display:flex;min-height:0;flex-direction:column;border-left:1px solid rgba(255,255,255,.1);background:#f8f9fc;color:var(--ink)}.side nav{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--line)}.side nav button{padding:15px;border:0;background:transparent;color:var(--muted);font-weight:800;cursor:pointer}.side nav button.active{color:var(--brand);box-shadow:inset 0 -2px var(--brand)}.side nav span{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:4px;border-radius:999px;background:var(--bg-2);font-size:10px}.people{overflow:auto;padding:12px}.people article{display:flex;align-items:center;gap:10px;padding:11px;border-bottom:1px solid var(--line)}.people article>div{display:grid;gap:2px}.people small{color:var(--muted)}.avatar{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--brand);color:white;font-weight:800}.people button{margin-left:auto;padding:6px 8px;border:0;border-radius:8px;background:rgba(217,154,39,.13);color:#8b5d0d;font-weight:700;cursor:pointer}.raised{margin-left:auto}.ended-banner,.connecting{padding:10px;text-align:center;background:#283654;color:#cbd5eb;font-size:13px}.ended-banner{background:#3a3040;color:#f2d6df}.fatal{width:min(500px,calc(100% - 32px));margin:100px auto;padding:35px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:#1b243a;text-align:center}.fatal a{color:#80a7f1}@media(max-width:900px){.topbar{grid-template-columns:auto 1fr}.identity{justify-items:start}.topbar__actions{grid-column:1/-1}.workspace{grid-template-columns:1fr}.side{min-height:420px;border-top:1px solid rgba(255,255,255,.1);border-left:0}}@media(max-width:560px){.topbar{padding:10px}.identity strong{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stage{padding:12px}.topbar__actions{overflow:auto}}

/* Variante A — palco central acessível. Regras finais sobrescrevem o layout legado acima. */
.room {
  --meeting-bg: #080d19;
  --meeting-surface: #11192a;
  --meeting-surface-raised: #172238;
  --meeting-border: rgba(202, 216, 244, 0.14);
  --meeting-text: #f4f7ff;
  --meeting-muted: #9eabc4;
  position: relative;
  display: grid;
  grid-template-rows: 68px minmax(0, 1fr) auto;
  height: 100svh;
  min-height: 100svh;
  overflow: hidden;
  color: var(--meeting-text);
  background:
    radial-gradient(circle at 50% 10%, rgba(91, 134, 212, 0.13), transparent 34%),
    var(--meeting-bg);
}
.room svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.topbar {
  grid-row: 1;
  min-height: 68px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--meeting-border);
  background: rgba(8, 13, 25, 0.88);
  backdrop-filter: blur(18px);
}
.back,
.ghost,
.danger {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 13px;
  border-color: var(--meeting-border);
  border-radius: 13px;
  color: var(--meeting-text);
  background: rgba(255, 255, 255, 0.035);
  font: 750 12px var(--body);
  transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
}
.back:hover,
.ghost:hover {
  border-color: rgba(117, 158, 231, 0.45);
  background: rgba(117, 158, 231, 0.1);
}
.back:active,
.ghost:active,
.danger:active,
.meeting-control:active {
  transform: translateY(1px);
}
.danger {
  border-color: rgba(255, 110, 139, 0.34);
  color: #ffb2c1;
  background: rgba(255, 110, 139, 0.08);
}
.danger:hover {
  border-color: rgba(255, 110, 139, 0.65);
  background: rgba(255, 110, 139, 0.15);
}
.identity {
  min-width: 0;
  gap: 1px;
}
.identity strong {
  max-width: min(46vw, 560px);
  overflow: hidden;
  color: var(--meeting-text);
  font: 700 14px var(--display);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identity small {
  max-width: min(42vw, 500px);
  overflow: hidden;
  color: var(--meeting-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status {
  color: #6ce1b2;
  font-size: 9px;
}
.status.reconnecting {
  color: #ffd188;
}
.status.reconnecting i {
  background: #eeb65d;
  animation: meeting-pulse 1.5s ease-in-out infinite;
}
.topbar__actions {
  min-width: 0;
  align-items: center;
}
.workspace {
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  width: 100%;
  height: auto;
  min-height: 0;
  padding: 16px 18px 10px;
  overflow: hidden;
}
.workspace--panel-open {
  grid-template-columns: minmax(0, 1fr) minmax(340px, 398px);
}
.stage {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
.stage > :first-child {
  flex: 1;
  min-height: 0;
}
.side {
  position: relative;
  z-index: 12;
  grid-column: 2;
  width: auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #dce2ed;
  border-radius: 22px;
  background: #f7f8fb;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.26);
}
.side__header {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 13px 20px;
  border-bottom: 1px solid #dce2ed;
  background: #fff;
}
.side__header > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.side__header span {
  color: #758096;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.side__header h2 {
  overflow: hidden;
  color: #192234;
  font: 700 17px var(--display);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side__header button {
  width: 44px;
  min-width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid #d9deea;
  border-radius: 13px;
  color: #4c5669;
  background: #f5f7fa;
  cursor: pointer;
}
.people {
  gap: 1px;
  padding: 8px;
  overflow-y: auto;
  background: #edf0f5;
}
.people article {
  min-height: 62px;
  padding: 10px 11px;
  border: 0;
  border-radius: 13px;
  background: #fff;
}
.avatar {
  width: 38px;
  height: 38px;
  color: #10232f;
  background: linear-gradient(135deg, #7bd5d8, #90aeea);
}
.control-bar {
  position: relative;
  z-index: 10;
  grid-row: 3;
  width: max-content;
  max-width: calc(100vw - 24px);
  min-height: 70px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 7px;
  margin: 0 auto max(10px, env(safe-area-inset-bottom));
  padding: 7px;
  overflow: visible;
  border: 1px solid var(--meeting-border);
  border-radius: 22px;
  background: rgba(17, 25, 42, 0.94);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(20px);
}
.meeting-control,
.hand.meeting-control {
  min-width: 112px;
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: 9px;
  align-self: auto;
  margin: 0;
  padding: 6px 10px 6px 6px;
  border: 1px solid transparent;
  border-radius: 16px;
  color: var(--meeting-text);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
}
.meeting-control:hover,
.meeting-control[aria-expanded='true'],
.meeting-control[aria-pressed='true'] {
  border-color: var(--meeting-border);
  background: var(--meeting-surface-raised);
}
.control-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #dce5fa;
  background: rgba(255, 255, 255, 0.065);
  font-size: 19px;
}
.control-copy {
  min-width: 0;
  display: grid;
  gap: 1px;
}
.control-copy strong,
.control-copy small {
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.control-copy strong {
  color: var(--meeting-text);
  font-size: 12px;
}
.control-copy small {
  color: var(--meeting-muted);
  font-size: 9px;
  font-weight: 650;
}
.control-bar .mic {
  min-width: 0;
  margin: 0;
}
.control-bar :deep(.mic__controls) {
  gap: 7px;
}
.control-bar :deep(.mic__btn) {
  min-width: 218px;
  min-height: 54px;
  border-radius: 16px;
  box-shadow: 0 10px 26px rgba(91, 134, 212, 0.22);
}
.control-bar :deep(.mic__device-trigger) {
  width: min(270px, 28vw);
  min-height: 54px;
  border-radius: 16px;
  background: #172238;
}
.control-bar :deep(.mic__status) {
  max-width: 500px;
  color: var(--meeting-muted);
  font-size: 10px;
  line-height: 1.25;
}
.control-bar :deep(.mic__error) {
  max-width: 500px;
  font-size: 11px;
}
.connecting,
.ended-banner {
  position: absolute;
  z-index: 20;
  top: 78px;
  left: 50%;
  width: min(680px, calc(100vw - 32px));
  transform: translateX(-50%);
  border: 1px solid rgba(240, 190, 99, 0.3);
  border-radius: 14px;
  color: #ffe0a8;
  background: rgba(83, 59, 24, 0.94);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
}
.ended-banner {
  border-color: rgba(157, 172, 201, 0.28);
  color: #dbe3f5;
  background: rgba(40, 51, 72, 0.96);
}
.fatal {
  grid-row: 2 / 4;
  align-self: center;
  justify-self: center;
}
.panel-backdrop {
  display: none;
}
@keyframes meeting-pulse {
  50% { opacity: 0.35; }
}

@media (max-width: 1023px) {
  .room {
    grid-template-rows: 62px minmax(0, 1fr) auto;
  }
  .topbar {
    min-height: 62px;
    padding-inline: 10px;
  }
  .identity strong {
    max-width: 44vw;
    font-size: 13px;
  }
  .identity small {
    display: none;
  }
  .workspace,
  .workspace--panel-open {
    grid-template-columns: minmax(0, 1fr);
    padding: 8px 10px 6px;
  }
  .side {
    position: fixed;
    z-index: 61;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    max-height: min(78svh, 720px);
    border-width: 1px 0 0;
    border-radius: 24px 24px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: meeting-sheet-in 0.2s ease-out;
  }
  .side::before {
    content: '';
    width: 42px;
    height: 4px;
    flex: 0 0 auto;
    align-self: center;
    margin: 8px auto 0;
    border-radius: 999px;
    background: #c3c9d4;
  }
  .panel-backdrop {
    position: fixed;
    z-index: 60;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: rgba(0, 0, 0, 0.58);
    cursor: default;
  }
  .control-bar {
    width: calc(100vw - 16px);
    max-width: none;
    gap: 4px;
    margin-bottom: max(8px, env(safe-area-inset-bottom));
    padding: 5px;
    border-radius: 18px;
  }
  .meeting-control,
  .hand.meeting-control {
    min-width: 52px;
    padding: 5px;
  }
  .control-copy small {
    display: none;
  }
  .control-bar :deep(.mic__btn) {
    min-width: 168px;
    padding-inline: 12px;
    font-size: 12px;
  }
  .control-bar :deep(.mic__device-trigger) {
    width: 52px;
    padding: 8px;
    grid-template-columns: auto;
  }
  .control-bar :deep(.mic__device-copy),
  .control-bar :deep(.mic__chevron) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .control-bar :deep(.mic__status),
  .control-bar :deep(.mic__error) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
}

@media (max-width: 620px) {
  .topbar {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 7px;
  }
  .back span,
  .topbar__actions .ghost span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .back,
  .ghost,
  .danger {
    width: 44px;
    padding: 0;
  }
  .danger span {
    display: none;
  }
  .identity strong {
    max-width: 46vw;
  }
  .workspace {
    padding: 0;
  }
  .stage :deep(.captions) {
    border-width: 0;
    border-radius: 0;
  }
  .control-bar :deep(.mic__btn) {
    min-width: 142px;
  }
  .meeting-control,
  .hand.meeting-control {
    min-width: 48px;
  }
  .control-icon {
    width: 40px;
    height: 40px;
  }
  .control-copy {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
}

@media (max-width: 360px) {
  .control-bar :deep(.mic__btn) {
    min-width: 128px;
    padding-inline: 8px;
  }
  .control-bar :deep(.mic__device-trigger) {
    width: 48px;
  }
  .control-icon {
    width: 38px;
    height: 38px;
  }
}

@keyframes meeting-sheet-in {
  from { transform: translateY(24px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .side,
  .status.reconnecting i {
    animation: none;
  }
}

/* Evita que o atalho flutuante de VLibras cubra controles da reunião. */
:global(body:has(.room) [vw].enabled) {
  right: 10px !important;
  bottom: max(104px, calc(92px + env(safe-area-inset-bottom))) !important;
  transition: bottom 0.18s ease;
}
@media (min-width: 1024px) {
  :global(body:has(.room--panel-open) [vw].enabled) {
    right: min(390px, calc(34vw + 22px)) !important;
  }
}
:global(body:has(.room .side[aria-modal='true']) [vw].enabled) {
  display: none !important;
}

@media (max-width: 620px) {
  :global(body:has(.room) [vw].enabled) {
    right: 8px !important;
    bottom: max(92px, calc(82px + env(safe-area-inset-bottom))) !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  :global(body:has(.room) [vw].enabled) {
    transition: none;
  }
}
</style>
