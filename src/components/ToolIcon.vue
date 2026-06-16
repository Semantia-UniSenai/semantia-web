<script setup lang="ts">
import type { Tool } from '../data/tools'
defineProps<{ name: Tool['icon'] }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <!-- adaptação semântica: nós reorganizando -->
    <template v-if="name === 'semantica'">
      <circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" /><circle cx="12" cy="12" r="1.4" />
      <path d="M7 6h3l2 6M7 18h3l2-6M14 12h3" />
    </template>
    <!-- tradutor / avatar -->
    <template v-else-if="name === 'avatar'">
      <circle cx="12" cy="6.5" r="2.6" />
      <path d="M7 20v-2a5 5 0 0 1 10 0v2" />
      <path d="M4 13l2.5-1M20 13l-2.5-1" />
    </template>
    <!-- datilologia: mão -->
    <template v-else-if="name === 'mao'">
      <path d="M9 11V5.5a1.3 1.3 0 0 1 2.6 0V10" />
      <path d="M11.6 10V4.6a1.3 1.3 0 0 1 2.6 0V10" />
      <path d="M14.2 10.2V6a1.3 1.3 0 0 1 2.6 0v7a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.3-2.5L4 13.5a1.4 1.4 0 0 1 2.3-1.6L8 14V7.2a1.3 1.3 0 0 1 2.6 0V10" />
    </template>
    <!-- dicionário -->
    <template v-else-if="name === 'dicionario'">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18v15.5H5.5A1.5 1.5 0 0 0 4 21z" />
      <path d="M18 17H5.5M9 8.5h5" />
    </template>
    <!-- câmera -->
    <template v-else>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.4-2h7.2L17 7h2.5A1.5 1.5 0 0 1 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </template>
  </svg>
</template>
