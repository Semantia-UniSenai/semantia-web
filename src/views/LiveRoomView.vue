<script setup lang="ts">
import { Transition, TransitionGroup, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { patchSessionSettings, updateSessionContext, type AudienceContext } from '../api/sessions-context'
import AdmissionQueue from '../components/live/AdmissionQueue.vue'
import AudienceContextForm from '../components/live/AudienceContextForm.vue'
import CaptionStage from '../components/live/CaptionStage.vue'
import ChatPanel from '../components/live/ChatPanel.vue'
import ConferenceControls from '../components/live/ConferenceControls.vue'
import ConferenceMediaStage from '../components/live/ConferenceMediaStage.vue'
import MicControl from '../components/live/MicControl.vue'
import { useAudioInputDevices } from '../live/useAudioInputDevices'
import { useVideoInputDevices } from '../live/useVideoInputDevices'
import { useConferenceMedia } from '../live/useConferenceMedia'
import { useLiveSession } from '../live/useLiveSession'
import { useMeetingTranscription } from '../live/useMeetingTranscription'
import { BrowserSharedMicrophoneSource } from '../live/media/shared-microphone-source'
import { switchSharedMicrophoneDevice } from '../live/switch-shared-microphone-device'

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => String(route.params.sessionId))
const inviteToken = computed(() => typeof route.query.token === 'string' ? route.query.token : undefined)
const live = useLiveSession()
const microphoneSource = new BrowserSharedMicrophoneSource()
const conference = useConferenceMedia({
  joined: live.joined,
  ended: live.ended,
  textConnectionStatus: live.status,
  requestMediaCredentials: live.requestMediaCredentials,
  microphoneSource,
})
const copied = ref(false)
const confirmingEnd = ref(false)
const showContextForm = ref(false)
const entryContextPromptShown = ref(false)
const startTranscriptionAfterContext = ref(false)
const contextSaving = ref(false)
const contextSaveError = ref<string | null>(null)
type MeetingPanel = 'chat' | 'participants'

const panel = ref<MeetingPanel | null>(null)
const panelCloseButton = ref<HTMLButtonElement | null>(null)
const panelElement = ref<HTMLElement | null>(null)
const chatTrigger = ref<HTMLButtonElement | null>(null)
const participantsTrigger = ref<HTMLButtonElement | null>(null)
const conferenceControlsRef = ref<{ openSettings: () => Promise<void> } | null>(null)
const isCompactPanel = ref(false)
let lastPanelTrigger: MeetingPanel = 'chat'
let panelMediaQuery: MediaQueryList | null = null
let restoreConferenceMicrophoneAfterTest = false
let restoreConferenceCameraAfterTest = false

const confirmRemoveId = ref<string | null>(null)
const removingId = ref<string | null>(null)
const confirmDialogRef = ref<HTMLElement | null>(null)
const confirmCancelButton = ref<HTMLButtonElement | null>(null)
let removeTriggerElement: HTMLButtonElement | null = null

const showAdmissionBanner = computed(
  () => live.canManage.value && live.admissionQueue.value.length > 0 && panel.value !== 'participants',
)
const admissionNewArrival = ref(false)
let admissionArrivalTimer: ReturnType<typeof setTimeout> | null = null

const chatReadCount = ref(0)
const unreadChatCount = computed(() => Math.max(0, live.chat.value.length - chatReadCount.value))

interface RoomToast {
  id: string
  type: 'hand' | 'chat' | 'join' | 'leave'
  text: string
  participantId?: string
  timer: ReturnType<typeof setTimeout>
}
const toastQueue = ref<RoomToast[]>([])
const knownRaisedHandIds = ref(new Set<string>())
const participantsInitialized = ref(false)

function addToast(type: RoomToast['type'], text: string, participantId?: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const timer = window.setTimeout(() => dismissToast(id), 5000)
  toastQueue.value.push({ id, type, text, participantId, timer })
  if (toastQueue.value.length > 4) {
    const oldest = toastQueue.value[0]!
    clearTimeout(oldest.timer)
    toastQueue.value.splice(0, 1)
  }
}
function dismissToast(id: string) {
  const idx = toastQueue.value.findIndex(t => t.id === id)
  if (idx !== -1) {
    clearTimeout(toastQueue.value[idx]!.timer)
    toastQueue.value.splice(idx, 1)
  }
}

const meetingElapsed = ref(0)
let meetingTimerInterval: ReturnType<typeof setInterval> | null = null
let meetingStartedAt: number | null = null

const meetingDuration = computed(() => {
  const s = meetingElapsed.value
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return `${m}:${String(s % 60).padStart(2, '0')}`
})

watch(() => live.session.value, (session) => {
  if (session && meetingStartedAt === null) {
    meetingStartedAt = Date.now()
    meetingTimerInterval = window.setInterval(() => {
      meetingElapsed.value = Math.floor((Date.now() - meetingStartedAt!) / 1000)
    }, 1000)
  }
}, { immediate: true })

const mobileOverflowOpen = ref(false)
const reactionsTrayOpen = ref(false)
const roomTheme = ref<'dark' | 'light'>((localStorage.getItem('room-theme') as 'dark' | 'light') || 'dark')

function toggleTheme() {
  roomTheme.value = roomTheme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('room-theme', roomTheme.value)
}
let reactionsTrayTimer: ReturnType<typeof setTimeout> | null = null

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🙌']

interface FloatingReaction {
  id: string
  emoji: string
  name: string
  left: number
}
const floatingReactions = ref<FloatingReaction[]>([])

function toggleReactionsTray() {
  reactionsTrayOpen.value = !reactionsTrayOpen.value
  if (reactionsTrayOpen.value) {
    if (reactionsTrayTimer) clearTimeout(reactionsTrayTimer)
    reactionsTrayTimer = window.setTimeout(() => {
      reactionsTrayOpen.value = false
    }, 6000)
  }
}

async function sendReaction(emoji: string) {
  reactionsTrayOpen.value = false
  if (reactionsTrayTimer) clearTimeout(reactionsTrayTimer)
  await live.sendReaction(emoji)
}

function openMobileOverflow() {
  mobileOverflowOpen.value = true
}
function closeMobileOverflow() {
  mobileOverflowOpen.value = false
  confirmingEnd.value = false
}
async function openMediaSettingsFromOverflow() {
  closeMobileOverflow()
  await nextTick()
  void conferenceControlsRef.value?.openSettings()
}

async function copyInviteAndClose() {
  await copyInvite()
  closeMobileOverflow()
}

const audioInput = useAudioInputDevices({ microphoneSource })
const videoInput = useVideoInputDevices()
const transcription = useMeetingTranscription({
  microphoneSource,
  onAudioSegment: (segment) => live.publishAudioSegment(segment),
})

const asrQualityStatus = computed<'idle' | 'ready' | 'processing' | 'error'>(() => {
  const backendState = live.transcriptionStatus.value?.state
  if (live.pendingAudioCount.value > 0 || backendState === 'processing') return 'processing'
  if (backendState === 'failed') return 'error'
  if (transcription.listening.value) return 'ready'
  return transcription.qualityStatus.value
})

