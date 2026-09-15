<script setup lang="ts">
/**
 * Controle apresentacional exclusivo da transcrição. Seleção e teste de
 * dispositivos pertencem ao painel unificado de câmera e microfone da sala.
 */
withDefaults(
  defineProps<{
    supported: boolean
    listening: boolean
    loading?: boolean
    error: string | null
    disabled?: boolean
    inputState?: 'idle' | 'waiting' | 'receiving'
    audioLevel?: number
    qualityStatus?: 'idle' | 'ready' | 'processing' | 'error'
    pendingAudioCount?: number
    backendEngine?: string
    backendModel?: string
    backendInferenceMs?: number
  }>(),
  {
    loading: false,
    disabled: false,
    inputState: 'idle',
    audioLevel: 0,
    qualityStatus: 'idle',
    pendingAudioCount: 0,
  },
)

const emit = defineEmits<{
  start: []
  stop: []
}>()

const ERROR_HINTS: Record<string, string> = {
  'not-allowed':
    'Permissão de microfone negada. Libere o microfone nas configurações do site e tente de novo.',
  'not-found': 'Nenhum microfone disponível. Conecte um dispositivo e tente novamente.',
  'not-readable': 'O microfone está ocupado ou indisponível em outro aplicativo.',
  overconstrained: 'A entrada selecionada não está mais disponível.',
  unavailable: 'A captura exige conexão segura e suporte à API de mídia.',
  'audio-capture': 'Não foi possível capturar o microfone selecionado.',
  'audio-processing-failed': 'O processamento PCM do microfone foi interrompido.',
  'audio-processing-stalled':
    'O microfone foi permitido, mas nenhum áudio chegou à captura. Confira a entrada selecionada e tente novamente.',
  AUDIO_QUEUE_FULL: 'A fila temporária está cheia. Pause e aguarde o backend concluir os segmentos.',
  AUDIO_EXPIRED: 'Um segmento temporário expirou antes de ser processado.',
  AUDIO_DELIVERY_FAILED: 'Não foi possível confirmar o processamento do áudio no backend.',
}
</script>

<template>
  <div class="mic">
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
      </div>

      <p
        class="mic__status"
        :class="{ live: listening, receiving: listening && inputState === 'receiving' }"
        role="status"
      >
        <template v-if="loading">Solicitando acesso ao microfone e preparando a captura PCM…</template>
        <template v-else-if="listening && inputState === 'waiting'">Microfone autorizado. Conectando a captura de áudio…</template>
        <template v-else-if="listening && inputState === 'receiving'">Capturando áudio em janelas de 5 segundos; somente o servidor produz e publica o texto.</template>
        <template v-else-if="listening">Captura ativa; aguardando os primeiros frames do microfone.</template>
        <template v-else>Microfone pausado. Nenhum áudio novo é enviado.</template>
      </p>

      <div
        v-if="listening && qualityStatus !== 'idle'"
        class="mic__quality"
        role="status"
        aria-live="polite"
      >
        <template v-if="qualityStatus === 'processing'">
          <strong>Processando {{ pendingAudioCount }} {{ pendingAudioCount === 1 ? 'segmento' : 'segmentos' }} no backend…</strong>
          <span>As próximas janelas continuam em uma fila efêmera e limitada.</span>
        </template>
        <template v-else-if="qualityStatus === 'ready'">
          <strong>ASR do backend pronto</strong>
          <span>Somente o servidor converte o áudio em texto final canônico.</span>
        </template>
        <template v-else>
          <strong>Processamento de transcrição indisponível</strong>
          <span>A falha fica visível e nenhum texto alternativo é inventado no cliente.</span>
        </template>
        <span v-if="backendEngine">
          Motor: {{ backendEngine }}<template v-if="backendModel">/{{ backendModel }}</template><template v-if="backendInferenceMs != null"> · {{ backendInferenceMs }} ms</template>
        </span>
        <small>O áudio é enviado em segmentos efêmeros e descartado após o processamento; não é gravado por padrão.</small>
      </div>

      <div
        v-if="listening && inputState === 'receiving'"
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
.mic {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mic__controls {
  display: flex;
  align-items: stretch;
  justify-content: center;
}

.mic__btn {
  position: relative;
  min-width: 240px;
  min-height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 13px 22px;
  border: 1px solid transparent;
  border-radius: 18px;
  color: #fff;
  background: var(--brand);
  box-shadow: var(--shadow-brand);
  font: 800 14.5px var(--body);
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.mic__btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.mic__btn.live {
  background: linear-gradient(115deg, #d84f6b, #c2415c);
  box-shadow: 0 14px 32px rgba(216, 79, 107, 0.28);
}

.mic__btn.preparing {
  background: linear-gradient(115deg, #5a6683, #424d68);
  box-shadow: 0 12px 28px rgba(30, 40, 66, 0.28);
}

.mic__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.mic__pulse {
  position: absolute;
  left: 16px;
  width: 9px;
  height: 9px;
  display: none;
  border-radius: 50%;
  background: #fff;
}

.mic__btn.live .mic__pulse,
.mic__btn.preparing .mic__pulse {
  display: block;
  animation: mic-pulse 1.4s ease-in-out infinite;
}

.mic__btn.preparing .mic__pulse {
  animation-duration: 0.9s;
}

.mic__status {
  max-width: 680px;
  margin: 0 auto;
  color: #8f9cb7;
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
}

.mic__status.live {
  color: #f0b6c1;
}

.mic__status.receiving {
  color: #8adfbd;
}

.mic__meter {
  width: min(100%, 680px);
  height: 5px;
  overflow: hidden;
  margin: 0 auto;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}

.mic__meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #46d795, #7de0ff);
  transition: width 0.12s linear;
}

.mic__quality,
.mic__unsupported,
.mic__error {
  width: min(100%, 680px);
  margin: 0 auto;
  border-radius: 12px;
  font-size: 12px;
}

.mic__quality {
  display: grid;
  gap: 5px;
  padding: 10px 13px;
  border: 1px solid rgba(130, 148, 190, 0.24);
  color: #cbd5eb;
  background: rgba(18, 27, 47, 0.72);
}

.mic__quality strong {
  color: #f2f5ff;
  font-size: 12.5px;
}

.mic__quality small {
  color: #8f9cb7;
}

.mic__unsupported,
.mic__error {
  padding: 10px 13px;
  border: 1px solid rgba(231, 88, 110, 0.3);
  color: #ffd4dc;
  background: rgba(68, 27, 39, 0.8);
}

@keyframes mic-pulse {
  50% { opacity: 0.35; transform: scale(0.78); }
}

@media (max-width: 620px) {
  .mic__btn {
    min-width: 194px;
    padding-inline: 16px;
    font-size: 13px;
  }
}
</style>
