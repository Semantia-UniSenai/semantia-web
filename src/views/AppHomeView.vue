<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import FingerspellingGame from '../components/FingerspellingGame.vue'
import { submitScore, useGetRanking } from '../api/generated/games/games'
import { useAuth } from '../stores/auth'

const router = useRouter()
const { user, logout } = useAuth()

const GAME_KEY = 'fingerspelling'
const { data: ranking, refetch, isFetching } = useGetRanking({ gameKey: GAME_KEY, limit: 20 })

const lastPoints = ref<number | null>(null)
const saving = ref(false)

async function onFinish(result: { points: number; accuracy: number; durationMs: number }) {
  lastPoints.value = result.points
  saving.value = true
  try {
    await submitScore({ gameKey: GAME_KEY, ...result })
    await refetch()
  } finally {
    saving.value = false
  }
}

function onLogout() {
  logout()
  router.push('/')
}
</script>

<template>
  <div class="app">
    <header class="bar">
      <RouterLink class="brand" to="/">
        <img src="/brand/semantia-mark.png" alt="" width="30" height="32" />
        <span>Semantia</span>
      </RouterLink>
      <div class="who">
        <span class="hi">Olá, <strong>{{ user?.name }}</strong></span>
        <button class="logout" type="button" @click="onLogout">Sair</button>
      </div>
    </header>

    <main class="grid">
      <section class="panel">
        <div class="panel__head">
          <h1>Treino de Datilologia</h1>
          <p>Reconheça a letra soletrada em Libras. Cada acerto vale pontos — e te coloca no ranking.</p>
        </div>
        <FingerspellingGame @finish="onFinish" />
        <p v-if="saving" class="saving">Salvando pontuação…</p>
        <p v-else-if="lastPoints !== null" class="saved">Pontuação enviada: {{ lastPoints }} pts ✓</p>
      </section>

      <aside class="panel rank">
        <div class="panel__head">
          <h2>Ranking 🏆</h2>
          <p>Melhores pontuações. {{ isFetching ? 'atualizando…' : '' }}</p>
        </div>
        <ol class="list">
          <li
            v-for="row in ranking"
            :key="row.userId"
            :class="{ me: row.userId === user?.id }"
          >
            <span class="pos">{{ row.rank }}</span>
            <span class="name">{{ row.name }}<em v-if="row.userId === user?.id"> (você)</em></span>
            <span class="score">{{ row.points }}</span>
          </li>
          <li v-if="!ranking || ranking.length === 0" class="empty">
            Ninguém pontuou ainda. Seja o primeiro!
          </li>
        </ol>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100svh;
  background: radial-gradient(70% 40% at 50% 0%, rgba(91, 134, 212, 0.08), transparent 70%), var(--bg);
}
.bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 22px;
  background: rgba(243, 245, 250, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  text-decoration: none;
  font-family: var(--display);
  font-weight: 800;
  font-size: 19px;
  color: var(--ink);
}
.who {
  display: flex;
  align-items: center;
  gap: 14px;
}
.hi {
  font-size: 14.5px;
  color: var(--ink-soft);
}
.logout {
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  color: var(--ink-soft);
  cursor: pointer;
}
.logout:hover {
  color: var(--ink);
  border-color: var(--brand);
}
.grid {
  max-width: 1080px;
  margin: 0 auto;
  padding: 28px 20px 60px;
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 22px;
  align-items: start;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
}
.panel__head {
  margin-bottom: 18px;
}
.panel__head h1 {
  font-size: 24px;
  font-weight: 800;
}
.panel__head h2 {
  font-size: 20px;
  font-weight: 800;
}
.panel__head p {
  margin-top: 6px;
  font-size: 14px;
  color: var(--ink-soft);
}
.saving,
.saved {
  margin-top: 14px;
  font-size: 14px;
  font-weight: 600;
}
.saved {
  color: #1f9d55;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.list li {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 11px;
  background: var(--bg);
  font-size: 14.5px;
}
.list li.me {
  background: linear-gradient(90deg, rgba(91, 134, 212, 0.16), rgba(146, 119, 207, 0.12));
  outline: 1px solid var(--brand);
}
.pos {
  font-family: var(--display);
  font-weight: 800;
  color: var(--ink-soft);
  text-align: center;
}
.name {
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name em {
  color: var(--brand);
  font-style: normal;
  font-weight: 700;
}
.score {
  font-family: var(--display);
  font-weight: 800;
  color: var(--brand);
}
.empty {
  color: var(--muted);
  justify-content: center;
  text-align: center;
}

@media (max-width: 820px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