const backTo = computed(() => '/app/salas')
const myHand = computed(() => live.raisedHands.value.some((hand) => hand.participantId === live.currentParticipantId.value))
const raisedParticipantIds = computed(() =>
  live.raisedHands.value.map((hand) => hand.participantId),
)
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
  void videoInput.refresh(false)
  panelMediaQuery = window.matchMedia('(max-width: 1023px)')
  syncPanelMode()
  panelMediaQuery.addEventListener('change', syncPanelMode)
})
onBeforeUnmount(() => {
  panelMediaQuery?.removeEventListener('change', syncPanelMode)
  if (admissionArrivalTimer !== null) clearTimeout(admissionArrivalTimer)
  for (const t of toastQueue.value) clearTimeout(t.timer)
  if (meetingTimerInterval !== null) clearInterval(meetingTimerInterval)
  if (reactionsTrayTimer !== null) clearTimeout(reactionsTrayTimer)
  restoreConferenceMicrophoneAfterTest = false
  restoreConferenceCameraAfterTest = false
  void audioInput.stopTest()
  void videoInput.stopTest()
  microphoneSource.dispose()
})
watch(() => live.admissionQueue.value.length, (newLen, oldLen) => {
  if (newLen > (oldLen ?? 0) && newLen > 0) {
    admissionNewArrival.value = false
    void nextTick(() => {
      admissionNewArrival.value = true
      admissionArrivalTimer = window.setTimeout(() => { admissionNewArrival.value = false }, 2500)
    })
  }
})
watch(() => live.raisedHands.value, (newHands) => {
  if (!live.canManage.value || panel.value === 'participants') {
    knownRaisedHandIds.value = new Set(newHands.map(h => h.participantId))
    return
  }
  const newIds = new Set(newHands.map(h => h.participantId))
  for (const hand of newHands) {
    if (!knownRaisedHandIds.value.has(hand.participantId)) {
      const name = live.participants.value.find(p => p.participantId === hand.participantId)?.name ?? 'Alguém'
      addToast('hand', `${name} levantou a mão`, hand.participantId)
    }
  }
  knownRaisedHandIds.value = newIds
}, { deep: true })

watch(() => live.participants.value, (newParts, oldParts) => {
  if (!participantsInitialized.value) {
    participantsInitialized.value = true
    return
  }
  if (!oldParts) return
  const oldIds = new Set(oldParts.map(p => p.participantId))
  const newIds = new Set(newParts.map(p => p.participantId))
  for (const p of newParts) {
    if (!oldIds.has(p.participantId) && p.participantId !== live.currentParticipantId.value) {
      addToast('join', `${p.name} entrou na reunião`)
    }
  }
  for (const p of oldParts) {
    if (!newIds.has(p.participantId) && p.participantId !== live.currentParticipantId.value) {
      addToast('leave', `${p.name} saiu da reunião`)
    }
  }
}, { deep: true })

watch(live.chat, (newChat, oldChat) => {
  if (panel.value === 'chat') {
    chatReadCount.value = newChat.length
    return
  }
  if (oldChat && newChat.length > oldChat.length) {
    const latest = newChat[newChat.length - 1]
    if (latest && latest.participantId !== live.currentParticipantId.value) {
      const senderName = live.participants.value.find(p => p.participantId === latest.participantId)?.name ?? 'Alguém'
      const preview = latest.text.length > 50 ? latest.text.slice(0, 50) + '…' : latest.text
      addToast('chat', `${senderName}: ${preview}`)
    }
  }
}, { deep: true })
watch(() => live.ended.value, (ended) => {
  if (ended) {
    void transcription.stop({ flush: false })
    restoreConferenceMicrophoneAfterTest = false
    restoreConferenceCameraAfterTest = false
    void audioInput.stopTest()
    void videoInput.stopTest()
  }
})

watch(() => live.reactions.value.length, (newLen, oldLen) => {
  if (newLen <= (oldLen ?? 0)) return
  const latest = live.reactions.value[newLen - 1]!
  const { id, emoji, name } = latest
  const left = 5 + Math.random() * 70
  floatingReactions.value.push({ id, emoji, name, left })
  window.setTimeout(() => {
    floatingReactions.value = floatingReactions.value.filter(r => r.id !== id)
  }, 3800)
})

watch(() => live.mutedByHostAt.value, (ts) => {
  if (ts && conference.microphoneEnabled.value) {
    void toggleConferenceMicrophone()
  }
})
watch(
  [live.status, live.canManage, live.session],
  ([status, canManage, session]) => {
    if (
      entryContextPromptShown.value ||
      status !== 'connected' ||
      !canManage ||
      !session ||
      session.status === 'ENDED' ||
      session.audienceContext
    ) {
      return
    }
    entryContextPromptShown.value = true
    startTranscriptionAfterContext.value = false
    contextSaveError.value = null
    showContextForm.value = true
  },
  { immediate: true },
)

async function startTranscription() {
  if (live.canManage.value && !live.session.value?.audienceContext) {
    startTranscriptionAfterContext.value = true
    contextSaveError.value = null
    showContextForm.value = true
    return
  }
  await stopLocalMicrophoneTest()
  await transcription.start(audioInput.selectedDeviceId.value)
}

async function toggleConferenceMicrophone() {
  try {
    await stopLocalMicrophoneTest(false)
    await conference.toggleMicrophone(audioInput.selectedDeviceId.value)
  } catch {
    // O composable mantém a falha visível sem interromper sala, chat ou legenda.
  }
}

async function toggleConferenceCamera() {
  await stopLocalCameraTest(false)
  await conference.toggleCamera(videoInput.selectedDeviceId.value).catch(() => undefined)
}

async function changeVideoInput(deviceId: string) {
  await videoInput.selectDevice(deviceId)
  if (!conference.cameraEnabled.value) return
  await conference.switchDevice('videoinput', deviceId).catch(() => undefined)
}

async function startLocalMicrophoneTest() {
  restoreConferenceMicrophoneAfterTest = false
  if (conference.microphoneEnabled.value) {
    try {
      await conference.toggleMicrophone(audioInput.selectedDeviceId.value)
      restoreConferenceMicrophoneAfterTest = true
    } catch {
      return
    }
  }
  await audioInput.startTest(true)
  if (audioInput.testState.value === 'error') {
    await stopLocalMicrophoneTest()
  }
}

async function stopLocalMicrophoneTest(restoreConference = true) {
  const shouldRestore = restoreConference && restoreConferenceMicrophoneAfterTest
  restoreConferenceMicrophoneAfterTest = false
  await audioInput.stopTest()
  if (
    shouldRestore &&
    !live.ended.value &&
    !conference.microphoneEnabled.value
  ) {
    await conference
      .toggleMicrophone(audioInput.selectedDeviceId.value)
      .catch(() => undefined)
  }
}

async function startLocalCameraTest() {
  restoreConferenceCameraAfterTest = false
  if (conference.cameraEnabled.value) {
    try {
      await conference.toggleCamera(videoInput.selectedDeviceId.value)
      restoreConferenceCameraAfterTest = true
    } catch {
      return
    }
  }
  await videoInput.startTest()
  if (videoInput.testState.value === 'error') {
    await stopLocalCameraTest()
  }
}

async function stopLocalCameraTest(restoreConference = true) {
  const shouldRestore = restoreConference && restoreConferenceCameraAfterTest
  restoreConferenceCameraAfterTest = false
  await videoInput.stopTest()
  if (shouldRestore && !live.ended.value && !conference.cameraEnabled.value) {
    await conference
      .toggleCamera(videoInput.selectedDeviceId.value)
      .catch(() => undefined)
  }
}

