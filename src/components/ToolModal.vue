<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import type { Tool } from '../data/tools'
import {
  faq,
  guia,
  recursos,
  sinalDeHoje,
  spreadBusca,
  sugestoesDicionario,
  datilologiaVideo,
  paraDatilologia,
  letraSegundo,
} from '../data/freeContent'

const props = defineProps<{ tool: Tool }>()
const emit = defineEmits<{ close: [] }>()

const termo = ref('')
const openFaq = ref<number | null>(0)
const sinal = sinalDeHoje()

// --- Datilologia ---
const dWord = ref('')
const dTokens = computed(() => paraDatilologia(dWord.value))
const dIdx = ref(-1)
const dPlaying = ref(false)
const dSpeed = ref(900)
let dCancel = false
const dVideo = ref<HTMLVideoElement | null>(null)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function soletrar() {
  const toks = dTokens.value
  if (!toks.length) return
  dCancel = false
  dPlaying.value = true
  const v = dVideo.value
  for (let i = 0; i < toks.length; i++) {
    if (dCancel) break
    dIdx.value = i
    const t = toks[i]
    if (!t.space && v) {
      const sec = letraSegundo[t.ch]
      if (sec != null) {
        try {
          v.currentTime = sec
          await v.play().catch(() => {})
        } catch {
          /* ignore */
        }
      }
    }
    await sleep(t.space ? dSpeed.value * 0.4 : dSpeed.value)
  }
  try {
    v?.pause()
  } catch {
    /* ignore */
  }
  dPlaying.value = false
  dIdx.value = -1
}

