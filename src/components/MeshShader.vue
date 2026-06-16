<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ShaderMount,
  meshGradientFragmentShader,
  getShaderColorFromString,
  ShaderFitOptions,
} from '@paper-design/shaders'

const props = withDefaults(
  defineProps<{ colors?: string[]; speed?: number; swirl?: number; distortion?: number }>(),
  {
    colors: () => ['#eef3fb', '#bfe3e6', '#a9c2f2', '#cdbdf0', '#e7ecfa'],
    speed: 0.4,
    swirl: 0.7,
    distortion: 0.85,
  },
)

const el = ref<HTMLDivElement | null>(null)
let mount: ShaderMount | null = null

onMounted(() => {
  if (!el.value) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  mount = new ShaderMount(
    el.value,
    meshGradientFragmentShader,
    {
      u_colors: props.colors.map((c) => getShaderColorFromString(c)),
      u_colorsCount: props.colors.length,
      u_distortion: props.distortion,
      u_swirl: props.swirl,
      u_grainMixer: 0,
      u_grainOverlay: 0,
      u_fit: ShaderFitOptions.cover,
      u_scale: 1,
      u_rotation: 0,
      u_offsetX: 0,
      u_offsetY: 0,
      u_originX: 0.5,
      u_originY: 0.5,
      u_worldWidth: 0,
      u_worldHeight: 0,
    },
    undefined,
    reduce ? 0 : props.speed,
  )
})

onBeforeUnmount(() => mount?.dispose())
</script>

<template>
  <div ref="el" class="mesh" aria-hidden="true"></div>
</template>

<style scoped>
.mesh {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.mesh :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>