async function resumeConferenceAudio() {
  await conference.startAudio().catch(() => undefined)
}

async function retryConference() {
  await conference.retry().catch(() => undefined)
}

async function saveContext({ context, requiresApproval }: { context: AudienceContext; requiresApproval: boolean }) {
  const id = sessionId.value
  contextSaving.value = true
  contextSaveError.value = null
  try {
    await updateSessionContext(id, { ...context, requiresApproval })
    if (live.session.value) {
      live.session.value = { ...live.session.value, audienceContext: context, requiresApproval }
    }
    const shouldStartTranscription = startTranscriptionAfterContext.value
    startTranscriptionAfterContext.value = false
    showContextForm.value = false
    if (shouldStartTranscription) {
      await stopLocalMicrophoneTest()
      await transcription.start(audioInput.selectedDeviceId.value)
    }
  } catch {
    contextSaveError.value = 'Não foi possível salvar o contexto. Tente novamente.'
  } finally {
    contextSaving.value = false
  }
}

async function toggleApproval() {
  const current = live.session.value?.requiresApproval ?? false
  const next = !current
  try {
    await patchSessionSettings(sessionId.value, { requiresApproval: next })
    if (live.session.value) {
      live.session.value = { ...live.session.value, requiresApproval: next }
    }
    if (!next) {
      for (const entry of [...live.admissionQueue.value]) {
        await live.approveAdmission(entry.admissionId)
      }
    }
  } catch {
    // silent
  }
}

function skipContext() {
  const shouldStartTranscription = startTranscriptionAfterContext.value
  startTranscriptionAfterContext.value = false
  contextSaveError.value = null
  showContextForm.value = false
  if (shouldStartTranscription) {
    void stopLocalMicrophoneTest().then(() =>
      transcription.start(audioInput.selectedDeviceId.value),
    )
  }
}

async function changeAudioInput(deviceId: string) {
  try {
    const previousDeviceId = audioInput.selectedDeviceId.value
    await switchSharedMicrophoneDevice({
      deviceId,
      previousDeviceId,
      microphoneSource,
      conference,
      transcription,
      stopTest: stopLocalMicrophoneTest,
      selectDevice: audioInput.selectDevice,
    })
  } catch {
    // Os composables de áudio expõem o erro recuperável na própria central.
  }
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
  await transcription.stop({ flush: true })
  if (live.status.value === 'connected') await live.waitForAudioDrain()
  await stopLocalMicrophoneTest(false)
  await stopLocalCameraTest(false)
  await live.endSession()
  confirmingEnd.value = false
}

async function leave() {
  await transcription.stop({ flush: true })
  if (live.status.value === 'connected') await live.waitForAudioDrain()
  await stopLocalMicrophoneTest(false)
  await stopLocalCameraTest(false)
  live.disconnect()
  if (live.role.value === 'GUEST') router.push('/')
  else router.push(backTo.value)
}

