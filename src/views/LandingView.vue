<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import MeshShader from '../components/MeshShader.vue'
import ToolCard from '../components/ToolCard.vue'
import ToolModal from '../components/ToolModal.vue'
import { tools, toolSections, type Tool, type ToolCategory } from '../data/tools'

function toolsOf(cat: ToolCategory): Tool[] {
  return tools.filter((t) => t.category === cat)
}

const activeTool = ref<Tool | null>(null)
const toast = ref('')
let toastTimer = 0

let layers: HTMLElement[] = []
const bases = new Map<HTMLElement, number>()
let mx = 0
let my = 0
let raf = 0
let io: IntersectionObserver | null = null

function measure() {
  for (const el of layers) {
    const prev = el.style.transform
    el.style.transform = ''
    const r = el.getBoundingClientRect()
    bases.set(el, r.top + window.scrollY + r.height / 2)
    el.style.transform = prev
  }
}
function apply() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const mid = window.scrollY + window.innerHeight / 2
    for (const el of layers) {
      const sp = parseFloat(el.dataset.parallax || '0')
      const mf = parseFloat(el.dataset.mouse || '0')
      const base = bases.get(el) || 0
      const ty = (mid - base) * sp + my * mf
      const tx = mx * mf
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
    }
  })
}
function onMouse(e: MouseEvent) {
  mx = e.clientX / window.innerWidth - 0.5
  my = e.clientY / window.innerHeight - 0.5
  apply()
}
function onResize() {
  measure()
  apply()
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // sem animação: revela tudo imediatamente
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('in'))
    return
  }
  layers = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'))
  measure()
  apply()
  window.addEventListener('scroll', apply, { passive: true })
  window.addEventListener('mousemove', onMouse, { passive: true })
  window.addEventListener('resize', onResize)

  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          e.target.classList.add('in')
          io?.unobserve(e.target)
        }
    },
    { threshold: 0.18 },
  )
  document.querySelectorAll('[data-reveal]').forEach((el) => io?.observe(el))
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', apply)
  window.removeEventListener('mousemove', onMouse)
  window.removeEventListener('resize', onResize)
  io?.disconnect()
})

function openVLibras() {
  const btn = document.querySelector<HTMLElement>('[vw-access-button]')
  if (btn) {
    btn.click()
    return
  }
  setTimeout(() => document.querySelector<HTMLElement>('[vw-access-button]')?.click(), 700)
}
function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 3200)
}
function onActivate(tool: Tool) {
  if (tool.open === 'vlibras') return openVLibras()
  if (tool.status === 'disponivel' && tool.open) return void (activeTool.value = tool)
  if (tool.status === 'pro') return showToast('Adaptação Semântica é o recurso Pro — em breve. ✨')
  showToast('Em construção — chega em breve. 🚧')
}
</script>

