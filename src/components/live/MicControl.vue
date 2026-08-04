<script setup lang="ts">
/**
 * Controle apresentacional de transcrição e áudio. O componente nunca captura,
 * persiste ou envia áudio; descoberta, teste e ASR ficam nos composables da sala.
 */
import { computed, ref, watch } from 'vue'
import type {
  AudioInputDevice,
  AudioInputError,
  MicrophoneTestState,
} from '../../live/useAudioInputDevices'

const props = withDefaults(
  defineProps<{
    supported: boolean
    listening: boolean
    loading?: boolean
    error: string | null
    disabled?: boolean
    localEngine?: boolean
    inputState?: 'idle' | 'waiting' | 'silent' | 'receiving'
    audioLevel?: number
    transport?: 'direct' | 'switching' | 'compatible'
    hasHypothesis?: boolean
    qualityStatus?: 'idle' | 'loading' | 'ready' | 'processing' | 'error'
    qualityProgress?: number
    backendAsr?: boolean
    pendingAudioCount?: number
    backendEngine?: string
    backendModel?: string
    backendInferenceMs?: number

    audioDevicesSupported?: boolean
    audioDevices?: readonly AudioInputDevice[]
    selectedDeviceId?: string
    audioDevicesLoading?: boolean
    audioDeviceError?: AudioInputError | null
    microphoneTestState?: MicrophoneTestState
    microphoneTestLevel?: number
  }>(),
  {
    audioDevicesSupported: true,
    audioDevices: () => [],
    selectedDeviceId: 'default',
    microphoneTestState: 'idle',
    microphoneTestLevel: 0,
    qualityStatus: 'idle',
    qualityProgress: 0,
    backendAsr: false,
    pendingAudioCount: 0,
  },
)

const emit = defineEmits<{
  start: []
  stop: []
  'refresh-audio-devices': [requestPermission: boolean]
  'select-audio-device': [deviceId: string]
  'start-microphone-test': []
  'stop-microphone-test': []
}>()

const settingsOpen = ref(false)
const localSelectedDeviceId = ref(props.selectedDeviceId)
watch(
  () => props.selectedDeviceId,
  (value) => (localSelectedDeviceId.value = value),
)

const selectedDeviceLabel = computed(
  () =>
    props.audioDevices.find(
      (device) => device.deviceId === localSelectedDeviceId.value,
    )?.label ?? 'Microfone padrão',
)
const testActive = computed(() =>
  ['requesting', 'listening', 'working'].includes(props.microphoneTestState),
)
const activeTestBars = computed(() =>
  Math.ceil(Math.max(0, Math.min(1, props.microphoneTestLevel)) * 12),
)

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) emit('refresh-audio-devices', true)
  else if (testActive.value) emit('stop-microphone-test')
}

function closeSettings() {
  settingsOpen.value = false
  if (testActive.value) emit('stop-microphone-test')
}

function selectAudioDevice(event: Event) {
  const deviceId = (event.target as HTMLSelectElement).value
  localSelectedDeviceId.value = deviceId
  emit('select-audio-device', deviceId)
}

const ERROR_HINTS: Record<string, string> = {
  'not-allowed':
    'Permissão de microfone negada. Libere o microfone nas configurações do site e tente de novo.',
  'service-not-allowed':
    'O serviço de voz nativo foi bloqueado. A transcrição local será iniciada.',
  'audio-capture': 'Nenhum microfone encontrado. Conecte um microfone e tente de novo.',
  'start-failed': 'Não foi possível iniciar a captura nativa. Tentando transcrição local.',
  network: 'O serviço de voz nativo não respondeu. A transcrição local será iniciada.',
  'no-speech-limit':
    'O reconhecimento nativo encerrou repetidamente sem texto. A transcrição local será iniciada sem trocar de navegador.',
  'model-load-failed':
    'Não foi possível carregar o modelo local de transcrição. Verifique a conexão e tente novamente.',
  'recognition-failed':
    'O reconhecimento local foi interrompido. Inicie a transcrição novamente.',
  'recognition-no-results':
    'Sua voz foi detectada, mas o reconhecedor não produziu texto após tentar os dois modos locais. Confira o microfone, fale uma frase mais longa e tente novamente.',
  'audio-processing-stalled':
    'O microfone foi permitido, mas nenhum áudio chegou ao transcritor. Confira a entrada selecionada e tente novamente.',
}