async function togglePanel(nextPanel: MeetingPanel) {
  if (panel.value === nextPanel) {
    closePanel()
    return
  }
  if (nextPanel === 'chat') chatReadCount.value = live.chat.value.length
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

const AVATAR_PALETTE = [
  { background: '#1e3a5f', color: '#90c4ff' },
  { background: '#1b3a2f', color: '#6ee7b0' },
  { background: '#341e3a', color: '#c084fc' },
  { background: '#3a2a1e', color: '#fda96b' },
  { background: '#3a1e2a', color: '#f9a8d4' },
  { background: '#1e3a3a', color: '#67e8f9' },
  { background: '#3a361e', color: '#fde68a' },
  { background: '#2a1e3a', color: '#a5b4fc' },
]
function avatarStyle(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!
}

function participantName(participantId: string | null): string {
  if (!participantId) return ''
  return live.participants.value.find(p => p.participantId === participantId)?.name ?? ''
}

function openConfirmRemove(participantId: string, event: MouseEvent) {
  removeTriggerElement = event.currentTarget as HTMLButtonElement
  confirmRemoveId.value = participantId
}

function closeConfirmRemove() {
  confirmRemoveId.value = null
  void nextTick(() => removeTriggerElement?.focus())
}

async function doRemove() {
  const id = confirmRemoveId.value
  if (!id) return
  confirmRemoveId.value = null
  removingId.value = id
  await live.removeParticipant(id)
  removingId.value = null
}

function trapDialogFocus(event: KeyboardEvent) {
  if (!confirmDialogRef.value) return
  const focusable = Array.from(
    confirmDialogRef.value.querySelectorAll<HTMLElement>('button:not([disabled])'),
  )
  if (focusable.length < 2) return
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

watch(confirmRemoveId, async (id) => {
  if (id) {
    await nextTick()
    confirmCancelButton.value?.focus()
  }
})

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
  <AudienceContextForm
    v-if="showContextForm"
    :saving="contextSaving"
    :save-error="contextSaveError"
    @submit="saveContext"
    @skip="skipContext"
  />

  <div v-if="live.admissionStatus.value === 'waiting'" class="admission-overlay" role="status" aria-live="polite">
    <div class="admission-overlay__card">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="admission-overlay__icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <h2>Aguardando aprovação</h2>
      <p>O anfitrião será notificado. Aguarde um momento.</p>
    </div>
  </div>

  <div v-if="live.admissionStatus.value === 'denied'" class="admission-overlay admission-overlay--denied" role="alert">
    <div class="admission-overlay__card">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="admission-overlay__icon"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
      <h2>Acesso não permitido</h2>
      <p>Seu acesso à sala não foi aceito. Entre em contato com o anfitrião.</p>
      <button type="button" class="ghost" @click="live.disconnect(); $router.push('/')">Fechar</button>
    </div>
  </div>

  <div v-if="live.admissionStatus.value === 'removed'" class="admission-overlay admission-overlay--denied" role="alert">
    <div class="admission-overlay__card">
      <svg aria-hidden="true" viewBox="0 0 24 24" class="admission-overlay__icon"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
      <h2>Você foi removido da sala</h2>
      <p>O anfitrião encerrou sua participação nesta reunião.</p>
      <button type="button" class="ghost" @click="live.disconnect(); $router.push('/')">Fechar</button>
    </div>
  </div>
  <div
    v-if="confirmRemoveId !== null"
    class="confirm-dialog-backdrop"
    role="presentation"
    @click.self="closeConfirmRemove"
    @keydown.esc.prevent="closeConfirmRemove"
    @keydown.tab.prevent="trapDialogFocus"
  >
    <div
      ref="confirmDialogRef"
      class="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-remove-title"
    >
      <h3 id="confirm-remove-title" class="confirm-dialog__title">Remover participante?</h3>
      <p class="confirm-dialog__body">
        <strong>{{ participantName(confirmRemoveId) }}</strong> será desconectado da sala e não poderá retornar diretamente.
      </p>
      <div class="confirm-dialog__actions">
        <button ref="confirmCancelButton" type="button" class="ghost" @click="closeConfirmRemove">Cancelar</button>
        <button type="button" class="danger" @click="doRemove">Remover</button>
      </div>
    </div>
  </div>

  <main class="room" :class="{ 'room--panel-open': panel, 'room--light': roomTheme === 'light' }">
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
        ><i></i>{{ meetingStatusLabel }}<template v-if="live.session.value && !live.ended.value"> · {{ meetingDuration }}</template></span>
        <strong>{{ live.session.value?.title ?? 'Conectando à reunião…' }}</strong>
        <small>{{ live.session.value?.roomName }}</small>
      </div>
      <div class="topbar__actions">
        <button
          v-if="!live.ended.value"
          class="ghost"
          type="button"
          :title="roomTheme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
          @click="toggleTheme"
        >
          <svg v-if="roomTheme === 'dark'" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          <svg v-else aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <span>{{ roomTheme === 'dark' ? 'Claro' : 'Escuro' }}</span>
        </button>
        <button v-if="live.canManage.value && !live.ended.value" class="ghost" type="button" @click="copyInvite">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>
          <span>{{ copied ? 'Link copiado' : 'Convidar' }}</span>
        </button>
        <button
          v-if="live.canManage.value && !live.ended.value"
          class="ghost"
          type="button"
          :aria-pressed="live.session.value?.requiresApproval"
          :title="live.session.value?.requiresApproval ? 'Aprovação ativada — clique para abrir a sala' : 'Sala aberta — clique para exigir aprovação'"
          @click="toggleApproval"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          <span>{{ live.session.value?.requiresApproval ? 'Aprovação ativa' : 'Sala aberta' }}</span>
        </button>
        <button
          v-if="live.canManage.value && !live.ended.value"
          class="ghost"
          type="button"
          title="Silenciar todos os participantes"
          @click="live.muteAll()"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/><path d="M4 4l16 16"/></svg>
          <span>Silenciar todos</span>
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
      <button
        v-if="live.session.value && !live.ended.value"
        class="topbar__overflow"
        type="button"
        aria-label="Mais opções da reunião"
        aria-haspopup="dialog"
        :aria-expanded="mobileOverflowOpen"
        @click="openMobileOverflow"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>
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

      <TransitionGroup tag="div" name="room-toast" class="toast-queue" aria-live="polite" aria-atomic="false">
        <div
          v-for="toast in toastQueue"
          :key="toast.id"
          class="room-toast"
          :class="`room-toast--${toast.type}`"
          role="status"
        >
          <span class="room-toast__icon" aria-hidden="true">
            <template v-if="toast.type === 'hand'">✋</template>
            <template v-else-if="toast.type === 'chat'">
              <svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5Z"/></svg>
            </template>
            <template v-else-if="toast.type === 'join'">
              <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6"/></svg>
            </template>
            <template v-else>
              <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 11h-6"/></svg>
            </template>
          </span>
          <span class="room-toast__text">{{ toast.text }}</span>
          <button
            v-if="toast.type === 'hand' && live.canManage.value && toast.participantId"
            type="button"
            class="room-toast__action"
            @click="live.lowerParticipantHand(toast.participantId!); dismissToast(toast.id)"
          >Baixar</button>
          <button
            v-else-if="toast.type === 'chat'"
            type="button"
            class="room-toast__action"
            @click="togglePanel('chat'); dismissToast(toast.id)"
          >Ver</button>
          <button
            type="button"
            class="room-toast__dismiss"
            aria-label="Fechar notificação"
            @click="dismissToast(toast.id)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </TransitionGroup>

      <TransitionGroup tag="div" name="float-reaction" class="floating-reactions" aria-hidden="true">
        <div
          v-for="r in floatingReactions"
          :key="r.id"
          class="floating-reaction"
          :style="{ left: r.left + '%' }"
        >
          <span class="floating-reaction__emoji">{{ r.emoji }}</span>
          <span class="floating-reaction__name">{{ r.name }}</span>
        </div>
      </TransitionGroup>

      <div
        v-if="showAdmissionBanner"
        class="admission-banner"
        :class="{ 'admission-banner--new': admissionNewArrival }"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>{{ live.admissionQueue.value.length === 1 ? '1 pessoa aguardando aprovação' : `${live.admissionQueue.value.length} pessoas aguardando aprovação` }}</span>
        <button type="button" class="admission-banner__btn" @click="togglePanel('participants')">Ver</button>
      </div>

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
            :caption-state="captionState"
          />
          <ConferenceMediaStage
            v-if="live.session.value"
            :participants="live.participants.value"
            :tracks="conference.tracks.value"
            :audio-playback-blocked="conference.audioPlaybackBlocked.value"
            :current-participant-id="live.currentParticipantId.value"
            :local-microphone-enabled="conference.microphoneEnabled.value"
            :raised-participant-ids="raisedParticipantIds"
            @resume-audio="resumeConferenceAudio"
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
          <template v-else>
          <AdmissionQueue
            v-if="live.canManage.value && live.admissionQueue.value.length > 0"
            :queue="live.admissionQueue.value"
            @approve="live.approveAdmission"
            @reject="live.rejectAdmission"
          />
          <div class="people" role="list" aria-label="Participantes na reunião" aria-live="polite">
            <article v-for="participant in live.participants.value" :key="participant.participantId" role="listitem">
              <span class="avatar" :style="avatarStyle(participant.name)">{{ participant.name.charAt(0).toUpperCase() }}</span>
              <div><strong>{{ participant.participantId === live.currentParticipantId.value ? 'Você' : participant.name }}</strong><small>{{ participant.role === 'HOST' ? 'Anfitrião' : participant.role === 'MODERATOR' ? 'Moderador' : participant.role === 'GUEST' ? 'Convidado' : 'Participante' }}</small></div>
              <button v-if="live.canManage.value && live.raisedHands.value.some((hand) => hand.participantId === participant.participantId)" type="button" @click="live.lowerParticipantHand(participant.participantId)">✋ Baixar</button>
              <span v-else-if="live.raisedHands.value.some((hand) => hand.participantId === participant.participantId)" class="raised">✋</span>
              <button
                v-if="live.canManage.value && participant.participantId !== live.currentParticipantId.value && participant.role !== 'HOST'"
                type="button"
                class="remove-btn"
                :class="{ 'remove-btn--loading': removingId === participant.participantId }"
                :disabled="removingId === participant.participantId"
                :aria-label="`Remover ${participant.name} da sala`"
                :aria-busy="removingId === participant.participantId ? 'true' : undefined"
                @click="openConfirmRemove(participant.participantId, $event)"
              >{{ removingId === participant.participantId ? '…' : 'Remover' }}</button>
            </article>
          </div>
          </template>
        </aside>
      </div>

      <nav
        class="control-bar"
        aria-label="Controles da reunião"
        :inert="isCompactPanel && !!panel"
      >
        <ConferenceControls
          v-if="live.session.value && !live.ended.value"
          ref="conferenceControlsRef"
          :media-status="conference.mediaStatus.value"
          :media-error="conference.mediaError.value"
          :microphone-enabled="conference.microphoneEnabled.value"
          :camera-enabled="conference.cameraEnabled.value"
          :microphone-pending="conference.microphonePending.value"
          :camera-pending="conference.cameraPending.value"
          :video-devices-supported="videoInput.supported"
          :video-devices="videoInput.devices.value"
          :selected-video-device-id="videoInput.selectedDeviceId.value"
          :video-devices-loading="videoInput.loading.value"
          :video-device-error="videoInput.error.value"
          :camera-test-state="videoInput.testState.value"
          :camera-test-stream="videoInput.testStream.value"
          :audio-devices-supported="audioInput.supported"
          :audio-devices="audioInput.devices.value"
          :selected-audio-device-id="audioInput.selectedDeviceId.value"
          :audio-devices-loading="audioInput.loading.value"
          :audio-device-error="audioInput.error.value"
          :microphone-test-state="audioInput.testState.value"
          :microphone-test-level="audioInput.testLevel.value"
          :microphone-test-monitor-enabled="audioInput.testMonitorEnabled.value"
          @toggle-microphone="toggleConferenceMicrophone"
          @toggle-camera="toggleConferenceCamera"
          @refresh-video-devices="videoInput.refresh"
          @select-video-device="changeVideoInput"
          @refresh-audio-devices="audioInput.refresh"
          @select-audio-device="changeAudioInput"
          @start-camera-test="startLocalCameraTest"
          @stop-camera-test="stopLocalCameraTest"
          @start-microphone-test="startLocalMicrophoneTest"
          @stop-microphone-test="stopLocalMicrophoneTest"
          @retry="retryConference"
        />
        <MicControl
          v-if="live.canPublishTranscript.value"
          class="mic"
          :supported="transcription.supported"
          :listening="transcription.listening.value"
          :loading="transcription.loading.value"
          :error="transcription.error.value"
          :input-state="transcription.inputState.value"
          :audio-level="transcription.audioLevel.value"
          :quality-status="asrQualityStatus"
          :pending-audio-count="live.pendingAudioCount.value"
          :backend-engine="live.transcriptionStatus.value?.engine ?? undefined"
          :backend-model="live.transcriptionStatus.value?.model ?? undefined"
          :backend-inference-ms="live.transcriptionStatus.value?.inferenceMs ?? undefined"
          :disabled="live.ended.value"
          @start="startTranscription"
          @stop="transcription.stop"
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
        <div v-if="!live.ended.value" class="reaction-ctrl">
          <button
            class="meeting-control"
            :class="{ 'meeting-control--active': reactionsTrayOpen }"
            type="button"
            :aria-pressed="reactionsTrayOpen"
            aria-label="Abrir painel de reações"
            @click="toggleReactionsTray"
          >
            <span class="control-icon" aria-hidden="true">😊</span>
            <span class="control-copy">
              <strong>Reagir</strong>
              <small>Reações</small>
            </span>
          </button>
          <Transition name="reaction-tray">
            <div v-if="reactionsTrayOpen" class="reaction-tray" role="toolbar" aria-label="Escolha uma reação">
              <button
                v-for="emoji in REACTION_EMOJIS"
                :key="emoji"
                type="button"
                class="reaction-tray__btn"
                :aria-label="emoji"
                @click="sendReaction(emoji)"
              >{{ emoji }}</button>
            </div>
          </Transition>
        </div>
        <button
          ref="chatTrigger"
          class="meeting-control"
          :class="{ 'meeting-control--notify': unreadChatCount > 0 && panel !== 'chat' }"
          type="button"
          aria-controls="meeting-panel"
          :aria-expanded="panel === 'chat'"
          @click="togglePanel('chat')"
        >
          <span class="control-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5Z"/></svg></span>
          <span class="control-copy">
            <strong>Chat<span v-if="unreadChatCount > 0 && panel !== 'chat'" class="notify-badge">{{ unreadChatCount > 9 ? '9+' : unreadChatCount }}</span></strong>
            <small>{{ live.chat.value.length }} {{ live.chat.value.length === 1 ? 'mensagem' : 'mensagens' }}</small>
          </span>
        </button>
        <button
          ref="participantsTrigger"
          class="meeting-control"
          :class="{ 'meeting-control--notify': live.canManage.value && live.raisedHands.value.length > 0 && panel !== 'participants' }"
          type="button"
          aria-controls="meeting-panel"
          :aria-expanded="panel === 'participants'"
          @click="togglePanel('participants')"
        >
          <span class="control-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75"/></svg></span>
          <span class="control-copy">
            <strong>Pessoas<span v-if="live.admissionQueue.value.length > 0" class="admission-badge">{{ live.admissionQueue.value.length }}</span><span v-if="live.canManage.value && live.raisedHands.value.length > 0 && panel !== 'participants'" class="notify-badge notify-badge--hand">✋ {{ live.raisedHands.value.length }}</span></strong>
            <small>{{ live.participants.value.length }} na reunião</small>
          </span>
        </button>
      </nav>

      <div
        v-if="mobileOverflowOpen && live.session.value && !live.ended.value"
        class="mobile-overflow-backdrop"
        role="presentation"
        @click.self="closeMobileOverflow"
        @keydown.esc.prevent="closeMobileOverflow"
      >
        <div
          class="mobile-overflow-sheet"
          role="dialog"
          aria-label="Opções da reunião"
          aria-modal="true"
          @keydown.esc.stop="closeMobileOverflow"
        >
          <div class="mobile-overflow-sheet__handle" aria-hidden="true"></div>
          <p class="mobile-overflow-sheet__title">Reunião</p>

          <div class="mobile-overflow-sheet__emojis">
            <p class="mobile-overflow-sheet__emojis-label">Reagir</p>
            <div class="mobile-overflow-sheet__emoji-row">
              <button
                v-for="emoji in REACTION_EMOJIS"
                :key="emoji"
                type="button"
                class="mobile-overflow-sheet__emoji-btn"
                :aria-label="emoji"
                @click="sendReaction(emoji); closeMobileOverflow()"
              >{{ emoji }}</button>
            </div>
          </div>

          <button
            type="button"
            class="mobile-overflow-sheet__action"
            @click="toggleTheme(); closeMobileOverflow()"
          >
            <svg v-if="roomTheme === 'dark'" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <svg v-else aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            {{ roomTheme === 'dark' ? 'Tema claro' : 'Tema escuro' }}
          </button>

          <button
            v-if="live.session.value"
            type="button"
            class="mobile-overflow-sheet__action"
            @click="openMediaSettingsFromOverflow"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/><circle cx="9" cy="9" r="2"/><path d="M20 4v6m-3-3h6"/></svg>
            Câmera e microfone
          </button>

          <template v-if="live.canManage.value">
            <button type="button" class="mobile-overflow-sheet__action" @click="copyInviteAndClose">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>
              {{ copied ? 'Link copiado!' : 'Convidar' }}
            </button>
            <button
              type="button"
              class="mobile-overflow-sheet__action"
              :class="{ 'mobile-overflow-sheet__action--active': live.session.value?.requiresApproval }"
              :aria-pressed="live.session.value?.requiresApproval"
              @click="toggleApproval"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              {{ live.session.value?.requiresApproval ? 'Aprovação ativa' : 'Sala aberta' }}
            </button>
            <button type="button" class="mobile-overflow-sheet__action" @click="live.muteAll(); closeMobileOverflow()">
              <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/><path d="M4 4l16 16"/></svg>
              Silenciar todos
            </button>
            <button type="button" class="mobile-overflow-sheet__action mobile-overflow-sheet__action--danger" @click="end">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
              {{ confirmingEnd ? 'Confirmar encerramento' : 'Encerrar reunião' }}
            </button>
          </template>

          <button type="button" class="mobile-overflow-sheet__cancel" @click="closeMobileOverflow">Cancelar</button>
        </div>
      </div>
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
  background: var(--meeting-bg);
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
  background: var(--meeting-bg);
  color: var(--meeting-text);
}
.stage > :first-child {
  flex: 1;
  min-height: 0;
}
.stage > .conference-media--visual {
  order: -1;
  flex: 0 0 auto;
  max-height: 168px;
  margin-bottom: 12px;
}
.side {
  position: relative;
  z-index: 12;
  grid-column: 2;
  width: auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--meeting-border);
  border-radius: 22px;
  background: #0f1828;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
}
.side__header {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 13px 20px;
  border-bottom: 1px solid var(--meeting-border);
  background: rgba(255, 255, 255, 0.03);
}
.side__header > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.side__header span {
  color: var(--meeting-muted);
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.side__header h2 {
  overflow: hidden;
  color: var(--meeting-text);
  font: 700 16px var(--display);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side__header button {
  width: 40px;
  min-width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--meeting-border);
  border-radius: 12px;
  color: var(--meeting-muted);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}
.side__header button:hover {
  background: rgba(255, 255, 255, 0.09);
  color: var(--meeting-text);
}
.people {
  gap: 1px;
  padding: 8px;
  overflow-y: auto;
  background: transparent;
}
.people article {
  min-height: 58px;
  padding: 9px 11px;
  border: 0;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--meeting-text);
}
.people article strong {
  color: var(--meeting-text);
  font-size: 13px;
}
.people article small {
  color: var(--meeting-muted);
  font-size: 11px;
}
.people > div > article button:not(.remove-btn) {
  margin-left: auto;
  padding: 5px 10px;
  border: 1px solid rgba(240, 192, 96, 0.28);
  border-radius: 8px;
  background: rgba(240, 192, 96, 0.08);
  color: #f0c060;
  font: 700 11px var(--display, inherit);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.14s ease;
}
.people > div > article button:not(.remove-btn):hover {
  background: rgba(240, 192, 96, 0.16);
}
.avatar {
  width: 38px;
  height: 38px;
  font-weight: 800;
  font-size: 15px;
}
.remove-btn {
  margin-left: auto;
  padding: 5px 10px;
  border: 1px solid rgba(231, 88, 110, 0.25);
  border-radius: 8px;
  background: rgba(231, 88, 110, 0.06);
  color: #c0394f;
  font: 700 11px var(--display, inherit);
  cursor: pointer;
}
.remove-btn:hover {
  background: rgba(231, 88, 110, 0.14);
  border-color: rgba(231, 88, 110, 0.5);
}
.remove-btn--loading {
  opacity: 0.55;
  cursor: not-allowed;
}
.confirm-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(6px);
}
.confirm-dialog {
  width: min(400px, 100%);
  padding: 26px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  background: #141c2e;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  color: var(--meeting-text);
  animation: meeting-sheet-in 0.18s ease-out;
}
.confirm-dialog__title {
  margin: 0 0 10px;
  font: 700 18px var(--display);
}
.confirm-dialog__body {
  margin: 0 0 22px;
  font-size: 13px;
  color: var(--meeting-muted);
  line-height: 1.5;
}
.confirm-dialog__body strong {
  color: var(--meeting-text);
}
.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
  position: relative;
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
.meeting-control--notify .control-icon::after {
  content: '';
  position: absolute;
  top: 5px;
  right: 5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f0c060;
  border: 2px solid #11192a;
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
.admission-banner {
  position: absolute;
  z-index: 20;
  top: 78px;
  left: 50%;
  width: min(480px, calc(100vw - 32px));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 14px;
  transform: translateX(-50%);
  border: 1px solid rgba(255, 193, 87, 0.38);
  border-radius: 14px;
  color: #ffe9a0;
  background: rgba(62, 40, 5, 0.96);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(8px);
  animation: meeting-sheet-in 0.18s ease-out;
}
.admission-banner svg {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  color: #ffc657;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.admission-banner span {
  flex: 1;
  font: 650 12px var(--body, inherit);
  line-height: 1.3;
}
.admission-banner__btn {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 5px 12px;
  border: 1px solid rgba(255, 193, 87, 0.35);
  border-radius: 8px;
  color: #ffe9a0;
  background: rgba(255, 193, 87, 0.12);
  font: 750 11px var(--display, inherit);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.14s ease;
}
.admission-banner__btn:hover {
  background: rgba(255, 193, 87, 0.24);
}
.admission-banner--new {
  animation: meeting-sheet-in 0.18s ease-out, admission-ring 0.55s ease-out;
}
@keyframes admission-ring {
  0%   { box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36); }
  35%  { box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36), 0 0 0 5px rgba(255, 193, 87, 0.35); }
  100% { box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36), 0 0 0 8px rgba(255, 193, 87, 0); }
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

