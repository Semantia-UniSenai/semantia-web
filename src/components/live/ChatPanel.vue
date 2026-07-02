<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ChatMessage } from '../../live/types'

const props = defineProps<{
  messages: ChatMessage[]
  myUserId?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const draft = ref('')
const list = ref<HTMLElement | null>(null)

function submit() {
  const text = draft.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  draft.value = ''
}

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
)

function hour(at: string): string {
  return new Date(at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="chat">
    <div ref="list" class="chat__list" aria-label="Mensagens do chat">
      <p v-if="messages.length === 0" class="chat__empty">
        Sem mensagens ainda. Tire sua dúvida por aqui.
      </p>
      <div
        v-for="m in messages"
        :key="m.id"
        class="chat__msg"
        :class="{ mine: m.userId === myUserId }"
      >
        <div class="chat__meta">
          <strong>{{ m.userId === myUserId ? 'Você' : m.name }}</strong>
          <span v-if="m.role === 'PROFESSOR'" class="chat__badge">Professor</span>
          <time>{{ hour(m.at) }}</time>
        </div>
        <p class="chat__text">{{ m.text }}</p>
      </div>
    </div>

    <form class="chat__form" @submit.prevent="submit">
      <label class="sr-only" for="chat-input">Escrever mensagem</label>
      <input
        id="chat-input"
        v-model="draft"
        type="text"
        maxlength="1000"
        autocomplete="off"
        :disabled="disabled"
        :placeholder="disabled ? 'A aula foi encerrada' : 'Escreva sua dúvida…'"
      />
      <button type="submit" :disabled="disabled || !draft.trim()" aria-label="Enviar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3.4 20.4 20.8 12 3.4 3.6l2.8 6.9L14 12l-7.8 1.5-2.8 6.9Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </form>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.chat__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  scrollbar-width: thin;
}
.chat__empty {
  margin: auto;
  text-align: center;
  font-size: 14px;
  color: var(--muted);
  padding: 0 16px;
}
.chat__msg {
  max-width: 88%;
  align-self: flex-start;
  background: var(--bg-2);
  border-radius: 14px 14px 14px 4px;
  padding: 9px 12px;
}
.chat__msg.mine {
  align-self: flex-end;
  background: rgba(91, 134, 212, 0.14);
  border-radius: 14px 14px 4px 14px;
}
.chat__meta {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
  color: var(--ink-soft);
}
.chat__meta strong {
  color: var(--ink);
  font-size: 12.5px;
}
.chat__badge {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
}
.chat__meta time {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}
.chat__text {
  margin: 3px 0 0;
  font-size: 14.5px;
  color: var(--ink);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.chat__form {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--line);
}
.chat__form input {
  flex: 1;
  min-width: 0;
  padding: 11px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  font: inherit;
  font-size: 14.5px;
  color: var(--ink);
}
.chat__form input:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}
.chat__form button {
  display: grid;
  place-items: center;
  width: 44px;
  border: none;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
}
.chat__form button:disabled {
  opacity: 0.45;
  cursor: default;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
