<script setup lang="ts">
/** Ícones da sala (traços do Lucide, MIT) — SVG inline em vez de emoji,
 * que rende quadrado vazio em plataformas sem fonte de emoji. */
defineProps<{
  name: 'hand' | 'chat' | 'people'
  size?: number
}>()
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'hand'">
      <path d="M18 11V6a2 2 0 0 0-4 0v5" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="m7 15-1.76-1.76a2 2 0 0 0-2.83 2.82l3.6 3.6A8 8 0 0 0 22 14v-3a2 2 0 0 0-4 0" />
    </template>
    <path v-else-if="name === 'chat'" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    <template v-else>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </template>
  </svg>
</template>
