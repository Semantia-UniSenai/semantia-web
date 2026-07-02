<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { useAuth } from '../../stores/auth'

defineProps<{ backTo?: string; backLabel?: string }>()

const router = useRouter()
const { user, logout } = useAuth()

function onLogout() {
  logout()
  router.push('/')
}
</script>

<template>
  <header class="bar">
    <div class="left">
      <RouterLink class="brand" to="/app" aria-label="Semantia — ir para o início do app">
        <img src="/brand/semantia-mark.png" alt="" width="30" height="32" />
        <span class="brand__name">Semantia</span>
      </RouterLink>
      <RouterLink v-if="backTo" class="back" :to="backTo">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10.5 3 5.5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{{ backLabel ?? 'Voltar' }}</span>
      </RouterLink>
    </div>
    <div class="who">
      <span class="hi">Olá, <strong>{{ user?.name }}</strong></span>
      <button class="logout" type="button" @click="onLogout">Sair</button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 64px;
  padding: 0 22px;
  background: rgba(243, 245, 250, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
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
.back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  text-decoration: none;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.back:hover {
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
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
}

@media (max-width: 560px) {
  .bar {
    padding: 0 14px;
  }
  .brand__name,
  .hi {
    display: none;
  }
}
</style>