<template>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

  <header class="hdr">
    <div class="container hdr__in">
      <RouterLink class="brand" to="/" aria-label="Semantia — início">
        <img src="/brand/semantia-mark.png" alt="" class="brand__mark" width="34" height="36" />
        <span class="brand__name">Semantia</span>
      </RouterLink>
      <nav class="nav" aria-label="Principal">
        <a href="#ferramentas">Ferramentas</a>
        <a href="#semantica">Como funciona</a>
        <RouterLink class="nav__login" to="/entrar">Entrar</RouterLink>
        <button class="nav__cta" type="button" @click="openVLibras">Traduzir agora</button>
      </nav>
    </div>
  </header>

  <main id="conteudo">
    <!-- HERO -->
    <section class="hero">
      <MeshShader class="hero__bg" />
      <!-- camadas de profundidade (parallax scroll + mouse) -->
      <span class="orb orb--a" data-parallax="0.16" data-mouse="42" aria-hidden="true"></span>
      <span class="orb orb--b" data-parallax="0.26" data-mouse="-58" aria-hidden="true"></span>
      <span class="orb orb--c" data-parallax="0.1" data-mouse="30" aria-hidden="true"></span>
      <span class="ghost ghost--1" data-parallax="0.34" data-mouse="-26" aria-hidden="true">OLÁ</span>
      <span class="ghost ghost--2" data-parallax="0.2" data-mouse="34" aria-hidden="true">MÃOS</span>
      <div class="hero__veil" aria-hidden="true"></div>

      <div class="container hero__in" data-parallax="-0.08" data-mouse="-12">
        <span class="eyebrow rise" style="--d: 0s">
          <span class="eyebrow__dot"></span> Acessibilidade em Libras · gratuito
        </span>
        <h1 class="hero__title rise" style="--d: 0.08s">
          Libras de verdade,<br />
          não <span class="strike">palavra por palavra</span>.
          <span class="brand-text">É o padrão.</span>
        </h1>
        <p class="hero__lead rise" style="--d: 0.16s">
          O Semantia reorganiza o conteúdo na lógica visual da Libras e o traduz em
          avatar 3D. Para deficientes auditivos, familiares, amigos e quem quer entender a língua.
        </p>
        <div class="hero__cta rise" style="--d: 0.24s">
          <button class="btn btn--solid" type="button" @click="openVLibras">Traduzir agora</button>
          <RouterLink class="btn btn--ghost" to="/entrar">Entrar na plataforma</RouterLink>
        </div>
        <ul class="hero__facts rise" style="--d: 0.32s">
          <li>Sem cadastro</li>
          <li aria-hidden="true">·</li>
          <li>100% gratuito</li>
          <li aria-hidden="true">·</li>
          <li>Feito para deficientes auditivos</li>
        </ul>
      </div>
    </section>

    <!-- FERRAMENTAS -->
    <section id="ferramentas" class="tools">
      <span class="orb orb--tools" data-parallax="0.14" data-mouse="20" aria-hidden="true"></span>
      <div class="container">
        <div class="head" data-reveal>
          <h2>Uma plataforma, várias mãos</h2>
          <p>Cada recurso é uma ferramenta. Comece pela tradução — já funciona.</p>
        </div>

        <div v-for="sec in toolSections" :key="sec.key" class="group">
          <div class="subhead" data-reveal>
            <h3>{{ sec.title }}</h3>
            <p>{{ sec.subtitle }}</p>
          </div>
          <div class="board">
            <ToolCard
              v-for="(t, i) in toolsOf(sec.key)"
              :key="t.id"
              :tool="t"
              data-reveal
              :style="{ transitionDelay: i * 0.07 + 's' }"
              @activate="onActivate"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- POR QUE SEMÂNTICA -->
    <section id="semantica" class="why">
      <div class="why__grid-bg" data-parallax="0.12" aria-hidden="true"></div>
      <div class="container why__in" data-reveal>
        <span class="eyebrow eyebrow--night">Nosso diferencial</span>
        <h2 class="why__title">Por que <span class="brand-text">adaptação semântica?</span></h2>
        <p class="why__lead">
          A Libras tem gramática própria — visual e espacial. Traduzir ao pé da letra gera
          frases artificiais. O Semantia parte do significado e reorganiza na ordem que faz
          sentido em sinais.
        </p>
        <div class="glosa">
          <span class="glosa__from">“Hoje vamos estudar a equação do segundo grau”</span>
          <span class="glosa__arrow" aria-hidden="true">→</span>
          <span class="glosa__to">
            <span style="--i: 0">HOJE</span>
            <span style="--i: 1">AULA</span>
            <span style="--i: 2">MATEMÁTICA</span>
            <span style="--i: 3">TEMA</span>
            <span style="--i: 4">EQUAÇÃO·2º·GRAU</span>
          </span>
        </div>
      </div>
    </section>
  </main>

  <footer class="ftr">
    <div class="container ftr__in">
      <img src="/brand/semantia-logo.png" alt="Semantia" class="ftr__logo" />
      <nav class="ftr__nav" aria-label="Conta">
        <RouterLink to="/entrar">Entrar</RouterLink>
        <RouterLink to="/criar-conta">Criar conta</RouterLink>
      </nav>
      <p class="ftr__meta">
        TCC · Análise e Desenvolvimento de Sistemas · UNISENAI Joinville<br />
        <span>Tradução em Libras por VLibras (gov.br) · Sinais por Signbank UFSC</span>
      </p>
    </div>
  </footer>

  <Transition name="modal">
    <ToolModal v-if="activeTool" :tool="activeTool" @close="activeTool = null" />
  </Transition>

  <Transition name="toast">
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </Transition>
</template>

