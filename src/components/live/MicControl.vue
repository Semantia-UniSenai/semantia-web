<script setup lang="ts">
/**
 * Controle de transcrição do comunicador — presentacional; a captura escolhe
 * reconhecimento nativo ou ASR local no navegador na LiveRoomView.
 */
defineProps<{
  supported: boolean
  listening: boolean
  loading?: boolean
  error: string | null
  disabled?: boolean
  localEngine?: boolean
  inputState?: 'idle' | 'waiting' | 'silent' | 'receiving'
  audioLevel?: number
}>()

const emit = defineEmits<{
  start: []
  stop: []
}>()

const ERROR_HINTS: Record<string, string> = {
  'not-allowed':
    'Permissão de microfone negada. Libere o microfone nas configurações do site e tente de novo.',
  'service-not-allowed':
    'O serviço de voz nativo foi bloqueado. A transcrição local será iniciada.',
  'audio-capture': 'Nenhum microfone encontrado. Conecte um microfone e tente de novo.',
  'start-failed': 'Não foi possível iniciar a captura nativa. Tentando transcrição local.',
  network:
    'O serviço de voz nativo não respondeu. A transcrição local será iniciada.',
  'model-load-failed':
    'Não foi possível carregar o modelo local de transcrição. Verifique a conexão e tente novamente.',
  'recognition-failed':
    'O reconhecimento local foi interrompido. Inicie a transcrição novamente.',
  'audio-processing-stalled':
    'O microfone foi permitido, mas nenhum áudio chegou ao transcritor. Confira a entrada selecionada e tente novamente.',
}
</script>

<template>
  <div class="mic">
    <div v-if="!supported" class="mic__unsupported" role="alert">
      <strong>Captura de áudio indisponível.</strong>
      Atualize o navegador ou verifique se a página foi aberta por uma conexão segura.
    </div>

    <template v-else>
      <button
        type="button"
        class="mic__btn"
        :class="{ live: listening, preparing: loading }"
        :disabled="disabled"
        @click="listening || loading ? emit('stop') : emit('start')"
      >
        <span class="mic__pulse" aria-hidden="true"></span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path
            d="M5 11a7 7 0 0 0 14 0M12 18v3"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <span v-if="loading">Cancelar preparação</span>
        <span v-else-if="listening">Pausar transcrição</span>
        <span v-else>Iniciar transcrição</span>
      </button>
      <p
        class="mic__status"
        :class="{
          live: listening,
          receiving: listening && inputState === 'receiving',
          warning: listening && inputState === 'silent',
        }"
        role="status"
      >
        <template v-if="loading">
          Preparando o modelo de português. Na primeira vez pode levar até cerca de um minuto;
          reunião e chat continuam disponíveis.
        </template>
        <template v-else-if="listening && localEngine && inputState === 'waiting'">
          Microfone autorizado. Conectando o processamento de áudio…
        </template>
        <template v-else-if="listening && localEngine && inputState === 'silent'">
          Microfone conectado, mas sem sinal de voz. Fale normalmente ou confira a entrada selecionada.
        </template>
        <template v-else-if="listening && localEngine && inputState === 'receiving'">
          Áudio recebido — transcrevendo localmente.
        </template>
        <template v-else-if="listening">
          Transcrevendo — a plateia está vendo sua fala em texto.
        </template>
        <template v-else>
          Microfone pausado. A plateia não recebe texto novo.
        </template>
      </p>
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
.mic {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mic__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 22px;
  border: none;
  border-radius: 14px;
  background: var(--brand);
  color: #fff;
  font: inherit;
  font-weight: 700;
  font-size: 15.5px;
  cursor: pointer;
  box-shadow: var(--shadow-brand);
}
.mic__btn.live {
  background: linear-gradient(115deg, #d84f6b, #c2415c);
  box-shadow: 0 16px 36px rgba(216, 79, 107, 0.3);
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
  display: none;
  position: absolute;
  left: 14px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
}
.mic__btn.live .mic__pulse {
  display: block;
  animation: mic-pulse 1.4s ease-in-out infinite;
}
.mic__btn.preparing .mic__pulse {
  display: block;
  animation: mic-pulse 0.9s ease-in-out infinite;
}
@keyframes mic-pulse {
  50% {
    opacity: 0.3;
    transform: scale(0.8);
  }
}
.mic__status {
  margin: 0;
  font-size: 13.5px;
  color: var(--muted);
}
.mic__status.live {
  color: #f2a4b5;
  font-weight: 600;
}
.mic__status.receiving { color: #69e5b1; }
.mic__status.warning { color: #f1c770; }
.mic__meter {
  width: 100%;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(126, 139, 170, 0.22);
}
.mic__meter span {
  display: block;
  min-width: 2px;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #54dda3, #d8b14f, #d84f6b);
  transition: width 120ms linear;
}
.mic__error,
.mic__unsupported {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(216, 79, 107, 0.09);
  border: 1px solid rgba(216, 79, 107, 0.3);
  font-size: 13.5px;
  color: #a13a50;
}
.mic__unsupported {
  background: rgba(255, 176, 32, 0.1);
  border-color: rgba(255, 176, 32, 0.4);
  color: #8a6116;
}
@media (prefers-reduced-motion: reduce) {
  .mic__btn.live .mic__pulse,
  .mic__btn.preparing .mic__pulse {
    animation: none;
  }
  .mic__meter span { transition: none; }
}
</style>
