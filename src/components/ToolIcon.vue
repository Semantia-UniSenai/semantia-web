<script setup lang="ts">
import type { Tool } from '../data/tools'
defineProps<{ name: Tool['icon'] }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'avatar'">
      <circle cx="12" cy="6.5" r="2.6" /><path d="M7 20v-2a5 5 0 0 1 10 0v2" />
      <path d="M4 13l2.5-1M20 13l-2.5-1" />
    </template>
    <template v-else-if="name === 'dicionario'">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18v15.5H5.5A1.5 1.5 0 0 0 4 21z" />
      <path d="M18 17H5.5M9 8.5h5" />
    </template>
    <template v-else-if="name === 'sinal'">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" />
    </template>
    <template v-else-if="name === 'recursos'">
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" /><path d="M9 4v13M15 6.5v13" />
    </template>
    <template v-else-if="name === 'faq'">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.3a2.8 2.8 0 0 1 5.4 1c0 1.9-2.6 2.2-2.6 3.9" /><path d="M12 17.2h.01" />
    </template>
    <template v-else-if="name === 'guia'">
      <path d="M12 6c-1.6-1.2-3.6-2-6-2v13c2.4 0 4.4.8 6 2 1.6-1.2 3.6-2 6-2V4c-2.4 0-4.4.8-6 2z" />
      <path d="M12 6v13" />
    </template>
    <template v-else-if="name === 'mao'">
      <path d="M9 11V5.5a1.3 1.3 0 0 1 2.6 0V10" />
      <path d="M11.6 10V4.6a1.3 1.3 0 0 1 2.6 0V10" />
      <path d="M14.2 10.2V6a1.3 1.3 0 0 1 2.6 0v7a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.3-2.5L4 13.5a1.4 1.4 0 0 1 2.3-1.6L8 14V7.2a1.3 1.3 0 0 1 2.6 0V10" />
    </template>
    <template v-else-if="name === 'quiz'">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9.3 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.5 2.1-2.5 3.7" /><path d="M12 17h.01" />
    </template>
    <template v-else>
      <circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" /><circle cx="12" cy="12" r="1.4" />
      <path d="M7 6h3l2 6M7 18h3l2-6M14 12h3" />
    </template>
  </svg>
</template>
