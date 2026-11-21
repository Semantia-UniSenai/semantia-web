<script setup lang="ts">
import type { Tool } from '../data/tools'
import { statusLabel } from '../data/tools'
import ToolIcon from './ToolIcon.vue'

defineProps<{ tool: Tool }>()
const emit = defineEmits<{ activate: [tool: Tool] }>()
</script>

<template>
  <button
    type="button"
    class="tile"
    :class="[`tile--${tool.status}`]"
    @click="emit('activate', tool)"
  >
    <span class="tile__status">
      <span class="dot" aria-hidden="true"></span>{{ statusLabel[tool.status] }}
    </span>
    <span class="tile__icon"><ToolIcon :name="tool.icon" /></span>
    <h3 class="tile__title">{{ tool.title }}</h3>
    <p class="tile__desc">{{ tool.description }}</p>
    <span v-if="tool.source" class="tile__source">{{ tool.source }}</span>
    <span v-if="tool.status === 'disponivel'" class="tile__go" aria-hidden="true">
      Abrir
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 30px 22px 26px;
  min-height: 230px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: transform 0.22s cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 0.22s ease,
    border-color 0.22s ease;
}
.tile::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 4px;
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--brand);
  opacity: 0;
  transition: opacity 0.22s ease;
}
.tile:hover {
  transform: translateY(-6px);
  box-shadow: var(--shadow-md);
}
.tile:hover::before {
  opacity: 1;
}
.tile--em-construcao,
.tile--fase-2 {
  opacity: 0.8;
}

.tile__status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.tile--disponivel .tile__status {
  color: #1f9d6b;
}
.tile--disponivel .dot {
  background: #25c08a;
  box-shadow: 0 0 0 4px rgba(37, 192, 138, 0.16);
}
.tile--pro .tile__status {
  color: #b8860b;
}
.tile--pro .dot {
  background: linear-gradient(140deg, #e8b84b, #c8932a);
  box-shadow: 0 0 0 4px rgba(200, 147, 42, 0.16);
}

.tile__icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 17px;
  background: var(--bg-2);
  color: var(--brand-ink);
  transition: background 0.22s ease, color 0.22s ease;
}
.tile:hover .tile__icon {
  background: var(--brand);
  color: #fff;
}
.tile--pro .tile__icon {
  background: linear-gradient(140deg, #f1d486, #d9a83e);
  color: #fff;
}
.tile__icon svg {
  width: 29px;
  height: 29px;
}
.tile__title {
  font-size: 18px;
  font-weight: 700;
}
.tile__desc {
  font-size: 13.5px;
  color: var(--ink-soft);
  line-height: 1.5;
}
.tile__source {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--muted);
  text-transform: uppercase;
}
.tile__go {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--display);
  font-weight: 700;
  font-size: 14px;
  color: var(--brand-ink);
}
.tile:hover .tile__go svg {
  transform: translateX(3px);
  transition: transform 0.18s ease;
}
@media (max-width: 380px) {
  .tile {
    padding: 26px 18px 22px;
    min-height: 210px;
  }
}
</style>
