<script setup lang="ts">
import { computed } from 'vue'
import type { ConferenceStatus } from '../../live/media/types'

const props = withDefaults(
  defineProps<{
    mediaStatus: ConferenceStatus
    mediaError: { code: string; message: string } | null
    microphoneEnabled: boolean
    cameraEnabled: boolean
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  'toggle-microphone': []
  'toggle-camera': []
  retry: []
}>()

const controlsDisabled = computed(
  () => props.disabled || props.mediaStatus !== 'connected',
)
const statusLabel = computed(() => {
  if (props.mediaStatus === 'connecting') return 'Conectando chamada…'
  if (props.mediaStatus === 'reconnecting') return 'Reconectando chamada…'
  if (props.mediaStatus === 'connected') return 'Chamada conectada'
  return 'Chamada indisponível'
})
</script>

<template>
  <div class="conference-controls" aria-label="Controles de áudio e vídeo">
    <button
      type="button"
      class="conference-control"
      :class="{ active: microphoneEnabled }"
      :disabled="controlsDisabled"
      :aria-label="microphoneEnabled ? 'Desativar microfone da chamada' : 'Ativar microfone da chamada'"
      :aria-pressed="microphoneEnabled"
      @click="emit('toggle-microphone')"
    >
      <span class="conference-control__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          <path v-if="!microphoneEnabled" d="M4 4l16 16" />
        </svg>
      </span>
      <span>
        <strong>Chamada</strong>
        <small>{{ microphoneEnabled ? 'Microfone ativo' : 'Microfone desligado' }}</small>
      </span>
    </button>

    <button
      type="button"
      class="conference-control"
      :class="{ active: cameraEnabled }"
      :disabled="controlsDisabled"
      :aria-label="cameraEnabled ? 'Desativar câmera da chamada' : 'Ativar câmera da chamada'"
      :aria-pressed="cameraEnabled"
      @click="emit('toggle-camera')"
    >
      <span class="conference-control__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="m16 10 5-3v10l-5-3" />
          <path v-if="!cameraEnabled" d="M4 4l16 16" />
        </svg>
      </span>
      <span>
        <strong>Vídeo</strong>
        <small>{{ cameraEnabled ? 'Câmera ativa' : 'Câmera desligada' }}</small>
      </span>
    </button>

    <span class="conference-controls__status" role="status">{{ statusLabel }}</span>

    <div v-if="mediaError" class="conference-controls__error" role="alert">
      <span>{{ mediaError.message }}. A reunião e a legenda continuam disponíveis.</span>
      <button
        type="button"
        data-testid="retry-media"
        :disabled="disabled"
        @click="emit('retry')"
      >
        Tentar mídia novamente
      </button>
    </div>
  </div>
</template>

<style scoped>
.conference-controls {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.conference-control {
  min-width: 126px;
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 6px 6px;
  border: 1px solid transparent;
  border-radius: 16px;
  color: #f4f7ff;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.conference-control:hover:not(:disabled),
.conference-control.active {
  border-color: rgba(202, 216, 244, 0.18);
  background: #172238;
}

.conference-control:disabled {
  opacity: 0.5;
  cursor: default;
}

.conference-control:focus-visible,
.conference-controls__error button:focus-visible {
  outline: 3px solid #8ec5ff;
  outline-offset: 3px;
}

.conference-control__icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #dce5fa;
  background: rgba(255, 255, 255, 0.065);
}

.conference-control.active .conference-control__icon {
  color: #10232f;
  background: #75d4d6;
}

.conference-control svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.conference-control > span:last-child {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.conference-control strong,
.conference-control small {
  white-space: nowrap;
}

.conference-control strong {
  font-size: 12px;
}

.conference-control small {
  color: #9eabc4;
  font-size: 9px;
  font-weight: 650;
}

.conference-controls__status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.conference-controls__error {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  width: min(420px, calc(100vw - 24px));
  display: grid;
  gap: 8px;
  padding: 11px 12px;
  border: 1px solid rgba(255, 154, 172, 0.38);
  border-radius: 12px;
  color: #ffd4dc;
  background: rgba(68, 27, 39, 0.97);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.34);
  font-size: 11px;
}

.conference-controls__error button {
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 10px;
  color: #fff;
  background: rgba(255, 255, 255, 0.09);
  font: 750 11px var(--body);
  cursor: pointer;
}

@media (max-width: 620px) {
  .conference-control {
    min-width: 44px;
    width: 44px;
    min-height: 44px;
    padding: 2px;
  }

  .conference-controls {
    gap: 4px;
  }

  .conference-control__icon {
    width: 38px;
    height: 38px;
  }

  .conference-control > span:last-child {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
}
</style>
