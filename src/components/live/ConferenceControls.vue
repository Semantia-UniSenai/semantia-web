<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConferenceStatus } from '../../live/media/types'
import type {
  AudioInputDevice,
  AudioInputError,
  MicrophoneTestState,
} from '../../live/useAudioInputDevices'
import type {
  CameraTestState,
  VideoInputDevice,
  VideoInputError,
} from '../../live/useVideoInputDevices'

const props = withDefaults(
  defineProps<{
    mediaStatus: ConferenceStatus
    mediaError: { code: string; message: string } | null
    microphoneEnabled: boolean
    cameraEnabled: boolean
    microphonePending?: boolean
    cameraPending?: boolean
    videoDevicesSupported?: boolean
    videoDevices?: readonly VideoInputDevice[]
    selectedVideoDeviceId?: string
    videoDevicesLoading?: boolean
    videoDeviceError?: VideoInputError | null
    cameraTestState?: CameraTestState
    cameraTestStream?: MediaStream | null
    audioDevicesSupported?: boolean
    audioDevices?: readonly AudioInputDevice[]
    selectedAudioDeviceId?: string
    audioDevicesLoading?: boolean
    audioDeviceError?: AudioInputError | null
    microphoneTestState?: MicrophoneTestState
    microphoneTestLevel?: number
    microphoneTestMonitorEnabled?: boolean
    disabled?: boolean
  }>(),
  {
    disabled: false,
    microphonePending: false,
    cameraPending: false,
    videoDevicesSupported: false,
    videoDevices: () => [],
    selectedVideoDeviceId: 'default',
    videoDevicesLoading: false,
    videoDeviceError: null,
    cameraTestState: 'idle',
    cameraTestStream: null,
    audioDevicesSupported: false,
    audioDevices: () => [],
    selectedAudioDeviceId: 'default',
    audioDevicesLoading: false,
    audioDeviceError: null,
    microphoneTestState: 'idle',
    microphoneTestLevel: 0,
    microphoneTestMonitorEnabled: false,
  },
)

const emit = defineEmits<{
  'toggle-microphone': []
  'toggle-camera': []
  'refresh-video-devices': [requestPermission: boolean]
  'select-video-device': [deviceId: string]
  'refresh-audio-devices': [requestPermission: boolean]
  'select-audio-device': [deviceId: string]
  'start-camera-test': []
  'stop-camera-test': []
  'start-microphone-test': []
  'stop-microphone-test': []
  retry: []
}>()

const cameraSettingsOpen = ref(false)
const cameraPreview = ref<HTMLVideoElement | null>(null)
const cameraTestActive = computed(
  () => props.cameraTestState === 'requesting' || props.cameraTestState === 'previewing',
)
const microphoneTestActive = computed(
  () =>
    props.microphoneTestState === 'requesting' ||
    props.microphoneTestState === 'listening' ||
    props.microphoneTestState === 'working',
)
const microphoneLevelPercent = computed(() =>
  Math.round(Math.min(1, Math.max(0, props.microphoneTestLevel)) * 100),
)

watch(
  [cameraPreview, () => props.cameraTestStream],
  ([preview, stream]) => {
    if (preview && preview.srcObject !== stream) preview.srcObject = stream ?? null
  },
  { flush: 'post' },
)

function toggleCameraSettings() {
  cameraSettingsOpen.value = !cameraSettingsOpen.value
  if (cameraSettingsOpen.value) {
    emit('refresh-video-devices', false)
    emit('refresh-audio-devices', false)
  } else {
    closeLocalTests()
  }
}

function closeLocalTests() {
  if (cameraTestActive.value) emit('stop-camera-test')
  if (microphoneTestActive.value) emit('stop-microphone-test')
}

function closeCameraSettings() {
  cameraSettingsOpen.value = false
  closeLocalTests()
}

function selectVideoDevice(event: Event) {
  emit('select-video-device', (event.target as HTMLSelectElement).value)
}

function selectAudioDevice(event: Event) {
  emit('select-audio-device', (event.target as HTMLSelectElement).value)
}

function toggleCameraTest() {
  if (cameraTestActive.value) emit('stop-camera-test')
  else emit('start-camera-test')
}

function toggleMicrophoneTest() {
  if (microphoneTestActive.value) emit('stop-microphone-test')
  else emit('start-microphone-test')
}

