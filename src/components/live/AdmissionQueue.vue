<script setup lang="ts">
import type { AdmissionEntry } from '../../live/types'

defineProps<{
  queue: AdmissionEntry[]
}>()

const emit = defineEmits<{
  approve: [admissionId: string]
  reject: [admissionId: string]
}>()
</script>

<template>
  <section class="admission-queue" aria-label="Fila de entrada" aria-live="polite">
    <header class="admission-queue__header">
      <span class="admission-queue__label">Aguardando entrada</span>
      <span class="admission-queue__count">{{ queue.length }}</span>
    </header>
    <ul class="admission-queue__list" role="list">
      <li
        v-for="entry in queue"
        :key="entry.admissionId"
        class="admission-queue__item"
      >
        <span class="admission-queue__avatar" aria-hidden="true">
          {{ entry.displayName.charAt(0).toUpperCase() }}
        </span>
        <div class="admission-queue__info">
          <strong>{{ entry.displayName }}</strong>
          <small>{{ entry.isGuest ? 'Convidado' : 'Participante' }}</small>
        </div>
        <div class="admission-queue__actions">
          <button
            type="button"
            class="btn-approve"
            :aria-label="`Aprovar ${entry.displayName}`"
            @click="emit('approve', entry.admissionId)"
          >
            Aprovar
          </button>
          <button
            type="button"
            class="btn-reject"
            :aria-label="`Rejeitar ${entry.displayName}`"
            @click="emit('reject', entry.admissionId)"
          >
            Rejeitar
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.admission-queue {
  border-top: 1px solid #dce2ed;
  background: #f7f8fb;
}

.admission-queue__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px 8px;
}

.admission-queue__label {
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #758096;
  flex: 1;
}

.admission-queue__count {
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: #e8ebf4;
  color: #4c5669;
  font-size: 10px;
  font-weight: 750;
}

.admission-queue__list {
  list-style: none;
  margin: 0;
  padding: 0 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.admission-queue__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e8ebf4;
}

.admission-queue__avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: linear-gradient(135deg, #f0c060, #f0a050);
  color: #5a3a08;
  font-size: 14px;
  font-weight: 800;
}

.admission-queue__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admission-queue__info strong {
  font-size: 13px;
  color: #192234;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admission-queue__info small {
  font-size: 11px;
  color: #758096;
}

.admission-queue__actions {
  display: flex;
  gap: 5px;
  flex: 0 0 auto;
}

.btn-approve,
.btn-reject {
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.btn-approve {
  background: rgba(70, 200, 130, 0.14);
  color: #1a7a46;
}

.btn-approve:hover {
  background: rgba(70, 200, 130, 0.25);
}

.btn-reject {
  background: rgba(231, 88, 110, 0.12);
  color: #a63050;
}

.btn-reject:hover {
  background: rgba(231, 88, 110, 0.22);
}
</style>
