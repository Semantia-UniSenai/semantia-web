<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { resolveSessionToken } from '../api/generated/sessions/sessions'
import type { ResolvedSessionDto } from '../api/generated/model'

const route = useRoute()
const router = useRouter()

const token = route.params.token as string

const loading = ref(true)
const failed = ref(false)
const session = ref<ResolvedSessionDto | null>(null)

onMounted(async () => {
  try {
    session.value = await resolveSessionToken({ token })
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})

function enter() {
  if (!session.value) return
  router.push({ path: `/app/aula/${session.value.sessionId}`, query: { token } })
}
</script>

<template>
  <main class="invite">
    <RouterLink class="invite__brand" to="/app">
      <img src="/brand/semantia-mark.png" alt="" width="34" height="36" />
      <span>Semantia</span>
    </RouterLink>

    <div v-if="loading" class="card" aria-busy="true">
      <span class="sk sk--badge"></span>
      <span class="sk sk--title"></span>
      <span class="sk sk--line"></span>
      <p class="sr-only">Carregando convite…</p>
    </div>

    <div v-else-if="failed || !session" class="card" role="alert">
      <h1>Convite inválido</h1>
      <p class="sub">
        Este link de aula não existe mais ou expirou. Peça um novo link para quem convidou você.
      </p>
      <RouterLink class="btn" to="/app">Ir para o início</RouterLink>
    </div>

    <div v-else class="card">
      <p class="kicker">Você foi convidado para a aula</p>
      <h1>{{ session.title }}</h1>
      <span class="status" :class="session.status === 'LIVE' ? 'status--live' : 'status--ended'">
        <span v-if="session.status === 'LIVE'" class="dot" aria-hidden="true"></span>
        {{ session.status === 'LIVE' ? 'Ao vivo agora' : 'Aula encerrada' }}
      </span>
      <p class="sub">
        {{ session.status === 'LIVE'
          ? 'A transcrição em tempo real já está rolando. Entre para acompanhar.'
          : 'A aula terminou, mas a transcrição completa continua disponível.' }}
      </p>
      <button class="btn" type="button" @click="enter">
        {{ session.status === 'LIVE' ? 'Entrar na aula' : 'Ver transcrição' }}
      </button>
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
  gap: 14px;
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
  font-size: 25px;
  font-weight: 800;
}
.sub {
  color: var(--ink-soft);
  font-size: 14.5px;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}
.status--live {
  background: rgba(192, 54, 44, 0.1);
  color: #b02c22;
}
.status--live .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d33a2f;
  animation: pulse 1.6s ease-in-out infinite;
}
.status--ended {
  background: var(--bg-2);
  color: var(--ink-soft);
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 4px;
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
  text-decoration: none;
}
.sk {
  display: block;
  width: 100%;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--bg) 25%, var(--bg-2) 50%, var(--bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
.sk--badge {
  height: 26px;
  width: 40%;
  border-radius: 999px;
}
.sk--title {
  height: 26px;
  width: 75%;
}
.sk--line {
  height: 15px;
  width: 60%;
}
@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
</style>