/* Topbar overflow button — hidden on desktop, shown at ≤620px */
.topbar__overflow {
  display: none;
  width: 44px;
  height: 44px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--meeting-border);
  border-radius: 13px;
  color: var(--meeting-text);
  background: rgba(255, 255, 255, 0.035);
  font: inherit;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}
.topbar__overflow:hover {
  border-color: rgba(117, 158, 231, 0.45);
  background: rgba(117, 158, 231, 0.1);
}
.topbar__overflow svg {
  fill: currentColor;
  stroke: none;
  width: 20px;
  height: 20px;
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
    align-items: center;
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
  .control-bar :deep(.mic__quality),
  .control-bar :deep(.mic__meter) {
    display: none;
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
  .topbar__actions {
    display: none;
  }
  .topbar__overflow {
    display: grid;
  }
  .control-bar .mic {
    margin-inline: 6px;
  }
  .control-bar :deep(.mic__btn) {
    min-width: 52px;
    width: 52px;
    min-height: 52px;
    padding: 4px;
    border-radius: 16px;
    box-shadow: 0 6px 20px rgba(91, 134, 212, 0.38);
  }
  .control-bar :deep(.mic__btn.live) {
    box-shadow: 0 6px 20px rgba(216, 79, 107, 0.38);
  }
  .control-bar :deep(.mic__btn span:not(.mic__pulse)) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .control-bar :deep(.mic__controls) {
    justify-content: center;
  }
  .control-bar :deep(.mic__device-trigger) {
    width: 44px;
    min-height: 44px;
  }
  .meeting-control,
  .hand.meeting-control {
    min-width: 44px;
    min-height: 44px;
    padding: 2px;
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
    min-width: 44px;
    padding-inline: 2px;
  }
  .control-bar :deep(.mic__device-trigger) {
    width: 44px;
  }
  .control-icon {
    width: 38px;
    height: 38px;
  }
}

/* Mobile overflow bottom sheet */
.mobile-overflow-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(4px);
}
.mobile-overflow-sheet {
  position: fixed;
  inset: auto 0 0;
  z-index: 71;
  display: grid;
  gap: 6px;
  padding: 4px 12px max(20px, env(safe-area-inset-bottom));
  border: 1px solid var(--meeting-border);
  border-bottom: 0;
  border-radius: 20px 20px 0 0;
  background: var(--meeting-surface-raised);
  box-shadow: 0 -20px 48px rgba(0, 0, 0, 0.48);
  animation: meeting-sheet-in 0.2s ease-out;
}
.mobile-overflow-sheet__handle {
  width: 40px;
  height: 4px;
  margin: 8px auto 2px;
  border-radius: 999px;
  background: var(--meeting-border);
}
.mobile-overflow-sheet__title {
  padding: 0 4px 2px;
  color: var(--meeting-muted);
  font: 750 10px var(--body);
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.mobile-overflow-sheet__action {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border: 1px solid var(--meeting-border);
  border-radius: 14px;
  color: var(--meeting-text);
  background: rgba(255, 255, 255, 0.04);
  font: 650 13px var(--body);
  text-align: left;
  cursor: pointer;
  transition: background 0.14s ease;
}
.mobile-overflow-sheet__action:hover {
  background: rgba(255, 255, 255, 0.09);
}
.mobile-overflow-sheet__action svg {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
}
.mobile-overflow-sheet__action--danger {
  border-color: rgba(255, 110, 139, 0.3);
  color: #ffb2c1;
  background: rgba(255, 110, 139, 0.07);
}
.mobile-overflow-sheet__action--danger:hover {
  background: rgba(255, 110, 139, 0.14);
}
.mobile-overflow-sheet__action--active {
  border-color: rgba(109, 222, 178, 0.35);
  color: #7fe8c0;
  background: rgba(109, 222, 178, 0.08);
}
.mobile-overflow-sheet__emojis {
  padding: 4px 14px 8px;
  border: 1px solid var(--meeting-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}
.mobile-overflow-sheet__emojis-label {
  margin: 0 0 8px;
  color: var(--meeting-muted);
  font: 750 10px var(--body);
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.mobile-overflow-sheet__emoji-row {
  display: flex;
  gap: 6px;
}
.mobile-overflow-sheet__emoji-btn {
  flex: 1;
  min-height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
}
.mobile-overflow-sheet__emoji-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--meeting-border);
  transform: scale(1.15);
}
.mobile-overflow-sheet__emoji-btn:active {
  transform: scale(1.05);
}
.mobile-overflow-sheet__cancel {
  min-height: 48px;
  margin-top: 4px;
  padding: 0 14px;
  border: 1px solid rgba(202, 216, 244, 0.12);
  border-radius: 14px;
  color: var(--meeting-muted);
  background: rgba(255, 255, 255, 0.03);
  font: 650 13px var(--body);
  cursor: pointer;
  transition: background 0.14s ease;
}
.mobile-overflow-sheet__cancel:hover {
  background: rgba(255, 255, 255, 0.07);
}

@keyframes meeting-sheet-in {
  from { transform: translateY(24px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .side,
  .confirm-dialog,
  .admission-banner,
  .admission-banner--new,
  .hand-banner,
  .mobile-overflow-sheet,
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

/* Reactions tray */
.reaction-ctrl {
  position: relative;
}
@media (max-width: 1023px) {
  .reaction-ctrl {
    display: none;
  }
}
.meeting-control--active .control-icon {
  background: rgba(117, 158, 231, 0.2);
  color: #90b8f8;
}
.reaction-tray {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 5px;
  padding: 7px;
  border: 1px solid var(--meeting-border);
  border-radius: 18px;
  background: rgba(15, 22, 40, 0.97);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(14px);
  white-space: nowrap;
}
.reaction-tray__btn {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
}
.reaction-tray__btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--meeting-border);
  transform: scale(1.18);
}
.reaction-tray__btn:active {
  transform: scale(1.05);
}
.reaction-tray-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.reaction-tray-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.reaction-tray-enter-from { opacity: 0; transform: translateX(-50%) translateY(8px); }
.reaction-tray-leave-to   { opacity: 0; transform: translateX(-50%) translateY(4px); }

/* Floating reaction animations */
.floating-reactions {
  position: fixed;
  z-index: 25;
  bottom: calc(max(10px, env(safe-area-inset-bottom)) + 90px);
  left: 0;
  right: 0;
  pointer-events: none;
}
.floating-reaction {
  position: absolute;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: reaction-float 3.8s ease-out forwards;
}
.floating-reaction__emoji {
  font-size: 32px;
  line-height: 1;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45));
}
.floating-reaction__name {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(8, 13, 25, 0.72);
  color: rgba(244, 247, 255, 0.85);
  font: 600 10px var(--body, inherit);
  white-space: nowrap;
  backdrop-filter: blur(4px);
}
@keyframes reaction-float {
  0%   { transform: translateY(0);      opacity: 1; }
  70%  { opacity: 1; }
  100% { transform: translateY(-180px); opacity: 0; }
}
.float-reaction-enter-active,
.float-reaction-leave-active { transition: none; }
.float-reaction-enter-from,
.float-reaction-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .floating-reaction {
    animation: none;
    opacity: 0;
  }
}

