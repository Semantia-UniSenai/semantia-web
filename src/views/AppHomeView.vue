<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import RoomsHeader from '../components/rooms/RoomsHeader.vue'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { user } = useAuth()
const invite = ref('')
const error = ref('')

function openInvite() {
  const value = invite.value.trim()
  const session = value.match(/\/convite\/sessao\/([\w-]+)/)?.[1]
  const room = value.match(/\/convite\/sala\/([\w-]+)/)?.[1]
  if (session) return router.push(`/convite/sessao/${session}`)
  if (room) return router.push(`/convite/sala/${room}`)
  if (/^[\w-]{6,32}$/.test(value)) return router.push(`/convite/sala/${value}`)
  error.value = 'Cole um link de convite válido ou informe o código da sala.'
}
</script>

<template>
  <div class="page">
    <RoomsHeader />
    <main class="wrap">
      <section class="hero">
        <div class="hero__copy">
          <p class="eyebrow">Olá, {{ user?.name }}</p>
          <h1>Comunicação ao vivo que também pode ser lida.</h1>
          <p>Organize salas para qualquer contexto e ofereça transcrição acessível em tempo real sem gravar o áudio.</p>
          <div class="hero__actions">
            <RouterLink class="primary" to="/app/salas">Abrir minhas salas</RouterLink>
            <a class="secondary" href="#invite">Tenho um convite</a>
          </div>
        </div>
        <aside class="caption-preview" aria-label="Exemplo de transcrição">
          <span><i></i> Transcrição ao vivo</span>
          <p>“A próxima decisão é validar o fluxo com toda a equipe.”</p>
          <footer>Texto em tempo real • ajustável • pesquisável</footer>
        </aside>
      </section>

      <section class="features" aria-label="Recursos principais">
        <article><span>01</span><h2>Salas contextuais</h2><p>Anfitriões, moderadores e participantes têm permissões definidas por sala.</p></article>
        <article><span>02</span><h2>Convite sem conta</h2><p>A plateia entra com identidade temporária vinculada somente à sessão.</p></article>
        <article><span>03</span><h2>Histórico preservado</h2><p>Sessões encerradas ficam em leitura conforme a política de retenção.</p></article>
      </section>

      <section id="invite" class="invite">
        <div><p class="eyebrow">Acesso rápido</p><h2>Recebeu um convite?</h2><p>Cole o link completo ou digite o código da sala.</p></div>
        <form @submit.prevent="openInvite"><input v-model="invite" aria-label="Link ou código de convite" placeholder="Link de sessão ou código da sala" /><button type="submit">Continuar</button></form>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page{min-height:100svh;background:var(--bg)}.wrap{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:52px 0 82px}.hero{display:grid;grid-template-columns:1.08fr .92fr;gap:48px;align-items:center;min-height:470px}.eyebrow{margin:0 0 10px;color:var(--brand);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.13em}.hero h1{max-width:720px;margin:0;font:800 clamp(42px,6vw,74px)/.98 var(--display);letter-spacing:-.04em}.hero__copy>p:not(.eyebrow){max-width:650px;margin:24px 0;color:var(--ink-soft);font-size:18px;line-height:1.65}.hero__actions{display:flex;gap:10px}.primary,.secondary{padding:13px 17px;border-radius:12px;font:700 14px var(--display);text-decoration:none}.primary{background:var(--brand);color:white;box-shadow:var(--shadow-brand)}.secondary{border:1px solid var(--line);background:var(--surface);color:var(--ink)}.caption-preview{padding:30px;border:1px solid rgba(255,255,255,.09);border-radius:24px;background:linear-gradient(145deg,#171e33,#2a3657);box-shadow:0 28px 70px rgba(21,30,52,.25);color:white}.caption-preview>span{display:flex;align-items:center;gap:8px;color:#a9e7ca;font-size:12px;font-weight:800;text-transform:uppercase}.caption-preview i{width:8px;height:8px;border-radius:50%;background:#46d795}.caption-preview p{margin:50px 0;font:700 clamp(27px,4vw,42px)/1.25 var(--display)}.caption-preview footer{color:#aeb8d1;font-size:12px}.features{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0 72px}.features article{padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--surface)}.features span{color:var(--brand);font:800 12px var(--display)}.features h2{margin:18px 0 8px;font-size:20px}.features p{margin:0;color:var(--muted);line-height:1.55}.invite{display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:32px;border:1px solid var(--line);border-radius:22px;background:var(--surface)}.invite h2{margin:0;font-size:28px}.invite p{color:var(--muted)}.invite form{display:flex;align-items:center}.invite input{flex:1;min-width:0;padding:13px 14px;border:1px solid var(--line);border-radius:12px 0 0 12px;background:var(--bg);font:inherit}.invite button{padding:14px 18px;border:0;border-radius:0 12px 12px 0;background:var(--brand);color:white;font-weight:800;cursor:pointer}.error{grid-column:1/-1;margin:0!important;color:#aa352d!important}@media(max-width:820px){.hero,.invite{grid-template-columns:1fr}.hero{padding:35px 0}.features{grid-template-columns:1fr}.hero h1{font-size:46px}}@media(max-width:520px){.wrap{width:min(100% - 22px,1120px)}.hero__actions{flex-direction:column}.invite{padding:22px}.invite form{align-items:stretch;flex-direction:column}.invite input,.invite button{border-radius:11px}}
</style>
