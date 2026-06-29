<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { datilologiaVideo, letraSegundo } from '../data/freeContent'

const emit = defineEmits<{
  finish: [result: { points: number; accuracy: number; durationMs: number }]
}>()

const ROUNDS = 8
const WINDOW = 1.7 // segundos de loop da handshape
const LETTERS = Object.keys(letraSegundo)

type Phase = 'intro' | 'playing' | 'feedback' | 'done'
const phase = ref<Phase>('intro')

const video = ref<HTMLVideoElement | null>(null)
const sequence = ref<string[]>([])
const idx = ref(0)
const current = ref('')
const options = ref<string[]>([])
const selected = ref<string | null>(null)
const score = ref(0)
const correctCount = ref(0)

let roundStart = 0
let gameStart = 0
let winStart = 0
let feedbackTimer = 0

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildOptions(correct: string): string[] {
  const distractors = shuffle(LETTERS.filter((l) => l !== correct)).slice(0, 3)
  return shuffle([correct, ...distractors])
}

function showLetter(letter: string) {
  const v = video.value
  if (!v) return
  winStart = (letraSegundo[letter] ?? 0) - 0.25
  v.currentTime = Math.max(0, winStart)
  void v.play().catch(() => {})
}

function onTimeUpdate() {
  const v = video.value
  if (!v) return
  if (v.currentTime >= winStart + WINDOW || v.currentTime < winStart - 0.3) {
    v.currentTime = Math.max(0, winStart)
  }
}

function startGame() {
  sequence.value = shuffle(LETTERS).slice(0, ROUNDS)
  idx.value = 0
  score.value = 0
  correctCount.value = 0
  gameStart = Date.now()
  phase.value = 'playing'
  beginRound()
}

function beginRound() {
  current.value = sequence.value[idx.value]
  options.value = buildOptions(current.value)
  selected.value = null
  roundStart = Date.now()
  phase.value = 'playing'
  showLetter(current.value)
}

function answer(letter: string) {
  if (selected.value) return
  selected.value = letter
  const correct = letter === current.value
  if (correct) {
    correctCount.value++
    const elapsed = Date.now() - roundStart
    const speedBonus = Math.max(0, 50 - Math.floor(elapsed / 100))
    score.value += 100 + speedBonus
  }
  phase.value = 'feedback'
  feedbackTimer = window.setTimeout(next, 1100)
}

function next() {
  idx.value++
  if (idx.value >= ROUNDS) return finish()
  beginRound()
}

function finish() {
  video.value?.pause()
  phase.value = 'done'
  emit('finish', {
    points: score.value,
    accuracy: Math.round((correctCount.value / ROUNDS) * 100) / 100,
    durationMs: Date.now() - gameStart,
  })
}

function restart() {
  startGame()
}

onBeforeUnmount(() => {
  clearTimeout(feedbackTimer)
  video.value?.pause()
})
</script>

<template>
  <div class="game">
    <!-- palco do vídeo -->
    <div class="stage" :class="{ dim: phase === 'intro' || phase === 'done' }">
      <video
        ref="video"
        :src="datilologiaVideo"
        muted
        playsinline
        preload="auto"
        @timeupdate="onTimeUpdate"
      ></video>
      <!-- máscara do canto que mostra a letra no vídeo -->
      <div class="mask" aria-hidden="true">?</div>

      <div v-if="phase === 'intro'" class="overlay">
        <h3>Datilologia Challenge</h3>
        <p>Veja a mão soletrando e acerte a letra. {{ ROUNDS }} rodadas. Rápido = mais pontos.</p>
        <button class="play" type="button" @click="startGame">Começar ▶</button>
      </div>

      <div v-else-if="phase === 'done'" class="overlay">
        <h3>Fim! 🎉</h3>
        <p class="bigscore">{{ score }} pts</p>
        <p>{{ correctCount }}/{{ ROUNDS }} acertos</p>
        <button class="play" type="button" @click="restart">Jogar de novo</button>
      </div>
    </div>

    <!-- HUD -->
    <div v-if="phase !== 'intro' && phase !== 'done'" class="hud">
      <span class="round">Rodada {{ idx + 1 }}/{{ ROUNDS }}</span>
      <span class="pts">{{ score }} pts</span>
    </div>

    <!-- opções -->
    <div v-if="phase === 'playing' || phase === 'feedback'" class="opts">
      <button
        v-for="opt in options"
        :key="opt"
        type="button"
        class="opt"
        :class="{
          correct: selected && opt === current,
          wrong: selected === opt && opt !== current,
        }"
        :disabled="!!selected"
        @click="answer(opt)"
      >
        {{ opt }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.game {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.stage {
  position: relative;
  aspect-ratio: 16 / 9;
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  background: #0d1117;
  border: 1px solid var(--line);
}
.stage video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.stage.dim video {
  filter: brightness(0.4);
}
.mask {
  position: absolute;
  top: 0;
  right: 0;
  width: 18%;
  height: 26%;
  display: grid;
  place-items: center;
  background: var(--surface);
  border-bottom-left-radius: 14px;
  font-family: var(--display);
  font-weight: 800;
  font-size: clamp(18px, 3vw, 30px);
  color: var(--brand);
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 24px;
  color: #fff;
  background: rgba(13, 17, 23, 0.55);
}
.overlay h3 {
  font-size: 24px;
  font-weight: 800;
}
.overlay p {
  max-width: 36ch;
  font-size: 14.5px;
  opacity: 0.92;
}
.bigscore {
  font-family: var(--display);
  font-weight: 800;
  font-size: 40px;
  color: #fff;
}
.play {
  margin-top: 8px;
  padding: 13px 26px;
  border: 0;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-family: var(--display);
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  box-shadow: var(--shadow-brand);
}
.hud {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-soft);
}
.pts {
  color: var(--brand);
}
.opts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.opt {
  padding: 18px 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  font-family: var(--display);
  font-weight: 800;
  font-size: 26px;
  color: var(--ink);
  cursor: pointer;
  transition: transform 0.12s, background 0.12s, border-color 0.12s;
}
.opt:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: var(--brand);
}
.opt:disabled {
  cursor: default;
}
.opt.correct {
  background: #1f9d55;
  border-color: #1f9d55;
  color: #fff;
}
.opt.wrong {
  background: #c0362c;
  border-color: #c0362c;
  color: #fff;
}
</style>