/* Admission queue overlay */
.admission-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 13, 25, 0.88);
  backdrop-filter: blur(12px);
}
.admission-overlay__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: min(420px, 100%);
  padding: 40px 32px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 22px;
  background: #11192a;
  color: #dce4fa;
  text-align: center;
}
.admission-overlay__card h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
}
.admission-overlay__card p {
  margin: 0;
  color: #8895b3;
  font-size: 0.9rem;
  line-height: 1.6;
}
.admission-overlay__icon {
  width: 48px;
  height: 48px;
  color: #6b8af7;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.admission-overlay--denied .admission-overlay__icon {
  color: #ff9aac;
}

/* Notification badge — chat unread / raised hands */
.notify-badge {
  display: inline-grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  margin-left: 5px;
  padding: 0 4px;
  border-radius: 999px;
  background: #f0c060;
  color: #3a2800;
  font-size: 9px;
  font-weight: 850;
  vertical-align: middle;
}
.notify-badge--hand {
  background: rgba(240, 192, 96, 0.18);
  color: #f0c060;
  border: 1px solid rgba(240, 192, 96, 0.4);
}

/* Raised hand banner */
.hand-banner {
  position: absolute;
  z-index: 20;
  top: 78px;
  left: 50%;
  width: min(420px, calc(100vw - 32px));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px 10px 14px;
  transform: translateX(-50%);
  border: 1px solid rgba(240, 192, 96, 0.38);
  border-radius: 14px;
  color: #ffe9a0;
  background: rgba(62, 40, 5, 0.96);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(8px);
  animation: meeting-sheet-in 0.18s ease-out;
}
.hand-banner--new {
  animation: hand-ring 0.5s ease-out, hand-shrink 5s linear forwards;
}
.hand-banner__icon {
  flex: 0 0 auto;
  font-size: 18px;
  line-height: 1;
}
.hand-banner__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hand-banner__text strong {
  font: 700 13px var(--body, inherit);
  line-height: 1.2;
}
.hand-banner__text small {
  font: 500 11px var(--body, inherit);
  color: rgba(255, 233, 160, 0.65);
  line-height: 1;
}
.hand-banner__btn {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 5px 12px;
  border: 1px solid rgba(240, 192, 96, 0.35);
  border-radius: 8px;
  color: #ffe9a0;
  background: rgba(240, 192, 96, 0.12);
  font: 750 11px var(--display, inherit);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.14s ease;
}
.hand-banner__btn:hover {
  background: rgba(240, 192, 96, 0.24);
}
@keyframes hand-ring {
  0% { box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36), 0 0 0 0 rgba(240, 192, 96, 0.6); }
  60% { box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36), 0 0 0 10px rgba(240, 192, 96, 0); }
  100% { box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36), 0 0 0 0 rgba(240, 192, 96, 0); }
}
@keyframes hand-shrink {
  0% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; }
}

