<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { splitIntoLines } from '../../live/captionLines'
import type { TranscriptEntry } from '../../live/types'

/**
 * Palco de texto ao vivo — o coração da experiência acessível da plateia.
 * Estilo karaokê: cada frase vira uma ou mais linhas curtas que descem na
 * tela; a linha corrente fica em destaque e as anteriores esmaecem. A pessoa
 * pode rolar de volta pra reler — a rolagem só fica presa ao vivo quando ele
 * está no fim.
 */
const props = defineProps<{
  transcript: TranscriptEntry[]
  captionState?: 'available' | 'paused' | 'preparing' | 'listening' | 'reconnecting' | 'ended'
  /** Modo compacto (preview do comunicador). */
  compact?: boolean
}>()

const captionStatus = computed(() => {
  switch (props.captionState ?? 'available') {
    case 'paused':
      return { label: 'Transcrição pausada', detail: 'A legenda continua disponível para leitura.' }
    case 'preparing':
      return {
        label: 'Preparando transcrição',
        detail: 'Preparando a captura segura de áudio.',
      }
    case 'listening':
      return {
        label: 'Transcrição ativa',
        detail: 'O servidor processa o áudio e publica somente o texto final.',
      }
    case 'reconnecting':
      return { label: 'Reconectando', detail: 'A última legenda permanece disponível.' }
    case 'ended':
      return { label: 'Somente leitura', detail: 'Esta reunião foi encerrada.' }
    default:
      return { label: 'Legenda disponível', detail: 'Aguardando a transcrição ser ativada.' }
  }
})

interface CaptionLine {
  key: string
  text: string
}

const lines = computed<CaptionLine[]>(() =>
  props.transcript.flatMap((entry) =>
    splitIntoLines(entry.text).map((text, i) => ({
      key: `${entry.seq}:${i}`,
      text,
    })),
  ),
)
const latestFinalAnnouncement = computed(
  () => props.transcript.at(-1)?.text.trim() ?? '',
)

const FONT_KEY = 'semantia.captions.font'
const FONT_STEPS = [28, 36, 48]
const DEFAULT_STEP = 1

const fontStep = ref(DEFAULT_STEP)
const stage = ref<HTMLElement | null>(null)
const pinned = ref(true)

onMounted(() => {
  const savedValue = localStorage.getItem(FONT_KEY)
  if (savedValue !== null) {
    const saved = Number(savedValue)
    if (Number.isInteger(saved) && saved >= 0 && saved < FONT_STEPS.length) {
      fontStep.value = saved
    }
  }
  scrollToLive('auto')
})

function setFont(delta: number) {
  const next = fontStep.value + delta
  if (next < 0 || next >= FONT_STEPS.length) return
  fontStep.value = next
  localStorage.setItem(FONT_KEY, String(next))
}

function onScroll() {
  const el = stage.value
  if (!el) return
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

function scrollToLive(behavior: ScrollBehavior = 'smooth') {
  const el = stage.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior })
  pinned.value = true
}

// Segue o vivo enquanto o leitor estiver no fim (não rouba a rolagem de quem relê).
watch(
  () => props.transcript.length,
  async () => {
    if (!pinned.value) return
    await nextTick()
    scrollToLive('auto')
  },
)
</script>

<template>
  <section
    class="captions"
    :class="{ compact }"
    :data-font-step="fontStep"
    aria-label="Legenda da reunião"
  >
    <div class="captions__tools" v-if="!compact">
      <span class="captions__label" data-testid="caption-status">
        <span
          class="dot"
          :class="{ 'dot--active': captionState === 'listening' }"
          aria-hidden="true"
        ></span>
        <span>
          <strong>{{ captionStatus.label }}</strong>
          <small>{{ captionStatus.detail }}</small>
        </span>
      </span>
      <div class="captions__font" role="group" aria-label="Tamanho do texto">
        <button
          type="button"
          :disabled="fontStep === 0"
          aria-label="Diminuir texto"
          @click="setFont(-1)"
        >
          A−
        </button>
        <button
          type="button"
          :disabled="fontStep === FONT_STEPS.length - 1"
          aria-label="Aumentar texto"
          @click="setFont(1)"
        >
          A+
        </button>
      </div>
    </div>

    <div
      ref="stage"
      class="captions__stage"
      :style="{ fontSize: (compact ? 18 : FONT_STEPS[fontStep]) + 'px' }"
      tabindex="0"
      @scroll.passive="onScroll"
    >
      <p v-if="lines.length === 0" class="captions__waiting">
        Aguardando o comunicador falar…
      </p>
      <template v-else>
        <transition-group name="line" tag="div" class="captions__lines">
          <p
            v-for="(line, i) in lines"
            :key="line.key"
            class="captions__line"
            :class="{ 'captions__line--current': i === lines.length - 1 }"
          >
            {{ line.text }}
          </p>
        </transition-group>
      </template>
    </div>

    <p
      class="sr-only"
      data-testid="caption-announcer"
      aria-live="polite"
      aria-atomic="true"
    >{{ latestFinalAnnouncement }}</p>

    <transition name="fade">
      <button
        v-if="!pinned"
        type="button"
        class="captions__jump"
        @click="scrollToLive()"
      >
        ↓ Voltar ao vivo
      </button>
    </transition>
  </section>
</template>

