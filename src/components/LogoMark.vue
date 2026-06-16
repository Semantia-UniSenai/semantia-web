<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 40 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    role="img"
    aria-label="Semantia"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="semGrad" x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
        <stop stop-color="#5BBFC4" />
        <stop offset="0.52" stop-color="#6A8FE0" />
        <stop offset="1" stop-color="#9B7FD4" />
      </linearGradient>
    </defs>
    <!-- conexões (rede neural em forma de mão/gesto) -->
    <g stroke="url(#semGrad)" stroke-width="2" stroke-linecap="round">
      <path d="M24 28 L14 12" />
      <path d="M24 28 L21 9" />
      <path d="M24 28 L29 10" />
      <path d="M24 28 L36 15" />
      <path d="M24 28 L12 26" />
      <path d="M24 28 L37 30" />
      <path d="M24 28 L20 40" />
    </g>
    <!-- nós -->
    <g fill="url(#semGrad)">
      <circle cx="14" cy="12" r="3" />
      <circle cx="21" cy="9" r="3" />
      <circle cx="29" cy="10" r="3" />
      <circle cx="36" cy="15" r="3" />
      <circle cx="12" cy="26" r="3" />
      <circle cx="37" cy="30" r="3" />
      <circle cx="20" cy="40" r="3" />
    </g>
    <!-- núcleo -->
    <circle cx="24" cy="28" r="5.5" fill="#fff" />
    <circle cx="24" cy="28" r="3.6" fill="url(#semGrad)" />
  </svg>
</template>