<style scoped>
/* HEADER */
.hdr {
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(243, 245, 250, 0.72);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.hdr__in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 70px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}
.brand__mark {
  height: 36px;
  width: auto;
}
.brand__name {
  font-family: var(--display);
  font-weight: 800;
  font-size: 21px;
  color: var(--ink);
  letter-spacing: -0.02em;
}
.nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav a,
.nav__cta,
.nav__login {
  padding: 9px 15px;
  border-radius: 11px;
  text-decoration: none;
  font-family: inherit;
  font-weight: 600;
  font-size: 15px;
  color: var(--ink-soft);
  background: none;
  border: 0;
  cursor: pointer;
  transition: background 0.16s, color 0.16s, filter 0.16s;
}
.nav a:hover,
.nav__login:hover {
  background: var(--bg-2);
  color: var(--ink);
}
.nav__cta {
  color: #fff;
  background: var(--brand);
  box-shadow: var(--shadow-brand);
}
.nav__cta:hover {
  filter: brightness(1.05);
}

/* EYEBROW */
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-ink);
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(6px);
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.7);
}
.eyebrow__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
}
.eyebrow--night {
  color: #adb6ff;
  background: rgba(120, 140, 255, 0.14);
  border: 0;
}

/* HERO */
.hero {
  position: relative;
  min-height: 94svh;
  display: grid;
  place-items: center;
  overflow: hidden;
  isolation: isolate;
}
.hero__bg {
  position: absolute;
  inset: 0;
  z-index: -3;
}
.orb {
  position: absolute;
  z-index: -2;
  border-radius: 50%;
  filter: blur(50px);
  pointer-events: none;
  will-change: transform;
}
.orb--a {
  width: 360px;
  height: 360px;
  top: 2%;
  left: 8%;
  background: radial-gradient(circle, rgba(146, 119, 207, 0.5), transparent 68%);
}
.orb--b {
  width: 300px;
  height: 300px;
  top: 16%;
  right: 10%;
  background: radial-gradient(circle, rgba(79, 179, 191, 0.5), transparent 68%);
}
.orb--c {
  width: 260px;
  height: 260px;
  bottom: 6%;
  left: 32%;
  background: radial-gradient(circle, rgba(91, 134, 212, 0.45), transparent 68%);
}
.ghost {
  position: absolute;
  z-index: -2;
  font-family: var(--display);
  font-weight: 800;
  font-size: clamp(60px, 10vw, 150px);
  letter-spacing: -0.04em;
  color: rgba(91, 134, 212, 0.07);
  pointer-events: none;
  user-select: none;
  will-change: transform;
}
.ghost--1 {
  top: 12%;
  right: 6%;
}
.ghost--2 {
  bottom: 10%;
  left: 4%;
}
.hero__veil {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(58% 52% at 50% 50%, rgba(247, 249, 252, 0.72), transparent 76%),
    linear-gradient(to bottom, transparent 62%, var(--bg) 99%);
}
.hero__in {
  text-align: center;
  padding: 80px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  will-change: transform;
}
.hero__title {
  font-size: clamp(31px, 7vw, 82px);
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 24px 0 0;
  max-width: 16ch;
}
.strike {
  position: relative;
  color: var(--muted);
  white-space: nowrap;
}
.strike::after {
  content: '';
  position: absolute;
  left: -2%;
  right: -2%;
  top: 52%;
  height: 4px;
  background: var(--brand);
  border-radius: 2px;
  transform: rotate(-1.6deg);
}
.hero__lead {
  max-width: 50ch;
  margin: 24px 0 0;
  font-size: clamp(16px, 2vw, 19px);
  color: var(--ink-soft);
}
.hero__cta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-top: 32px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 15px 28px;
  border-radius: 14px;
  font-family: var(--display);
  font-weight: 600;
  font-size: 16px;
  text-decoration: none;
  border: 0;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}
.btn--solid {
  color: #fff;
  background: var(--brand);
  box-shadow: var(--shadow-brand);
}
.btn--solid:hover {
  transform: translateY(-2px);
}
.btn--ghost {
  color: var(--ink);
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--line);
  backdrop-filter: blur(6px);
}
.btn--ghost:hover {
  background: #fff;
}
.hero__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  list-style: none;
  padding: 0;
  margin: 28px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-soft);
}

