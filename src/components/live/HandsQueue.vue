<script setup lang="ts">
import type { RaisedHand } from '../../live/types'
import LiveIcon from './LiveIcon.vue'

defineProps<{
  hands: RaisedHand[]
}>()

function hour(at: string): string {
  return new Date(at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="hands" aria-live="polite" aria-label="Fila de mãos levantadas">
    <p v-if="hands.length === 0" class="hands__empty">Nenhuma mão levantada.</p>
    <TransitionGroup v-else name="hand" tag="ol" class="hands__list">
      <li v-for="(hand, i) in hands" :key="hand.participantId" class="hands__item">
        <span class="hands__pos">{{ i + 1 }}º</span>
        <LiveIcon class="hands__icon" name="hand" :size="17" />
        <span class="hands__name">{{ hand.name }}</span>
        <time class="hands__time">{{ hour(hand.at) }}</time>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.hands__empty {
  margin: 0;
  padding: 14px;
  font-size: 14px;
  color: var(--muted);
}
.hands__list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hands__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(146, 119, 207, 0.1);
  border: 1px solid rgba(146, 119, 207, 0.25);
}
.hands__item:first-child {
  background: rgba(146, 119, 207, 0.18);
  border-color: var(--purple);
}
.hands__pos {
  font-weight: 800;
  font-size: 13px;
  color: var(--purple);
  min-width: 22px;
}
.hands__icon {
  color: var(--purple);
  flex-shrink: 0;
}
.hands__name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hands__time {
  font-size: 12px;
  color: var(--muted);
}
.hand-enter-active {
  transition: all 0.25s ease;
}
.hand-leave-active {
  transition: all 0.2s ease;
}
.hand-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
.hand-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .hand-enter-active,
  .hand-leave-active {
    transition: none;
  }
}
</style>
