<script setup lang="ts">
/**
 * Controle do microfone do comunicador — presentacional; a captura em si
 * (Web Speech API) vive na LiveRoomView, que injeta o estado aqui.
 */
defineProps<{
  supported: boolean
  listening: boolean
  error: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  start: []
  stop: []
}>()

const ERROR_HINTS: Record<string, string> = {
  'not-allowed':
    'Permissão de microfone negada. Libere o microfone nas configurações do site e tente de novo.',
  'service-not-allowed':
    'O reconhecimento de voz foi bloqueado pelo navegador. Verifique as permissões.',
  'audio-capture': 'Nenhum microfone encontrado. Conecte um microfone e tente de novo.',
  'start-failed': 'Não foi possível iniciar a captura. Recarregue a página e tente de novo.',
  network:
    'Sem acesso ao serviço de voz do navegador. No Brave a transcrição não funciona (o serviço é bloqueado) — use Chrome ou Edge.',
}
</script>

<template>
  <div class="mic">
    <div v-if="!supported" class="mic__unsupported" role="alert">
      <strong>Navegador sem reconhecimento de voz.</strong>
      Use o Chrome ou o Edge no computador para transcrever a sessão.
    </div>

    <template v-else>
      <button
        type="button"
        class="mic__btn"
        :class="{ live: listening }"
        :disabled="disabled"
        @click="listening ? emit('stop') : emit('start')"
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
        {{ listening ? 'Pausar transcrição' : 'Iniciar transcrição' }}
      </button>
      <p class="mic__status" :class="{ live: listening }">
        {{
          listening
            ? 'Transcrevendo — a plateia está vendo sua fala em texto.'
            : 'Microfone pausado. A plateia não recebe texto novo.'
        }}
      </p>
    </template>

    <p v-if="error" class="mic__error" role="alert">
      {{ ERROR_HINTS[error] ?? 'Erro no reconhecimento de voz: ' + error }}
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
  color: #b04057;
  font-weight: 600;
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
  .mic__btn.live .mic__pulse {
    animation: none;
  }
}
</style>