/* HEAD */
.head {
  text-align: center;
  margin-bottom: 38px;
}
.head h2,
.why__title {
  font-size: clamp(26px, 3.8vw, 38px);
  font-weight: 800;
}
.head p {
  margin-top: 12px;
  color: var(--ink-soft);
}

/* FERRAMENTAS */
.tools {
  position: relative;
  padding: 88px 0 40px;
  overflow: hidden;
}
.orb--tools {
  position: absolute;
  z-index: 0;
  top: -40px;
  right: -60px;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(146, 119, 207, 0.22), transparent 68%);
  filter: blur(30px);
  pointer-events: none;
  will-change: transform;
}
.tools .container {
  position: relative;
  z-index: 1;
}
.board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(214px, 1fr));
  gap: 18px;
}
.group {
  margin-top: 44px;
}
.group:first-of-type {
  margin-top: 8px;
}
.subhead {
  margin-bottom: 18px;
}
.subhead h3 {
  font-family: var(--display);
  font-size: clamp(20px, 2.6vw, 26px);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.subhead p {
  margin-top: 4px;
  font-size: 14.5px;
  color: var(--ink-soft);
}

/* WHY */
.why {
  position: relative;
  margin: 40px 0 0;
  padding: 96px 0;
  background: var(--night);
  color: var(--on-night);
  overflow: hidden;
}
.why__grid-bg {
  position: absolute;
  inset: -30% 0;
  background-image:
    linear-gradient(rgba(120, 140, 255, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 140, 255, 0.07) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(70% 60% at 50% 40%, #000, transparent 80%);
  will-change: transform;
}
.why__in {
  position: relative;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.why__title {
  color: #fff;
  margin: 18px 0 0;
}
.why__lead {
  max-width: 60ch;
  margin: 18px 0 0;
  font-size: 17px;
  color: var(--on-night);
}
.glosa {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 40px;
  padding: 26px;
  background: var(--night-2);
  border: 1px solid var(--night-line);
  border-radius: var(--radius);
}
.glosa__from {
  font-style: italic;
  color: #e9edf6;
  font-size: 16px;
}
.glosa__arrow {
  color: #8fa0ff;
  font-weight: 800;
  font-size: 20px;
}
.glosa__to {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.glosa__to span {
  font-family: var(--display);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.03em;
  color: #fff;
  background: linear-gradient(140deg, rgba(79, 179, 191, 0.92), rgba(146, 119, 207, 0.92));
  border-radius: 9px;
  padding: 7px 11px;
}

/* FOOTER */
.ftr {
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.ftr__nav {
  display: flex;
  gap: 18px;
}
.ftr__nav a {
  color: var(--ink-soft);
  font-weight: 700;
}
.ftr__in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 18px;
  padding-block: 30px;
}
.ftr__logo {
  height: 52px;
  width: auto;
}
.ftr__meta {
  text-align: right;
  font-size: 13.5px;
  color: var(--muted);
  line-height: 1.6;
}

/* ENTRADA + REVEAL */
.rise {
  opacity: 0;
  animation: rise 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
  animation-delay: var(--d, 0s);
}
@keyframes rise {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: none; }
}
[data-reveal] {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1);
}
[data-reveal].in {
  opacity: 1;
  transform: none;
}

/* Header: os links de âncora não cabem junto de Entrar + CTA abaixo de ~680px */
@media (max-width: 680px) {
  .nav a:not(.nav__login) {
    display: none;
  }
}
@media (max-width: 560px) {
  .ftr__meta {
    text-align: left;
  }
  .hero__in {
    padding-block: 64px;
  }
}
/* Telas bem estreitas: compacta brand + botões para caber em 360px sem estourar */
@media (max-width: 480px) {
  .hdr__in {
    padding-inline: 16px;
  }
  .brand__name {
    font-size: 18px;
  }
  .nav {
    gap: 4px;
  }
  .nav__login,
  .nav__cta {
    padding: 8px 11px;
    font-size: 13.5px;
  }
  .glosa {
    padding: 20px 16px;
  }
}

/* TOAST */
.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 70;
  width: max-content;
  max-width: calc(100vw - 32px);
  text-align: center;
  padding: 13px 22px;
  border-radius: 14px;
  background: var(--night);
  color: #fff;
  font-weight: 600;
  font-size: 14.5px;
  box-shadow: var(--shadow-md);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