const AUDIO_DEVICE_ERROR_HINTS: Record<AudioInputError, string> = {
  'not-allowed':
    'Permita o acesso ao microfone nas configurações do site para listar e testar suas entradas.',
  'not-found': 'Nenhum microfone disponível. Conecte um dispositivo e atualize a lista.',
  'not-readable':
    'Este microfone está ocupado ou indisponível. Feche outros aplicativos que possam estar usando-o.',
  overconstrained:
    'O microfone selecionado não está mais disponível. Escolha outra entrada.',
  unavailable:
    'A seleção de microfone exige uma conexão segura e suporte a dispositivos de mídia.',
  unknown: 'Não foi possível acessar o microfone. Verifique o dispositivo e tente novamente.',
}
</script>

<template>
  <div class="mic" @keydown.esc.stop="closeSettings">
    <div v-if="!supported" class="mic__unsupported" role="alert">
      <strong>Captura de áudio indisponível.</strong>
      Atualize o navegador ou verifique se a página foi aberta por uma conexão segura.
    </div>

    <template v-else>
      <div class="mic__controls">
        <button
          type="button"
          class="mic__btn"
          :class="{ live: listening, preparing: loading }"
          :disabled="disabled"
          @click="listening || loading ? emit('stop') : emit('start')"
        >
          <span class="mic__pulse" aria-hidden="true"></span>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span v-if="loading">Cancelar preparação</span>
          <span v-else-if="listening">Pausar transcrição</span>
          <span v-else>Iniciar transcrição</span>
        </button>

        <button
          v-if="audioDevicesSupported"
          type="button"
          class="mic__device-trigger"
          aria-haspopup="dialog"
          aria-label="Escolher e testar microfone"
          :aria-expanded="settingsOpen"
          aria-controls="audio-settings"
          :disabled="disabled"
          title="Escolher e testar microfone"
          @click="toggleSettings"
        >
          <span class="mic__device-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="2" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </span>
          <span class="mic__device-copy">
            <small>Entrada de áudio</small>
            <strong>{{ selectedDeviceLabel }}</strong>
          </span>
          <svg class="mic__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <section
        v-if="settingsOpen"
        id="audio-settings"
        class="mic-settings"
        role="dialog"
        aria-labelledby="audio-settings-title"
        @keydown.esc="closeSettings"
      >
        <header class="mic-settings__header">
          <div>
            <span class="mic-settings__eyebrow">Áudio</span>
            <h2 id="audio-settings-title">Configurações de áudio</h2>
          </div>
          <button type="button" class="mic-settings__close" aria-label="Fechar configurações de áudio" @click="closeSettings">×</button>
        </header>

        <div class="mic-settings__field">
          <div class="mic-settings__label-row">
            <label for="audio-input-device">Microfone</label>
            <button
              type="button"
              class="mic-settings__refresh"
              :disabled="audioDevicesLoading"
              @click="emit('refresh-audio-devices', true)"
            >{{ audioDevicesLoading ? 'Atualizando…' : 'Atualizar' }}</button>
          </div>
          <div class="mic-settings__select-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="2" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <select
              id="audio-input-device"
              :value="localSelectedDeviceId"
              :disabled="audioDevicesLoading || audioDevices.length === 0"
              @change="selectAudioDevice"
            >
              <option v-if="audioDevices.length === 0" value="default">
                {{ audioDevicesLoading ? 'Buscando microfones…' : 'Nenhum microfone listado' }}
              </option>
              <option v-for="device in audioDevices" :key="device.deviceId" :value="device.deviceId">
                {{ device.label }}
              </option>
            </select>
            <svg class="mic-settings__select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <p v-if="localSelectedDeviceId !== 'default'" class="mic__local-note">
            <template v-if="backendAsr">A entrada selecionada é capturada neste navegador; os finais são processados pelo ASR protegido do backend.</template>
            <template v-else>Para respeitar esta entrada, a transcrição usa processamento local no navegador.</template>
          </p>
        </div>

        <div class="mic-test">
          <div class="mic-test__heading">
            <div>
              <strong>Teste do microfone</strong>
              <small>Fale normalmente e observe o nível abaixo.</small>
            </div>
            <span v-if="microphoneTestState === 'working'" class="mic-test__check" aria-hidden="true">✓</span>
          </div>

          <div
            class="mic-test__meter"
            role="progressbar"
            aria-label="Nível do teste do microfone"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(microphoneTestLevel * 100)"
          >
            <span
              v-for="bar in 12"
              :key="bar"
              class="mic-test__bar"
              :class="{ active: bar <= activeTestBars }"
              :style="{ height: `${10 + ((bar * 7) % 17)}px` }"
            ></span>
          </div>

          <div class="mic-test__footer">
            <p class="mic-test__status" role="status">
              <template v-if="microphoneTestState === 'requesting'">Solicitando acesso ao microfone…</template>
              <template v-else-if="microphoneTestState === 'working'">Seu microfone está funcionando</template>
              <template v-else-if="microphoneTestState === 'listening'">Fale para verificar o sinal</template>
              <template v-else-if="microphoneTestState === 'error'">Não foi possível concluir o teste</template>
              <template v-else>Pronto para testar</template>
            </p>
            <button
              type="button"
              class="mic-test__action"
              :disabled="audioDevicesLoading || microphoneTestState === 'requesting'"
              @click="testActive ? emit('stop-microphone-test') : emit('start-microphone-test')"
            >{{ testActive ? 'Parar teste' : 'Testar microfone' }}</button>
          </div>
        </div>

        <p v-if="audioDeviceError" class="mic-settings__error" role="alert">
          {{ AUDIO_DEVICE_ERROR_HINTS[audioDeviceError] }}
        </p>
        <p class="mic-settings__privacy">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" />
          </svg>
          O áudio do teste não é enviado nem gravado; o nível é calculado neste navegador.
        </p>
      </section>

      <p
        class="mic__status"
        :class="{
          live: listening,
          receiving: listening && inputState === 'receiving',
          warning: listening && inputState === 'silent',
          recovering: listening && transport === 'switching',
        }"
        role="status"
      >
        <template v-if="loading">Preparando o modelo de português. Na primeira vez pode levar até cerca de um minuto; reunião e chat continuam disponíveis.</template>
        <template v-else-if="listening && localEngine && inputState === 'waiting'">Microfone autorizado. Conectando o processamento de áudio…</template>
        <template v-else-if="listening && localEngine && transport === 'switching'">Ajustando compatibilidade automaticamente — mantenha o microfone ativo…</template>
        <template v-else-if="listening && localEngine && inputState === 'silent'">Microfone conectado, mas sem sinal de voz. Fale normalmente ou confira a entrada selecionada.</template>
        <template v-else-if="listening && localEngine && inputState === 'receiving' && hasHypothesis">
          {{ backendAsr ? 'Prévia local ativa — o servidor confirmará o texto final.' : 'Transcrição local confirmada — o texto está sendo exibido em tempo real.' }}
        </template>
        <template v-else-if="listening && localEngine && inputState === 'receiving' && transport === 'compatible'">Modo compatível ativo — áudio recebido, aguardando a primeira hipótese textual.</template>
        <template v-else-if="listening && localEngine && inputState === 'receiving'">Sinal de voz detectado — aguardando a primeira hipótese textual.</template>
        <template v-else-if="listening">Transcrevendo — a plateia está vendo sua fala em texto.</template>
        <template v-else>Microfone pausado. A plateia não recebe texto novo.</template>
      </p>
      <div
        v-if="listening && localEngine && qualityStatus !== 'idle'"
        class="mic__quality"
        role="status"
        aria-live="polite"
      >
        <template v-if="backendAsr">
          <template v-if="qualityStatus === 'loading'">
            <strong>Preparando o ASR do backend…</strong>
            <span>A captura local continua enquanto o serviço fica disponível.</span>
          </template>
          <template v-else-if="qualityStatus === 'processing'">
            <strong>Processando {{ pendingAudioCount }} {{ pendingAudioCount === 1 ? 'segmento' : 'segmentos' }} no backend…</strong>
            <span>As próximas falas continuam sendo capturadas em uma fila limitada.</span>
          </template>
          <template v-else-if="qualityStatus === 'ready'">
            <strong>ASR do backend pronto</strong>
            <span>As prévias são locais; somente o servidor publica o texto final canônico.</span>
          </template>
          <template v-else>
            <strong>Processamento final temporariamente indisponível</strong>
            <span>Nenhum final local de baixa qualidade será publicado silenciosamente.</span>
          </template>
          <span v-if="backendEngine">
            Motor: {{ backendEngine }}<template v-if="backendModel">/{{ backendModel }}</template><template v-if="backendInferenceMs != null"> · {{ backendInferenceMs }} ms</template>
          </span>
          <small>O áudio é enviado em segmentos efêmeros e descartado após o processamento; não é gravado por padrão.</small>
        </template>
        <template v-else>
          <template v-if="qualityStatus === 'loading'">
            <strong>Aprimorando a precisão local — {{ Math.round(qualityProgress) }}%</strong>
            <span>O modelo de qualidade é preparado em segundo plano; as legendas rápidas continuam disponíveis.</span>
            <div
              class="mic__quality-progress"
              role="progressbar"
              aria-label="Preparação do modelo local de qualidade"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="Math.round(qualityProgress)"
            ><span :style="{ width: `${Math.round(qualityProgress)}%` }"></span></div>
          </template>
          <template v-else-if="qualityStatus === 'processing'">
            <strong>Refinando a última legenda localmente…</strong>
            <span>As próximas falas continuam sendo capturadas.</span>
          </template>
          <template v-else-if="qualityStatus === 'ready'">
            <strong>Precisão local aprimorada pronta</strong>
            <span>Os resultados finais são revisados antes da publicação.</span>
          </template>
          <template v-else>
            <strong>Aprimoramento indisponível</strong>
            <span>Os resultados finais continuam pelo reconhecedor local rápido.</span>
          </template>
          <small>O áudio permanece neste navegador e não é enviado ao servidor.</small>
        </template>
      </div>
      <div
        v-if="listening && localEngine && inputState !== 'waiting'"
        class="mic__meter"
        role="progressbar"
        aria-label="Nível do microfone"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round((audioLevel ?? 0) * 100)"
      >
        <span :style="{ width: `${Math.round((audioLevel ?? 0) * 100)}%` }"></span>
      </div>
    </template>

    <p v-if="error" class="mic__error" role="alert">
      {{ ERROR_HINTS[error] ?? 'Erro na transcrição: ' + error }}
    </p>
  </div>