function buscar(term?: string) {
  const t = (term ?? termo.value).trim()
  if (t) window.open(spreadBusca(t), '_blank', 'noopener')
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  dCancel = true
  try {
    dVideo.value?.pause()
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="tool.title">
      <header class="modal__head">
        <h2>{{ tool.title }}</h2>
        <button class="modal__x" type="button" aria-label="Fechar" @click="emit('close')">✕</button>
      </header>

      <div class="modal__body">
        <!-- DICIONÁRIO -->
        <div v-if="tool.open === 'dicionario'">
          <p class="lead">Digite uma palavra e veja o sinal em vídeo.</p>
          <form class="search" @submit.prevent="buscar()">
            <input v-model="termo" type="text" placeholder="Ex.: casa, obrigado, escola…"
                   aria-label="Palavra para buscar" autofocus />
            <button type="submit" class="btn-grad">Buscar sinal</button>
          </form>
          <div class="chips">
            <span class="chips__label">Sugestões:</span>
            <button v-for="s in sugestoesDicionario" :key="s" type="button" class="chip"
                    @click="buscar(s)">{{ s }}</button>
          </div>
          <p class="hint">Abre os vídeos do sinal no Spread the Sign (dicionário com Libras).</p>
        </div>

        <!-- SINAL DO DIA -->
        <div v-else-if="tool.open === 'sinal'" class="sinal">
          <span class="sinal__tag">Sinal de hoje</span>
          <h3 class="sinal__word">{{ sinal.palavra }}</h3>
          <p class="sinal__dica">{{ sinal.dica }}</p>
          <a class="btn-grad" :href="spreadBusca(sinal.verbete)" target="_blank" rel="noopener">
            Ver o sinal em vídeo
          </a>
          <p class="hint">Vídeo no Spread the Sign. Volte amanhã para um novo sinal.</p>
        </div>

        <!-- MAPA DE RECURSOS -->
        <ul v-else-if="tool.open === 'recursos'" class="list">
          <li v-for="r in recursos" :key="r.url">
            <a :href="r.url" target="_blank" rel="noopener">
              <strong>{{ r.t }}</strong>
              <span>{{ r.d }}</span>
            </a>
          </li>
        </ul>

        <!-- FAQ -->
        <div v-else-if="tool.open === 'faq'" class="faq">
          <div v-for="(item, i) in faq" :key="i" class="faq__item">
            <button class="faq__q" type="button" :aria-expanded="openFaq === i"
                    @click="openFaq = openFaq === i ? null : i">
              {{ item.q }}<span>{{ openFaq === i ? '–' : '+' }}</span>
            </button>
            <p v-show="openFaq === i" class="faq__a">{{ item.a }}</p>
          </div>
        </div>

        <!-- GUIA -->
        <div v-else-if="tool.open === 'guia'" class="guia">
          <p class="lead">{{ guia.intro }}</p>
          <ol class="guia__steps">
            <li v-for="(p, i) in guia.passos" :key="i">
              <strong>{{ p.t }}</strong>
              <span>{{ p.d }}</span>
            </li>
          </ol>
        </div>

        <!-- DATILOLOGIA -->
        <div v-else-if="tool.open === 'datilologia'" class="dati">
          <p class="lead">
            Datilologia é soletrar com o alfabeto manual — útil para nomes e palavras sem
            sinal próprio. Aprenda no vídeo e treine soletrando abaixo.
          </p>
          <div class="video">
            <video ref="dVideo" :src="datilologiaVideo" controls playsinline preload="metadata"></video>
          </div>
          <form class="search" @submit.prevent="soletrar">
            <input v-model="dWord" type="text" maxlength="40"
                   placeholder="Digite uma palavra ou nome…" aria-label="Palavra para soletrar" />
            <button type="submit" class="btn-grad">Soletrar</button>
          </form>
          <div v-if="dTokens.length" class="tiles" aria-live="polite">
            <template v-for="(t, i) in dTokens" :key="i">
              <span v-if="t.space" class="tiles__gap"></span>
              <span v-else class="tile-l"
                    :class="{ on: dPlaying && i === dIdx, done: dPlaying && i < dIdx }">
                <span class="tile-l__hand">{{ t.ch }}</span>
                <span class="tile-l__lab">{{ t.ch }}</span>
              </span>
            </template>
          </div>
          <div v-if="dTokens.length" class="dati__speed">
            <span>Ritmo:</span>
            <button type="button" :class="{ sel: dSpeed === 1100 }" @click="dSpeed = 1100">Lento</button>
            <button type="button" :class="{ sel: dSpeed === 750 }" @click="dSpeed = 750">Normal</button>
            <button type="button" :class="{ sel: dSpeed === 450 }" @click="dSpeed = 450">Rápido</button>
          </div>
          <p class="hint">
            Ao soletrar, o vídeo <strong>pula para cada letra</strong> e mostra o sinal real.
            Os desenhos das mãos usam a fonte <strong>Libras 2020</strong>.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(22, 27, 39, 0.5);
  backdrop-filter: blur(4px);
  animation: fade 0.2s ease;
}
.modal {
  width: 100%;
  max-width: 560px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border-radius: 22px;
  box-shadow: 0 30px 70px -20px rgba(22, 27, 39, 0.5);
  animation: pop 0.24s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.modal__body {
  scrollbar-width: thin;
  scrollbar-color: #cdd4df transparent;
}
.modal__body::-webkit-scrollbar {
  width: 10px;
}
.modal__body::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
.modal__body::-webkit-scrollbar-corner {
  background: transparent;
}
.modal__body::-webkit-scrollbar-track {
  background: transparent;
  margin: 4px 0;
}
.modal__body::-webkit-scrollbar-thumb {
  background: #cdd4df;
  border-radius: 999px;
  border: 3px solid var(--surface);
  background-clip: padding-box;
}
.modal__body::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
  background-clip: padding-box;
}
.modal__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.modal__head h2 {
  font-size: 21px;
  font-weight: 800;
}
.modal__x {
  border: 0;
  background: var(--bg-2);
  width: 34px;
  height: 34px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  color: var(--ink-soft);
}
.modal__x:hover {
  background: var(--line);
}
.modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
}
.lead {
  color: var(--ink-soft);
  margin-bottom: 18px;
}
.hint {
  margin-top: 14px;
  font-size: 13px;
  color: var(--muted);
}
.btn-grad {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-weight: 700;
  color: #fff;
  background: var(--brand);
  box-shadow: var(--shadow-brand);
  cursor: pointer;
  text-decoration: none;
}
.btn-grad:hover {
  filter: brightness(1.05);
}
.search {
  display: flex;
  gap: 10px;
}
.search input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  font: inherit;
  background: var(--bg);
}
.search input:focus-visible {
  border-color: var(--blue);
  outline: none;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.chips__label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--muted);
}
.chip {
  padding: 6px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  font: inherit;
  font-size: 13.5px;
  color: var(--ink-soft);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.chip:hover {
  border-color: var(--blue);
  color: var(--blue);
  background: #fff;
}
.sinal {
  text-align: center;
}
.sinal__tag {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--blue);
}
.sinal__word {
  font-size: 32px;
  font-weight: 800;
  margin: 8px 0 10px;
}
.sinal__dica {
  color: var(--ink-soft);
  margin-bottom: 20px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.list a {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.16s, background 0.16s;
}
.list a:hover {
  border-color: var(--blue);
  background: var(--bg);
}
.list strong {
  color: var(--ink);
}
.list span {
  font-size: 13.5px;
  color: var(--ink-soft);
}
.faq__item {
  border-bottom: 1px solid var(--line);
}
.faq__q {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 2px;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 700;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.faq__q span {
  color: var(--blue);
  font-size: 20px;
  line-height: 1;
}
.faq__a {
  padding: 0 2px 16px;
  color: var(--ink-soft);
}
.guia__steps {
  margin: 0;
  padding-left: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.guia__steps li strong {
  display: block;
  color: var(--ink);
  margin-bottom: 2px;
}
.guia__steps li span {
  color: var(--ink-soft);
  font-size: 14.5px;
}

/* DATILOLOGIA */
.video {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-bottom: 18px;
  border-radius: 14px;
  overflow: hidden;
  background: #000;
  border: 1px solid var(--line);
}
.video iframe,
.video video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: cover;
}
.tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.tiles__gap {
  width: 16px;
}
.tile-l {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 60px;
  height: 76px;
  border-radius: 13px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  color: var(--ink);
  transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}
.tile-l__hand {
  font-family: 'LibrasMao', var(--display);
  font-size: 44px;
  line-height: 1;
  color: var(--ink);
}
.tile-l__lab {
  font-family: var(--display);
  font-weight: 800;
  font-size: 12px;
  color: var(--muted);
}
.tile-l.done {
  opacity: 0.5;
}
.tile-l.on {
  background: var(--brand);
  transform: translateY(-4px) scale(1.12);
  box-shadow: var(--shadow-brand);
  opacity: 1;
}
.tile-l.on .tile-l__hand,
.tile-l.on .tile-l__lab {
  color: #fff;
}
.dati__speed {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}
.dati__speed button {
  padding: 6px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  font: inherit;
  font-size: 13px;
  color: var(--ink-soft);
  cursor: pointer;
}
.dati__speed button.sel {
  border-color: transparent;
  background: var(--brand);
  color: #fff;
}

@keyframes fade { from { opacity: 0; } }
@keyframes pop { from { opacity: 0; transform: translateY(14px) scale(0.98); } }
</style>
