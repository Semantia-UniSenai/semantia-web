<script setup lang="ts">
import { computed } from 'vue'
import type {
  ConferenceParticipantRef,
  ConferenceTrackRef,
} from '../../live/media/types'
import ConferenceTrackElement from './ConferenceTrackElement.vue'

const props = withDefaults(
  defineProps<{
    participants: readonly ConferenceParticipantRef[]
    tracks: readonly ConferenceTrackRef[]
    audioPlaybackBlocked: boolean
    currentParticipantId?: string | null
    localMicrophoneEnabled?: boolean
    raisedParticipantIds?: readonly string[]
  }>(),
  {
    currentParticipantId: null,
    localMicrophoneEnabled: false,
    raisedParticipantIds: () => [],
  },
)

const emit = defineEmits<{
  'resume-audio': []
}>()

const videoTracks = computed(() =>
  props.tracks.filter((track) => track.kind === 'video' && !track.muted),
)
const remoteAudioTracks = computed(() =>
  props.tracks.filter((track) => track.kind === 'audio' && !track.isLocal),
)
const hasActiveVideo = computed(() => videoTracks.value.length > 0)

function videoTrackFor(participantId: string) {
  return videoTracks.value.find((track) => track.participantId === participantId)
}

function microphoneActive(participantId: string) {
  if (participantId === props.currentParticipantId) return props.localMicrophoneEnabled
  return props.tracks.some(
    (track) =>
      track.participantId === participantId &&
      track.kind === 'audio' &&
      !track.muted,
  )
}

function cameraStatus(participantId: string) {
  return videoTrackFor(participantId) ? 'Câmera ativa' : 'Câmera desligada'
}

function microphoneStatus(participantId: string) {
  return microphoneActive(participantId) ? 'Microfone ativo' : 'Microfone desligado'
}

function handRaised(participantId: string) {
  return props.raisedParticipantIds.includes(participantId)
}
</script>

<template>
  <section
    class="conference-media"
    :class="{ 'conference-media--visual': hasActiveVideo || audioPlaybackBlocked }"
    aria-label="Áudio e vídeo da chamada"
  >
    <div
      v-if="hasActiveVideo"
      class="conference-media__tiles"
      role="list"
      aria-label="Vídeo da chamada"
    >
      <article
        v-for="participant in participants"
        :key="participant.participantId"
        class="conference-tile"
        role="listitem"
        data-testid="conference-tile"
        :aria-label="`Vídeo de ${participant.name}. ${cameraStatus(participant.participantId)}. ${microphoneStatus(participant.participantId)}.${handRaised(participant.participantId) ? ' Mão levantada.' : ''}`"
      >
        <ConferenceTrackElement
          v-if="videoTrackFor(participant.participantId)"
          :track="videoTrackFor(participant.participantId)!"
        />
        <div v-else class="conference-tile__fallback" aria-hidden="true">
          {{ participant.name.charAt(0).toUpperCase() }}
        </div>
        <div class="conference-tile__identity">
          <strong>
            {{ participant.name }}<span v-if="participant.participantId === currentParticipantId"> (você)</span>
          </strong>
          <span class="conference-tile__status" aria-hidden="true">
            <span
              class="conference-tile__status-icon"
              :class="{ active: !!videoTrackFor(participant.participantId) }"
              :title="cameraStatus(participant.participantId)"
            >
              <svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/><path v-if="!videoTrackFor(participant.participantId)" d="M4 4l16 16"/></svg>
            </span>
            <span
              class="conference-tile__status-icon"
              :class="{ active: microphoneActive(participant.participantId) }"
              :title="microphoneStatus(participant.participantId)"
            >
              <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/><path v-if="!microphoneActive(participant.participantId)" d="M4 4l16 16"/></svg>
            </span>
            <span
              v-if="handRaised(participant.participantId)"
              class="conference-tile__status-icon conference-tile__status-icon--hand"
              title="Mão levantada"
            >✋</span>
          </span>
        </div>
      </article>
    </div>

    <ConferenceTrackElement
      v-for="track in remoteAudioTracks"
      :key="track.key"
      :track="track"
    />

    <button
      v-if="audioPlaybackBlocked"
      type="button"
      class="conference-media__resume"
      @click="emit('resume-audio')"
    >
      Ativar áudio da chamada
    </button>
  </section>
</template>

<style scoped>
.conference-media {
  position: relative;
  min-width: 0;
}

.conference-media__tiles {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(180px, 260px);
  gap: 10px;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-width: thin;
}

.conference-tile {
  position: relative;
  min-height: 132px;
  overflow: hidden;
  border: 1px solid rgba(202, 216, 244, 0.16);
  border-radius: 16px;
  background: #121b2d;
}

.conference-tile__fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #132435;
  background: linear-gradient(135deg, #83d7d8, #9db3ec);
  font: 800 34px var(--display);
}

.conference-tile__identity {
  position: absolute;
  right: auto;
  bottom: 6px;
  left: 6px;
  max-width: min(calc(100% - 12px), 72%);
  min-height: 28px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  color: #f4f7ff;
  background: rgba(4, 8, 18, 0.68);
  backdrop-filter: blur(6px);
}

.conference-tile__identity strong {
  min-width: 0;
  overflow: hidden;
  font-size: 10px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conference-tile__status {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
}

.conference-tile__status-icon {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #abb6cd;
  background: rgba(255, 255, 255, 0.07);
}

.conference-tile__status-icon.active {
  color: #7fe1bb;
  background: rgba(70, 215, 149, 0.12);
}

.conference-tile__status-icon--hand {
  color: #ffe083;
  background: rgba(244, 185, 66, 0.18);
  font-size: 10px;
}

.conference-tile__status-icon svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.conference-media__resume {
  min-height: 44px;
  margin-top: 8px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 209, 136, 0.42);
  border-radius: 12px;
  color: #ffe0a8;
  background: rgba(83, 59, 24, 0.94);
  font: 750 12px var(--body);
  cursor: pointer;
}

.conference-media__resume:focus-visible {
  outline: 3px solid #8ec5ff;
  outline-offset: 3px;
}

@media (max-width: 620px) {
  .conference-media__tiles {
    grid-auto-columns: minmax(146px, 58vw);
  }

  .conference-tile {
    min-height: 104px;
  }
}
</style>