const controlsDisabled = computed(
  () =>
    props.disabled ||
    props.mediaStatus === 'connecting' ||
    props.mediaStatus === 'reconnecting',
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
      :disabled="controlsDisabled || microphonePending"
      :aria-label="microphonePending ? 'Ativando áudio da chamada' : microphoneEnabled ? 'Desativar microfone da chamada' : 'Ativar microfone da chamada'"
      :aria-pressed="microphoneEnabled"
      :aria-busy="microphonePending || undefined"
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
        <strong>Áudio</strong>
        <small>{{ microphonePending ? 'Ativando…' : microphoneEnabled ? 'Microfone ativo' : 'Microfone desligado' }}</small>
      </span>
    </button>

    <button
      type="button"
      class="conference-control"
      :class="{ active: cameraEnabled }"
      :disabled="controlsDisabled || cameraPending"
      :aria-label="cameraPending ? 'Ativando vídeo da chamada' : cameraEnabled ? 'Desativar câmera da chamada' : 'Ativar câmera da chamada'"
      :aria-pressed="cameraEnabled"
      :aria-busy="cameraPending || undefined"
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
        <small>{{ cameraPending ? 'Ativando…' : cameraEnabled ? 'Câmera ativa' : 'Câmera desligada' }}</small>
      </span>
    </button>

    <button
      v-if="videoDevicesSupported || audioDevicesSupported"
      type="button"
      class="camera-settings-trigger"
      aria-label="Testar câmera e microfone"
      aria-haspopup="dialog"
      :aria-expanded="cameraSettingsOpen"
      :disabled="disabled || cameraPending || microphonePending"
      @click="toggleCameraSettings"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
      </svg>
    </button>

    <section
      v-if="cameraSettingsOpen"
      class="camera-settings"
      role="dialog"
      aria-label="Testar câmera e microfone"
      @keydown.esc="closeCameraSettings"
    >
      <header>
        <div>
          <small>Antes de falar com outras pessoas</small>
          <strong>Testar câmera e microfone</strong>
        </div>
        <button type="button" aria-label="Fechar teste de câmera e microfone" @click="closeCameraSettings">×</button>
      </header>

      <div class="device-test-grid">
        <section class="device-test" aria-labelledby="camera-test-title">
          <div>
            <small>Vídeo local</small>
            <h3 id="camera-test-title">Sua câmera</h3>
          </div>
          <div class="camera-preview">
            <video
              v-if="cameraTestStream"
              ref="cameraPreview"
              aria-label="Prévia da sua câmera"
              autoplay
              muted
              playsinline
            ></video>
            <div v-else class="camera-preview__empty">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>
              <span>{{ cameraTestState === 'requesting' ? 'Abrindo câmera…' : 'A câmera está desligada' }}</span>
            </div>
          </div>
          <label for="conference-camera-select">Câmera</label>
          <select
            id="conference-camera-select"
            :value="selectedVideoDeviceId"
            :disabled="videoDevicesLoading || videoDevices.length === 0 || cameraTestState === 'requesting'"
            @change="selectVideoDevice"
          >
            <option v-if="videoDevices.length === 0" value="default">
              {{ videoDevicesLoading ? 'Buscando câmeras…' : 'Câmera padrão' }}
            </option>
            <option v-for="device in videoDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label }}
            </option>
          </select>
          <p v-if="videoDeviceError" role="alert">Não foi possível acessar a câmera. Confira a permissão do navegador.</p>
          <button
            type="button"
            class="device-test__action"
            :aria-label="cameraTestState === 'previewing' ? 'Parar teste da câmera' : cameraTestState === 'requesting' ? 'Abrindo câmera' : 'Testar câmera'"
            :disabled="cameraTestState === 'requesting'"
            @click="toggleCameraTest"
          >
            {{ cameraTestState === 'previewing' ? 'Parar teste' : cameraTestState === 'requesting' ? 'Abrindo…' : 'Testar câmera' }}
          </button>
          <small>A prévia fica somente neste dispositivo e não entra na chamada.</small>
        </section>

        <section class="device-test" aria-labelledby="microphone-test-title">
          <div>
            <small>Áudio local</small>
            <h3 id="microphone-test-title">Seu microfone</h3>
          </div>
          <label for="conference-microphone-select">Microfone</label>
          <select
            id="conference-microphone-select"
            :value="selectedAudioDeviceId"
            :disabled="audioDevicesLoading || audioDevices.length === 0 || microphoneTestState === 'requesting'"
            @change="selectAudioDevice"
          >
            <option v-if="audioDevices.length === 0" value="default">
              {{ audioDevicesLoading ? 'Buscando microfones…' : 'Microfone padrão' }}
            </option>
            <option v-for="device in audioDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label }}
            </option>
          </select>
          <div
            class="microphone-meter"
            role="meter"
            aria-label="Nível do microfone"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="microphoneLevelPercent"
          >
            <span :style="{ width: `${microphoneLevelPercent}%` }"></span>
          </div>
          <p v-if="audioDeviceError" role="alert">Não foi possível acessar o microfone. Confira a permissão do navegador.</p>
          <p v-else-if="microphoneTestMonitorEnabled" class="device-test__success" role="status">Você está ouvindo seu próprio microfone.</p>
          <p v-else class="device-test__hint">Fale para conferir o nível e o som capturado.</p>
          <button
            type="button"
            class="device-test__action"
            :aria-label="microphoneTestActive ? 'Parar teste do microfone' : 'Ouvir meu microfone'"
            :disabled="microphoneTestState === 'requesting'"
            @click="toggleMicrophoneTest"
          >
            {{ microphoneTestActive ? 'Parar teste' : 'Ouvir meu microfone' }}
          </button>
          <small>Use fones de ouvido para evitar eco. O teste não é enviado nem gravado.</small>
        </section>
      </div>
    </section>

    <span
      class="conference-controls__status"
      :class="{ 'conference-controls__status--visible': mediaStatus !== 'connected' }"
      role="status"
    >{{ statusLabel }}</span>

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

.conference-controls__status--visible {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  padding: 6px 9px;
  border-radius: 999px;
  color: #c5d0e7;
  background: rgba(255, 255, 255, 0.055);
  font-size: 10px;
  font-weight: 750;
  white-space: nowrap;
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

.camera-settings-trigger {
  width: 44px;
  min-width: 44px;
  min-height: 54px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(202, 216, 244, 0.14);
  border-radius: 14px;
  color: #b8c4dc;
  background: rgba(255, 255, 255, 0.045);
  cursor: pointer;
}

.camera-settings-trigger:disabled {
  opacity: 0.5;
  cursor: default;
}

.camera-settings-trigger svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.camera-settings {
  position: absolute;
  z-index: 8;
  bottom: calc(100% + 12px);
  left: 0;
  width: min(720px, calc(100vw - 24px));
  display: grid;
  gap: 10px;
  padding: 15px;
  border: 1px solid rgba(202, 216, 244, 0.2);
  border-radius: 18px;
  color: #eaf0ff;
  background: #141e32;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.38);
}

.camera-settings header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.camera-settings header div {
  display: grid;
  gap: 2px;
}

.camera-settings header small,
.camera-settings > small {
  color: #95a3bf;
  font-size: 10px;
}

.camera-settings header strong {
  font-size: 14px;
}

.camera-settings header button {
  width: 44px;
  height: 44px;
  border: 1px solid rgba(202, 216, 244, 0.16);
  border-radius: 12px;
  color: #eaf0ff;
  background: rgba(255, 255, 255, 0.05);
  font: 700 20px var(--body);
  cursor: pointer;
}

.camera-settings label {
  font-size: 11px;
  font-weight: 800;
}

.device-test-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.device-test {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 13px;
  border: 1px solid rgba(202, 216, 244, 0.14);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.035);
}

.device-test h3,
.device-test p {
  margin: 0;
}

.device-test h3 {
  color: #f4f7ff;
  font-size: 14px;
}

.camera-preview {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  display: grid;
  place-items: center;
  border: 1px solid rgba(202, 216, 244, 0.14);
  border-radius: 13px;
  background: #080d19;
}

.camera-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}

