<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const props = defineProps<{ text: string; label: string; copiedLabel?: string }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text)
  } catch {
    const area = document.createElement('textarea')
    area.value = props.text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    document.body.removeChild(area)
  }
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    copied.value = false
  }, 2000)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <button class="copy" type="button" :class="{ done: copied }" aria-live="polite" @click="copy">
    <svg v-if="!copied" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
      <path d="M10.5 3.5v-.3A1.7 1.7 0 0 0 8.8 1.5H3.7A2.2 2.2 0 0 0 1.5 3.7v5.1a1.7 1.7 0 0 0 1.7 1.7h.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 8.5 6 12l7.5-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span>{{ copied ? (copiedLabel ?? 'Copiado!') : label }}</span>
  </button>
</template>

<style scoped>
.copy {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  font: inherit;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--ink-soft);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.copy:hover {
  color: var(--ink);
  border-color: var(--blue);
}
.copy.done {
  color: #1f9d55;
  border-color: #1f9d55;
}
</style>
