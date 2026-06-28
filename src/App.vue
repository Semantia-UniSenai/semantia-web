<script setup lang="ts">
import { RouterView } from 'vue-router'
// VLibras é global: o componente é registrado no app (main.ts) e exposto em toda rota.
</script>

<template>
  <VLibras avatar="icaro" position="bottom-right" :opacity="1" />
  <RouterView />
</template>