.camera-preview__empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  color: #95a3bf;
  font-size: 11px;
}

.camera-preview__empty svg {
  width: 28px;
  height: 28px;
  fill: none;
  stroke: currentColor;
}

.microphone-meter {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.microphone-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #67d9d2, #8f7bea);
  transition: width 80ms linear;
}

.device-test__action {
  min-height: 44px;
  padding: 9px 12px;
  border: 1px solid rgba(117, 212, 214, 0.35);
  border-radius: 11px;
  color: #efffff;
  background: rgba(117, 212, 214, 0.12);
  font: 750 11px var(--body);
  cursor: pointer;
}

.device-test__action:disabled {
  opacity: 0.6;
  cursor: wait;
}

.device-test__hint,
.device-test__success {
  min-height: 30px;
  color: #aebbd3;
  font-size: 11px;
}

.device-test__success {
  color: #83e1bb;
}

.camera-settings select {
  min-height: 44px;
  width: 100%;
  padding: 0 12px;
  border: 1px solid rgba(202, 216, 244, 0.2);
  border-radius: 12px;
  color: #f4f7ff;
  background: #202b43;
  font: 650 12px var(--body);
}

.camera-settings p {
  margin: 0;
  color: #ffd4dc;
  font-size: 11px;
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

  .camera-settings {
    position: fixed;
    inset: auto 8px 74px;
    width: auto;
    max-height: calc(100svh - 92px);
    overflow-y: auto;
    padding-bottom: 28px;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .camera-settings > header {
    position: sticky;
    z-index: 2;
    top: -15px;
    margin: -15px -15px 0;
    padding: 15px;
    background: #141e32;
  }

  .device-test-grid {
    grid-template-columns: 1fr;
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
