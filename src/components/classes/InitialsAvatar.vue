<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: string; size?: number }>()

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
})

const hue = computed(() => {
  let h = 0
  for (const ch of props.name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
})
</script>

<template>
  <span
    class="avatar"
    aria-hidden="true"
    :style="{
      width: `${size ?? 38}px`,
      height: `${size ?? 38}px`,
      fontSize: `${(size ?? 38) * 0.38}px`,
      background: `linear-gradient(135deg, hsl(${hue}, 46%, 62%), hsl(${(hue + 42) % 360}, 46%, 52%))`,
    }"
  >
    {{ initials }}
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 50%;
  color: #fff;
  font-family: var(--display);
  font-weight: 700;
  letter-spacing: 0.02em;
  user-select: none;
}
</style>