<style scoped>
.captions {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--night);
  border: 1px solid var(--night-line);
  border-radius: var(--radius);
  overflow: hidden;
}
.captions__tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--night-line);
}
.captions__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--on-night);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff5c7a;
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
.captions__font {
  display: inline-flex;
  gap: 6px;
}
.captions__font button {
  padding: 6px 12px;
  border: 1px solid var(--night-line);
  border-radius: 9px;
  background: var(--night-2);
  color: var(--on-night);
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.captions__font button:hover:not(:disabled) {
  border-color: var(--blue);
  color: #fff;
}
.captions__font button:disabled {
  opacity: 0.4;
  cursor: default;
}
.captions__stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 24px 28px;
  line-height: 1.55;
  font-family: var(--body);
  font-weight: 600;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--night-line) transparent;
}
.captions__stage:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
}
.captions__waiting {
  margin: 0;
  color: var(--on-night);
  opacity: 0.65;
  font-weight: 500;
}
.captions__lines {
  display: flex;
  flex-direction: column;
  gap: 0.3em;
  text-align: center;
}
.captions__line {
  margin: 0;
  color: #f4f6fb;
  opacity: 0.55;
  transition: opacity 0.25s ease;
}
.captions__line--current {
  opacity: 1;
  color: #fff;
}
/* Linha nova entra deslizando de baixo (karaokê). */
.line-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.line-enter-from {
  opacity: 0;
  transform: translateY(14px);
}
.captions__jump {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 9px 18px;
  border: none;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  box-shadow: var(--shadow-brand);
}
.compact .captions__stage {
  padding: 14px 16px 18px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
  .captions__line,
  .line-enter-active {
    transition: none;
  }
}

/* Palco central — hierarquia visual aprovada. */
.captions {
  border-color: rgba(198, 214, 245, 0.14);
  border-radius: 26px;
  background:
    radial-gradient(circle at 50% 100%, rgba(88, 195, 201, 0.075), transparent 38%),
    linear-gradient(180deg, #0d1424, #080d19);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025), 0 26px 70px rgba(0, 0, 0, 0.24);
}
.captions__tools {
  min-height: 66px;
  padding: 11px 16px 11px 20px;
  border-color: rgba(198, 214, 245, 0.11);
  background: rgba(15, 23, 40, 0.78);
  backdrop-filter: blur(16px);
}
.captions__label {
  min-width: 0;
  color: #dce5f8;
  font-size: inherit;
  letter-spacing: 0;
  text-transform: none;
}
.captions__label > span:last-child {
  min-width: 0;
  display: grid;
  gap: 1px;
}
.captions__label strong,
.captions__label small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.captions__label strong {
  color: #eef3ff;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.captions__label small {
  color: #8e9bb6;
  font-size: 9px;
  font-weight: 650;
}
.dot {
  flex: 0 0 auto;
  background: #6f7b94;
  animation: none;
}
.dot--active {
  background: #55dba8;
  box-shadow: 0 0 0 4px rgba(85, 219, 168, 0.1);
  animation: pulse 1.6s ease-in-out infinite;
}
.captions__font {
  gap: 7px;
}
.captions__font button {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  padding: 0 10px;
  border-color: rgba(198, 214, 245, 0.14);
  border-radius: 13px;
  color: #dce5f8;
  background: rgba(255, 255, 255, 0.055);
}
.captions__stage {
  padding: clamp(30px, 5vh, 64px) clamp(24px, 5vw, 82px) clamp(34px, 6vh, 78px);
  scroll-padding-block: 32px;
}
.captions__lines {
  width: min(100%, 1160px);
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.58em;
  margin: 0 auto;
}
.captions__line {
  margin: 0;
  color: #7f8da9;
  font-weight: 620;
  line-height: 1.3;
  letter-spacing: -0.018em;
  opacity: 0.68;
}
.captions__line--current {
  position: relative;
  color: #f5f7ff;
  font-weight: 720;
  opacity: 1;
  text-shadow: 0 0 30px rgba(142, 172, 230, 0.12);
}
.captions__line--current::before,
.captions__line--partial::before {
  content: '';
  position: absolute;
  top: 0.24em;
  bottom: 0.24em;
  left: -0.58em;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, #62c9cc, #789de4);
}
.captions__line--partial {
  position: relative;
  color: #bfd1f6;
  font-weight: 690;
  opacity: 1;
}
.captions__waiting {
  width: min(100%, 660px);
  align-self: center;
  margin: auto;
  padding: 26px;
  border: 1px dashed rgba(198, 214, 245, 0.16);
  border-radius: 20px;
  color: #9da9bf;
  background: rgba(255, 255, 255, 0.025);
  font-size: 0.66em;
  line-height: 1.5;
  text-align: center;
}
.captions__jump {
  min-height: 44px;
  bottom: 18px;
  border: 1px solid rgba(255, 255, 255, 0.16);
}

@media (max-width: 1023px) {
  .captions:not(.compact)[data-font-step='0'] .captions__stage { font-size: 24px !important; }
  .captions:not(.compact)[data-font-step='1'] .captions__stage { font-size: 32px !important; }
  .captions:not(.compact)[data-font-step='2'] .captions__stage { font-size: 40px !important; }
  .captions__stage {
    padding: clamp(24px, 5vh, 44px) clamp(20px, 5vw, 48px) clamp(30px, 6vh, 58px);
  }
}

@media (max-width: 620px) {
  .captions {
    border-radius: 0;
  }
  .captions__tools {
    min-height: 60px;
    padding: 8px 10px 8px 14px;
  }
  .captions__label small {
    max-width: 54vw;
  }
  .captions__stage {
    padding: 24px 24px 34px 32px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dot--active {
    animation: none;
  }
}
</style>
