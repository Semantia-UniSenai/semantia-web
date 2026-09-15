import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
  useBackendAudioFinalizer,
  type BackendAudioSegment,
} from './useBackendAudioFinalizer'
import { usePcmAudioCapture } from './usePcmAudioCapture'
import type { SharedMicrophoneSource } from './media/shared-microphone-source'

export interface UseMeetingTranscriptionOptions {
  deviceId?: Readonly<Ref<string>>
  microphoneSource?: SharedMicrophoneSource
  onAudioSegment: (
    segment: BackendAudioSegment,
  ) => Promise<{ ok: boolean; error?: { code: string; message: string } }>
}

export function useMeetingTranscription(options: UseMeetingTranscriptionOptions) {
  const active = ref(false)
  let activeDeviceId = 'default'
  let lifecycleGeneration = 0

  const backend = useBackendAudioFinalizer({
    publish: options.onAudioSegment,
    segmentSeconds: 5,
  })
  const capture = usePcmAudioCapture({
    microphoneSource: options.microphoneSource,
    onAudioChunk: (samples, sampleRate) => {
      backend.addAudioChunk(samples, sampleRate)
    },
  })

  const error = computed(() => capture.error.value ?? backend.error.value)

  async function start(deviceId = options.deviceId?.value ?? 'default') {
    const generation = ++lifecycleGeneration
    activeDeviceId = deviceId || 'default'
    backend.start()
    active.value = true
    const started = await capture.start(activeDeviceId)
    if (generation !== lifecycleGeneration) return false
    if (!started) {
      await backend.stop()
      active.value = false
      return false
    }
    return true
  }

  async function stop(stopOptions: { flush?: boolean } = { flush: true }) {
    const generation = ++lifecycleGeneration
    capture.stop()
    await backend.stop({ flush: stopOptions.flush ?? true })
    if (generation === lifecycleGeneration) active.value = false
  }

  async function changeDevice(deviceId: string) {
    activeDeviceId = deviceId || 'default'
    const wasActive = capture.listening.value || capture.loading.value || active.value
    if (!wasActive) return
    await stop({ flush: true })
    await start(activeDeviceId)
  }

  const stopDeviceWatch = options.deviceId
    ? watch(options.deviceId, async (deviceId) => {
        await changeDevice(deviceId)
      })
    : () => undefined

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      stopDeviceWatch()
      void stop({ flush: false })
    })
  }

  return {
    supported: capture.supported,
    listening: capture.listening,
    loading: capture.loading,
    error,
    inputState: capture.inputState,
    audioLevel: capture.audioLevel,
    qualityStatus: computed(() => backend.status.value),
    qualityError: computed(() => backend.error.value),
    start,
    stop,
    changeDevice,
  }
}