</template>

<style scoped>
.mic{position:relative;display:flex;flex-direction:column;gap:8px}.mic__controls{display:flex;align-items:stretch;justify-content:center;gap:10px}.mic__btn,.mic__device-trigger{min-height:54px;border:1px solid transparent;border-radius:18px;color:#fff;font:inherit;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}.mic__btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-width:240px;padding:13px 22px;background:var(--brand);font-weight:800;font-size:14.5px;box-shadow:var(--shadow-brand)}.mic__btn:hover:not(:disabled),.mic__device-trigger:hover:not(:disabled){transform:translateY(-1px)}.mic__btn.live{background:linear-gradient(115deg,#d84f6b,#c2415c);box-shadow:0 14px 32px rgba(216,79,107,.28)}.mic__btn.preparing{background:linear-gradient(115deg,#5a6683,#424d68);box-shadow:0 12px 28px rgba(30,40,66,.28)}.mic__btn:disabled,.mic__device-trigger:disabled{opacity:.5;cursor:default}.mic__pulse{display:none;position:absolute;left:16px;width:9px;height:9px;border-radius:50%;background:#fff}.mic__btn.live .mic__pulse,.mic__btn.preparing .mic__pulse{display:block;animation:mic-pulse 1.4s ease-in-out infinite}.mic__btn.preparing .mic__pulse{animation-duration:.9s}.mic__device-trigger{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;width:min(330px,38vw);padding:8px 13px;background:#1b2439;border-color:rgba(255,255,255,.13);text-align:left;box-shadow:0 10px 28px rgba(4,8,20,.2)}.mic__device-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.08);color:#e7ecfa}.mic__device-copy{display:grid;min-width:0;gap:2px}.mic__device-copy small{color:#8996b4;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.mic__device-copy strong{overflow:hidden;color:#eef2ff;font-size:12.5px;text-overflow:ellipsis;white-space:nowrap}.mic__chevron{color:#aeb8cd}.mic__status{margin:0;text-align:center;font-size:13px;color:var(--muted)}.mic__status.live{color:#f2a4b5;font-weight:600}.mic__status.receiving{color:#69e5b1}.mic__status.warning{color:#f1c770}.mic__status.recovering{color:#8dc6ff}.mic__meter{width:min(570px,100%);height:6px;margin:0 auto;overflow:hidden;border-radius:999px;background:rgba(126,139,170,.22)}.mic__meter span{display:block;min-width:2px;height:100%;border-radius:inherit;background:linear-gradient(90deg,#54dda3,#d8b14f,#d84f6b);transition:width 120ms linear}.mic-settings{position:absolute;z-index:20;left:50%;bottom:calc(100% + 14px);width:min(440px,calc(100vw - 40px));padding:20px;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:#1b2232;color:#f5f7fc;box-shadow:0 24px 70px rgba(2,6,18,.48);transform:translateX(-50%)}.mic-settings::after{position:absolute;bottom:-7px;left:50%;width:14px;height:14px;background:#1b2232;border-right:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12);content:"";transform:translateX(-50%) rotate(45deg)}.mic-settings__header,.mic-settings__label-row,.mic-test__heading,.mic-test__footer{display:flex;align-items:center;justify-content:space-between;gap:14px}.mic-settings__header h2{margin:2px 0 0;font-size:18px}.mic-settings__eyebrow{color:#e98299;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.mic-settings__close{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.07);color:#dce4f5;font-size:24px;cursor:pointer}.mic-settings__field{display:grid;gap:8px;margin-top:20px}.mic-settings__label-row label,.mic-test__heading strong{font-size:13px;font-weight:800}.mic-settings__refresh{border:0;background:transparent;color:#f08aa0;font:700 12px var(--display);cursor:pointer}.mic-settings__select-wrap{position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;min-height:50px;padding:0 13px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:#121827;color:#aeb9d0}.mic-settings__select-wrap:focus-within{border-color:#e56b85;box-shadow:0 0 0 3px rgba(229,107,133,.14)}.mic-settings__select-wrap select{width:100%;height:48px;border:0;outline:0;appearance:none;background:transparent;color:#f1f4fb;font:600 13px var(--display)}.mic-settings__select-wrap option{background:#1b2232;color:#fff}.mic-settings__select-chevron{pointer-events:none}.mic__local-note{margin:0;color:#a8b2c7;font-size:11.5px;line-height:1.5}.mic-test{display:grid;gap:13px;margin-top:16px;padding:15px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(6,10,20,.25)}.mic-test__heading>div{display:grid;gap:3px}.mic-test__heading small{color:#919db5;font-size:11.5px}.mic-test__check{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:rgba(65,211,145,.15);color:#65dda8;font-weight:900}.mic-test__meter{display:flex;align-items:center;gap:5px;height:30px;padding:0 2px}.mic-test__bar{width:7px;min-height:7px;border-radius:999px;background:#394256;transition:height 100ms ease,background 100ms ease,transform 100ms ease}.mic-test__bar.active{background:linear-gradient(180deg,#74e5b7,#44c992);transform:scaleY(1.08)}.mic-test__status{margin:0;color:#aeb8cc;font-size:11.5px}.mic-test__action{min-height:38px;padding:8px 13px;border:1px solid rgba(235,113,138,.45);border-radius:11px;background:rgba(235,113,138,.11);color:#f59aad;font:800 11.5px var(--display);cursor:pointer}.mic-settings__error{margin:14px 0 0;padding:10px 12px;border:1px solid rgba(240,116,137,.3);border-radius:12px;background:rgba(221,73,101,.1);color:#ffadbc;font-size:12px;line-height:1.45}.mic-settings__privacy{display:flex;align-items:flex-start;gap:7px;margin:14px 0 0;color:#8995ad;font-size:10.5px;line-height:1.45}.mic-settings__privacy svg{flex:0 0 auto;margin-top:1px;color:#65dda8}.mic__error,.mic__unsupported{margin:0;padding:12px 14px;border:1px solid rgba(216,79,107,.3);border-radius:12px;background:rgba(216,79,107,.09);color:#ffadbc;font-size:13px}.mic__unsupported{background:rgba(255,176,32,.1);border-color:rgba(255,176,32,.4);color:#f1c770}@keyframes mic-pulse{50%{opacity:.3;transform:scale(.8)}}@media(max-width:760px){.mic__controls{align-items:stretch}.mic__btn{min-width:0;flex:1;padding-inline:16px}.mic__device-trigger{width:58px;grid-template-columns:1fr;padding:8px}.mic__device-copy,.mic__chevron{display:none}.mic__device-icon{margin:auto}.mic-settings{position:fixed;right:12px;bottom:84px;left:12px;width:auto;max-height:calc(100svh - 104px);overflow-y:auto;transform:none}.mic-settings::after{display:none}}@media(prefers-reduced-motion:reduce){.mic__btn,.mic__device-trigger,.mic-test__bar,.mic__meter span{transition:none}.mic__btn.live .mic__pulse,.mic__btn.preparing .mic__pulse{animation:none}}
.mic__quality{display:grid;gap:5px;width:min(100%,680px);margin:2px auto 0;padding:10px 13px;border:1px solid rgba(130,148,190,.24);border-radius:12px;background:rgba(18,27,47,.72);color:#cbd5eb;font-size:12px}.mic__quality strong{color:#f2f5ff;font-size:12.5px}.mic__quality small{color:#8f9cb7}.mic__quality-progress{height:5px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.1)}.mic__quality-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#46d795,#7de0ff);transition:width .2s ease}
</style>
