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
  }>(),
  {
    currentParticipantId: null,
    localMicrophoneEnabled: false,
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
          <span>
            {{ videoTrackFor(participant.participantId) ? 'Câmera ativa' : 'Câmera desligada' }}
            · {{ microphoneActive(participant.participantId) ? 'Microfone ativo' : 'Microfone desligado' }}
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
  right: 8px;
  bottom: 8px;
  left: 8px;
  display: grid;
  gap: 1px;
  padding: 6px 8px;
  border-radius: 10px;
  color: #f4f7ff;
  background: rgba(4, 8, 18, 0.78);
  backdrop-filter: blur(8px);
}

.conference-tile__identity strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conference-tile__identity span {
  color: #b7c2d8;
  font-size: 9px;
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
