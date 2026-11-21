<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createMeeting } from '../api/generated/rooms/rooms'
import RoomsHeader from '../components/rooms/RoomsHeader.vue'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { user } = useAuth()
const invite = ref('')
const error = ref('')
const creating = ref(false)

async function openMeeting() {
  creating.value = true
  error.value = ''
  try {
    const meeting = await createMeeting({})
    await router.push(`/sala/${meeting.meetingId}`)
  } catch {
    error.value = 'Não foi possível abrir a reunião.'
  } finally {
    creating.value = false
  }
}

function openInvite() {
  const value = invite.value.trim()
  const token =
    value.match(/\/convite\/(?:reuniao|sessao)\/([\w-]+)/)?.[1] ??
    (/^[\w-]{16,}$/.test(value) ? value : '')
  if (token) return router.push(`/convite/reuniao/${token}`)
  error.value = 'Cole um link ou código de convite válido.'
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
          <p>
            Abra uma reunião instantânea, compartilhe o link e ofereça transcrição acessível em
            tempo real sem armazenar o áudio.
          </p>
          <div class="hero__actions">
            <button class="primary" type="button" :disabled="creating" @click="openMeeting">
              {{ creating ? 'Abrindo…' : 'Nova reunião' }}
            </button>
            <RouterLink class="secondary" to="/app/salas">Minhas reuniões</RouterLink>
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
        <article>
          <span>01</span>
          <h2>Reunião instantânea</h2>
          <p>Um clique abre a reunião ao vivo, sem telas de configuração ou espera.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Convite sem conta</h2>
          <p>A pessoa convidada entra pelo link com uma identidade temporária segura.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Transcrição preservada</h2>
          <p>Ao encerrar, o conteúdo permanece disponível em modo somente leitura.</p>
        </article>
      </section>

      <section id="invite" class="invite">
        <div class="invite__copy">
          <p class="eyebrow">Acesso rápido</p>
          <h2>Entre em uma reunião</h2>
          <p>Cole o link completo ou somente o código recebido do anfitrião.</p>
          <small>Você poderá informar seu nome antes de entrar.</small>
        </div>
        <form class="invite__form" aria-label="Entrar com convite" @submit.prevent="openInvite">
          <label for="meeting-invite">Link ou código da reunião</label>
          <input
            id="meeting-invite"
            v-model="invite"
            name="meeting-invite"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="Cole o link ou código do convite"
          />
          <button type="submit">
            Entrar na reunião
            <span aria-hidden="true">→</span>
          </button>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100svh;
  background: var(--bg);
}
.wrap {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 52px 0 82px;
}
.hero {
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: 48px;
  align-items: center;
  min-height: 470px;
}
.eyebrow {
  margin: 0 0 10px;
  color: var(--brand-ink);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.13em;
}
.hero h1 {
  max-width: 720px;
  margin: 0;
  font: 800 clamp(42px, 6vw, 74px) / 0.98 var(--display);
  letter-spacing: -0.04em;
}
.hero__copy > p:not(.eyebrow) {
  max-width: 650px;
  margin: 24px 0;
  color: var(--ink-soft);
  font-size: 18px;
  line-height: 1.65;
}
.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.primary,
.secondary {
  padding: 13px 17px;
  border-radius: 12px;
  font: 700 14px var(--display);
  text-decoration: none;
}
.primary {
  border: 0;
  background: var(--brand);
  color: white;
  box-shadow: var(--shadow-brand);
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: wait;
}
.secondary {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
}
.caption-preview {
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 24px;
  background: linear-gradient(145deg, #171e33, #2a3657);
  box-shadow: 0 28px 70px rgba(21, 30, 52, 0.25);
  color: white;
}
.caption-preview > span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #a9e7ca;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}
.caption-preview i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #46d795;
}
.caption-preview p {
  margin: 50px 0;
  font: 700 clamp(27px, 4vw, 42px) / 1.25 var(--display);
}
.caption-preview footer {
  color: #aeb8d1;
  font-size: 12px;
}
.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin: 24px 0 72px;
}
.features article {
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}
.features span {
  color: var(--brand-ink);
  font: 800 12px var(--display);
}
.features h2 {
  margin: 18px 0 8px;
  font-size: 20px;
}
.features p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}
.invite {
  display: grid;
  grid-template-columns: minmax(0, 0.88fr) minmax(380px, 1.12fr);
  gap: 48px;
  align-items: center;
  padding: 36px;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface);
  box-shadow: 0 20px 55px rgba(24, 32, 54, 0.07);
}
.invite h2 {
  margin: 0 0 10px;
  font-size: clamp(25px, 3vw, 34px);
  letter-spacing: -0.025em;
}
.invite__copy > p:not(.eyebrow) {
  margin: 0 0 12px;
  color: var(--muted);
  line-height: 1.6;
}
.invite__copy small {
  color: var(--ink-soft);
}
.invite__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}
.invite__form label {
  grid-column: 1 / -1;
  color: var(--ink);
  font: 800 13px var(--display);
}
.invite__form input {
  min-width: 0;
  height: 52px;
  padding: 0 16px;
  border: 1px solid var(--field-border);
  border-radius: 13px;
  background: var(--bg);
  color: var(--ink);
  font: 500 15px var(--display);
}
.invite__form input::placeholder {
  color: var(--muted);
}
.invite__form input:focus-visible {
  border-color: var(--blue);
  outline: 3px solid var(--blue);
  outline-offset: 2px;
}
.invite__form button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  height: 52px;
  padding: 0 20px;
  border: 0;
  border-radius: 13px;
  background: var(--brand);
  color: white;
  font: 800 14px var(--display);
  white-space: nowrap;
  cursor: pointer;
  box-shadow: var(--shadow-brand);
}
.invite__form button span {
  font-size: 18px;
}
.error {
  grid-column: 1 / -1;
  margin: 2px 0 0;
  color: #a43a52;
  font-weight: 700;
  font-size: 13px;
}
@media (max-width: 820px) {
  .wrap {
    padding-top: 24px;
  }
  .hero {
    grid-template-columns: 1fr;
    min-height: auto;
  }
  .hero h1 {
    font-size: clamp(40px, 11vw, 60px);
  }
  .features {
    grid-template-columns: 1fr;
    margin-top: 54px;
  }
  .invite {
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 24px;
  }
}
@media (max-width: 520px) {
  .hero__actions > * {
    flex: 1 1 auto;
    text-align: center;
  }
  .caption-preview {
    padding: 22px;
  }
  .caption-preview p {
    margin: 34px 0;
  }
  .invite__form {
    grid-template-columns: 1fr;
  }
  .invite__form button {
    width: 100%;
  }
}
</style>
