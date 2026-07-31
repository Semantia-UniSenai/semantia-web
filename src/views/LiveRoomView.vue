<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CaptionStage from '../components/live/CaptionStage.vue'
import ChatPanel from '../components/live/ChatPanel.vue'
import MicControl from '../components/live/MicControl.vue'
import { useLiveSession } from '../live/useLiveSession'
import { useMeetingTranscription } from '../live/useMeetingTranscription'

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => String(route.params.sessionId))
const inviteToken = computed(() => typeof route.query.token === 'string' ? route.query.token : undefined)
const live = useLiveSession()
const copied = ref(false)
const confirmingEnd = ref(false)
const panel = ref<'chat' | 'participants'>('chat')
const startedAt = Date.now()

const transcription = useMeetingTranscription({
  onPartial: (text) => void live.publishPartial(text),
  onFinal: (text) => void live.publishFinal(text, Date.now() - startedAt),
})

const backTo = computed(() => '/app/salas')
const myHand = computed(() => live.raisedHands.value.some((hand) => hand.participantId === live.currentParticipantId.value))

onMounted(() => live.connect(sessionId.value, inviteToken.value))
watch(() => live.ended.value, (ended) => { if (ended) transcription.stop() })

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
  await live.endSession()
  confirmingEnd.value = false
}

function leave() {
  live.disconnect()
  if (live.role.value === 'GUEST') router.push('/')
  else router.push(backTo.value)
}
</script>

<template>
  <main class="room">
    <header class="topbar">
      <button class="back" type="button" @click="leave">← Sair</button>
      <div class="identity">
        <span class="status" :class="{ ended: live.ended.value }"><i></i>{{ live.ended.value ? 'Encerrada' : 'Ao vivo' }}</span>
        <strong>{{ live.session.value?.title ?? 'Conectando à reunião…' }}</strong>
        <small>{{ live.session.value?.roomName }}</small>
      </div>
      <div class="topbar__actions">
        <button v-if="live.canManage.value && !live.ended.value" class="ghost" type="button" @click="copyInvite">{{ copied ? 'Link copiado' : 'Convidar' }}</button>
        <button v-if="live.canManage.value && !live.ended.value" class="danger" type="button" @click="end">{{ confirmingEnd ? 'Confirmar encerramento' : 'Encerrar reunião' }}</button>
      </div>
    </header>

    <section v-if="live.joinError.value" class="fatal" role="alert">
      <h1>Não foi possível entrar</h1>
      <p>{{ live.joinError.value.message }}</p>
      <RouterLink :to="backTo">Voltar às reuniões</RouterLink>
    </section>

    <template v-else>
      <div v-if="live.status.value !== 'connected'" class="connecting">Conectando à reunião segura…</div>
      <div v-if="live.ended.value" class="ended-banner" role="status">Reunião encerrada. O conteúdo está disponível somente para leitura conforme a retenção configurada.</div>

      <div class="workspace">
        <section class="stage">
          <CaptionStage :transcript="live.transcript.value" :partial-text="live.partialText.value" />
          <MicControl
            v-if="live.canManage.value"
            class="mic"
            :supported="transcription.supported"
            :listening="transcription.listening.value"
            :loading="transcription.loading.value"
            :error="transcription.error.value"
            :local-engine="transcription.engine.value === 'local'"
            :input-state="transcription.inputState.value"
            :audio-level="transcription.audioLevel.value"
            :disabled="live.ended.value"
            @start="transcription.start"
            @stop="transcription.stop"
          />
          <button
            v-else-if="!live.ended.value"
            class="hand"
            :class="{ active: myHand }"
            type="button"
            @click="myHand ? live.lowerHand() : live.raiseHand()"
          >{{ myHand ? 'Baixar mão' : 'Levantar mão' }}</button>
        </section>

        <aside class="side">
          <nav><button :class="{ active: panel === 'chat' }" @click="panel = 'chat'">Chat <span>{{ live.chat.value.length }}</span></button><button :class="{ active: panel === 'participants' }" @click="panel = 'participants'">Pessoas <span>{{ live.participants.value.length }}</span></button></nav>
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
    </template>
  </main>
</template>

<style scoped>
.room{min-height:100svh;background:#111728;color:#eef2ff}.topbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;min-height:72px;padding:10px 20px;border-bottom:1px solid rgba(255,255,255,.1);background:#161e32}.back,.ghost,.danger{justify-self:start;padding:9px 13px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:transparent;color:#dce4fa;font:700 12px var(--display);cursor:pointer}.identity{display:grid;justify-items:center;gap:2px}.identity strong{font:700 15px var(--display)}.identity small{color:#8895b3}.status{display:flex;align-items:center;gap:6px;color:#54dda3;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.status i{width:7px;height:7px;border-radius:50%;background:#46d795}.status.ended{color:#aab3c7}.status.ended i{background:#78839d}.topbar__actions{display:flex;justify-content:flex-end;gap:8px}.topbar__actions .ghost,.topbar__actions .danger{justify-self:auto}.danger{border-color:rgba(231,88,110,.35);color:#ff9aac}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 340px;height:calc(100svh - 72px);min-height:0}.stage{position:relative;display:flex;min-width:0;min-height:0;overflow-y:auto;flex-direction:column;padding:24px}.stage>:first-child{flex:1;min-height:180px}.mic{margin-top:18px}.hand{align-self:center;margin-top:18px;padding:13px 20px;border:1px solid rgba(255,255,255,.15);border-radius:13px;background:#25314f;color:white;font:700 14px var(--display);cursor:pointer}.hand.active{background:#d99a27}.side{display:flex;min-height:0;flex-direction:column;border-left:1px solid rgba(255,255,255,.1);background:#f8f9fc;color:var(--ink)}.side nav{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--line)}.side nav button{padding:15px;border:0;background:transparent;color:var(--muted);font-weight:800;cursor:pointer}.side nav button.active{color:var(--brand);box-shadow:inset 0 -2px var(--brand)}.side nav span{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:4px;border-radius:999px;background:var(--bg-2);font-size:10px}.people{overflow:auto;padding:12px}.people article{display:flex;align-items:center;gap:10px;padding:11px;border-bottom:1px solid var(--line)}.people article>div{display:grid;gap:2px}.people small{color:var(--muted)}.avatar{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--brand);color:white;font-weight:800}.people button{margin-left:auto;padding:6px 8px;border:0;border-radius:8px;background:rgba(217,154,39,.13);color:#8b5d0d;font-weight:700;cursor:pointer}.raised{margin-left:auto}.ended-banner,.connecting{padding:10px;text-align:center;background:#283654;color:#cbd5eb;font-size:13px}.ended-banner{background:#3a3040;color:#f2d6df}.fatal{width:min(500px,calc(100% - 32px));margin:100px auto;padding:35px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:#1b243a;text-align:center}.fatal a{color:#80a7f1}@media(max-width:900px){.topbar{grid-template-columns:auto 1fr}.identity{justify-items:start}.topbar__actions{grid-column:1/-1}.workspace{grid-template-columns:1fr}.side{min-height:420px;border-top:1px solid rgba(255,255,255,.1);border-left:0}}@media(max-width:560px){.topbar{padding:10px}.identity strong{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stage{padding:12px}.topbar__actions{overflow:auto}}
</style>