/* Badge na fila */
.admission-badge {
  display: inline-grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  margin-left: 5px;
  padding: 0 4px;
  border-radius: 999px;
  background: #f0c060;
  color: #3a2800;
  font-size: 9px;
  font-weight: 850;
  vertical-align: middle;
}

/* Toast queue — estilo Google Meet */
.toast-queue {
  position: fixed;
  z-index: 30;
  bottom: calc(max(10px, env(safe-area-inset-bottom)) + 80px);
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  width: min(340px, calc(100vw - 40px));
}
.room-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 8px 10px 13px;
  border: 1px solid rgba(202, 216, 244, 0.18);
  border-radius: 14px;
  background: rgba(15, 24, 40, 0.96);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  color: var(--meeting-text);
}
.room-toast--hand {
  border-color: rgba(240, 192, 96, 0.35);
  background: rgba(42, 28, 4, 0.97);
}
.room-toast--chat {
  border-color: rgba(117, 158, 231, 0.3);
  background: rgba(12, 22, 42, 0.97);
}
.room-toast--join {
  border-color: rgba(70, 215, 149, 0.3);
  background: rgba(8, 30, 22, 0.97);
}
.room-toast--leave {
  border-color: rgba(160, 160, 180, 0.2);
  background: rgba(18, 22, 34, 0.97);
  color: var(--meeting-muted);
}
.room-toast__icon {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.07);
}
.room-toast--hand .room-toast__icon { background: rgba(240, 192, 96, 0.14); }
.room-toast--chat .room-toast__icon { background: rgba(117, 158, 231, 0.14); }
.room-toast--join .room-toast__icon { background: rgba(70, 215, 149, 0.14); }
.room-toast__icon svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.room-toast--hand .room-toast__icon svg { color: #f0c060; }
.room-toast--chat .room-toast__icon svg { color: #90b8f8; }
.room-toast--join .room-toast__icon svg { color: #6ee7b0; }
.room-toast--leave .room-toast__icon svg { color: #8895b3; }
.room-toast__text {
  flex: 1;
  min-width: 0;
  font: 600 12px var(--body, inherit);
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.room-toast__action {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--meeting-text);
  font: 700 11px var(--display, inherit);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.14s ease;
}
.room-toast__action:hover { background: rgba(255, 255, 255, 0.13); }
.room-toast__dismiss {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--meeting-muted);
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}
.room-toast__dismiss:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--meeting-text);
}
.room-toast__dismiss svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

/* Animação de entrada/saída dos toasts */
.room-toast-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.room-toast-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.room-toast-enter-from { opacity: 0; transform: translateY(10px); }
.room-toast-leave-to   { opacity: 0; transform: translateY(6px); }

@media (max-width: 620px) {
  .toast-queue {
    left: 10px;
    right: 10px;
    bottom: calc(max(8px, env(safe-area-inset-bottom)) + 76px);
    width: auto;
  }
}

/* ─── Tema claro ─────────────────────────────────────────────────────────── */
/* Side panel (chat + participants) */
.room--light .side {
  background: var(--meeting-surface);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
.room--light .side__header {
  background: rgba(0, 0, 0, 0.02);
}
.room--light .side__header button {
  background: rgba(0, 0, 0, 0.04);
}
.room--light .side__header button:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--meeting-text);
}
.room--light .people article {
  background: rgba(0, 0, 0, 0.03);
}
/* ConferenceControls (câmera/mic no control bar) */
.room--light .control-bar :deep(.conference-control) {
  color: #1a2540;
}
.room--light .control-bar :deep(.conference-control:hover:not(:disabled)),
.room--light .control-bar :deep(.conference-control.active) {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.06);
}
.room--light .control-bar :deep(.conference-control__icon) {
  color: #2a3a60;
  background: rgba(0, 0, 0, 0.07);
}
.room--light .control-bar :deep(.conference-control.active .conference-control__icon) {
  color: #10232f;
  background: #55c8ca;
}
.room--light {
  --meeting-bg: #f0f2f8;
  --meeting-surface: #e4e8f0;
  --meeting-surface-raised: #d8dde9;
  --meeting-border: rgba(0, 0, 0, 0.12);
  --meeting-text: #1a2540;
  --meeting-muted: #5a6988;
}
.room--light .topbar {
  background: rgba(240, 242, 248, 0.92);
  backdrop-filter: blur(18px);
}
.room--light .control-bar {
  background: rgba(216, 221, 233, 0.96);
  backdrop-filter: blur(20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
.room--light .control-icon {
  color: #2a3a60;
  background: rgba(0, 0, 0, 0.07);
}
.room--light .ghost,
.room--light .back {
  background: rgba(0, 0, 0, 0.04);
}
.room--light .back:hover,
.room--light .ghost:hover {
  background: rgba(26, 37, 64, 0.1);
  border-color: rgba(26, 37, 64, 0.25);
}
.room--light .mobile-overflow-sheet__action {
  background: rgba(0, 0, 0, 0.04);
}
.room--light .mobile-overflow-sheet__action:hover {
  background: rgba(0, 0, 0, 0.08);
}
.room--light .mobile-overflow-sheet__emojis {
  background: rgba(0, 0, 0, 0.04);
}
.room--light .mobile-overflow-sheet__emoji-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  border-color: var(--meeting-border);
}
.room--light .mobile-overflow-sheet__cancel {
  border-color: var(--meeting-border);
  background: rgba(0, 0, 0, 0.03);
}
.room--light .mobile-overflow-sheet__cancel:hover {
  background: rgba(0, 0, 0, 0.07);
}
.room--light .stage :deep(.captions) {
  background: #f8f9fc;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: none;
}
.room--light .stage :deep(.captions__tools) {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.08);
  backdrop-filter: none;
}
.room--light .stage :deep(.captions__label) { color: #3a4a6a; }
.room--light .stage :deep(.captions__label strong) { color: #1a2540; }
.room--light .stage :deep(.captions__label small) { color: #5a6988; }
.room--light .stage :deep(.dot) { background: #c0c8d8; }
.room--light .stage :deep(.dot--active) {
  background: #22b87a;
  box-shadow: 0 0 0 4px rgba(34, 184, 122, 0.15);
}
.room--light .stage :deep(.captions__mode-toggle) {
  border-color: rgba(0, 0, 0, 0.12);
  color: #5a6988;
  background: rgba(0, 0, 0, 0.04);
}
.room--light .stage :deep(.captions__mode-toggle:hover) {
  color: #1a2540;
  border-color: rgba(0, 0, 0, 0.25);
}
.room--light .stage :deep(.captions__font button) {
  border-color: rgba(0, 0, 0, 0.12);
  color: #3a4a6a;
  background: rgba(0, 0, 0, 0.04);
}
.room--light .stage :deep(.captions__font button:hover:not(:disabled)) {
  color: #1a2540;
  border-color: rgba(0, 0, 0, 0.3);
}
.room--light .stage :deep(.captions__line) { color: #8090b0; }
.room--light .stage :deep(.captions__line--current) { color: #0d1526; text-shadow: none; }
.room--light .stage :deep(.captions__line--partial) { color: #2a5090; }
.room--light .stage :deep(.captions__waiting) {
  color: #5a6988;
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.03);
}
</style>
