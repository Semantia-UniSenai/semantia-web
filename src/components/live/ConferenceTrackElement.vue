<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ConferenceTrackRef } from '../../live/media/types'

const props = defineProps<{
  track: ConferenceTrackRef
}>()

const mediaElement = ref<HTMLMediaElement | null>(null)

onMounted(() => {
  if (mediaElement.value) props.track.attach(mediaElement.value)
})

watch(
  () => props.track,
  async (nextTrack, previousTrack) => {
    const previousElement = mediaElement.value
    if (previousElement) previousTrack.detach(previousElement)
    await nextTick()
    if (mediaElement.value) nextTrack.attach(mediaElement.value)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  if (mediaElement.value) props.track.detach(mediaElement.value)
})
</script>

<template>
  <audio
    v-if="track.kind === 'audio'"
    ref="mediaElement"
    class="conference-track conference-track--audio"
    autoplay
    playsinline
  ></audio>
  <video
    v-else
    ref="mediaElement"
    class="conference-track conference-track--video"
    autoplay
    playsinline
    :muted="track.isLocal"
    aria-hidden="true"
  ></video>
</template>

<style scoped>
.conference-track--audio {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.conference-track--video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: #080d19;
}
</style>
