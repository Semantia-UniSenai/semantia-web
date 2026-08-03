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
  partialText: string
  /** Modo compacto (preview do comunicador). */
  compact?: boolean
}>()

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

const FONT_KEY = 'semantia.captions.font'
const FONT_STEPS = [22, 28, 34, 42, 52]
const DEFAULT_STEP = 2

const fontStep = ref(DEFAULT_STEP)
const stage = ref<HTMLElement | null>(null)
const pinned = ref(true)

onMounted(() => {
  const saved = Number(localStorage.getItem(FONT_KEY))
  if (Number.isInteger(saved) && saved >= 0 && saved < FONT_STEPS.length) {
    fontStep.value = saved
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
  () => [props.transcript.length, props.partialText] as const,
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
    aria-label="Transcrição ao vivo da reunião"
  >
    <div class="captions__tools" v-if="!compact">
      <span class="captions__label">
        <span class="dot" aria-hidden="true"></span>
        Transcrição ao vivo
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
      aria-live="polite"
      tabindex="0"
      @scroll.passive="onScroll"
    >
      <p v-if="lines.length === 0 && !partialText" class="captions__waiting">
        Aguardando o comunicador falar…
      </p>
      <template v-else>
        <transition-group name="line" tag="div" class="captions__lines">
          <p
            v-for="(line, i) in lines"
            :key="line.key"
            class="captions__line"
            :class="{
              'captions__line--current': i === lines.length - 1 && !partialText,
            }"
          >
            {{ line.text }}
          </p>
          <p
            v-if="partialText"
            key="partial"
            class="captions__line captions__line--partial"
          >
            {{ partialText }}
          </p>
        </transition-group>
      </template>
    </div>

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
.captions__line--partial {
  opacity: 1;
  color: #9fb6e8;
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
</style>
