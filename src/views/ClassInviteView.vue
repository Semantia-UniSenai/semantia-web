<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { joinClass } from '../api/generated/classes/classes'
import { apiErrorStatus, extractApiError } from '../components/classes/apiError'

const route = useRoute()
const router = useRouter()

const code = route.params.code as string

const joining = ref(false)
const error = ref('')

async function onJoin() {
  error.value = ''
  joining.value = true
  try {
    const joined = await joinClass({ inviteCode: code })
    router.push(`/app/turmas/${joined.id}`)
  } catch (e: unknown) {
    if (apiErrorStatus(e) === 409) {
      router.push('/app/turmas')
      return
    }
    error.value = extractApiError(e, 'Este convite não é válido. Confira o link com o professor.')
    joining.value = false
  }
}
</script>

<template>
  <main class="invite">
    <RouterLink class="invite__brand" to="/app">
      <img src="/brand/semantia-mark.png" alt="" width="34" height="36" />
      <span>Semantia</span>
    </RouterLink>

    <div class="card">
      <p class="kicker">Convite</p>
      <h1>Você foi convidado para uma turma</h1>
      <p class="sub">
        Ao entrar, você acompanha as aulas ao vivo com transcrição em tempo real e acessa o histórico depois.
      </p>
      <p class="code-label">Código do convite</p>
      <code class="code">{{ code }}</code>

      <p v-if="error" class="err" role="alert">{{ error }}</p>

      <button class="btn" type="button" :disabled="joining" @click="onJoin">
        {{ joining ? 'Entrando…' : 'Entrar na turma' }}
      </button>
      <RouterLink class="alt" to="/app/turmas">Ver minhas turmas</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.invite {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 32px 20px;
  background: radial-gradient(60% 50% at 50% 0%, rgba(91, 134, 212, 0.1), transparent 70%), var(--bg);
}
.invite__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  font-family: var(--display);
  font-weight: 800;
  font-size: 20px;
  color: var(--ink);
}
.card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 36px 32px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow-md);
}
.kicker {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.card h1 {
  font-size: 24px;
  font-weight: 800;
}
.sub {
  color: var(--ink-soft);
  font-size: 14.5px;
}
.code-label {
  margin-top: 6px;
  font-size: 12.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.code {
  padding: 10px 18px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px dashed var(--line);
  font-family: var(--display);
  font-weight: 800;
  font-size: 18px;
  letter-spacing: 0.12em;
  color: var(--ink);
  word-break: break-all;
}
.err {
  color: #c0362c;
  font-size: 13.5px;
  font-weight: 600;
}
.btn {
  width: 100%;
  margin-top: 6px;
  padding: 13px;
  border: 0;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-family: var(--display);
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  box-shadow: var(--shadow-brand);
}
.btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
.alt {
  font-size: 14px;
  font-weight: 700;
  color: var(--blue);
}
</style>
