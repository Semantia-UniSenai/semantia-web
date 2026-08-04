import { computed, getCurrentInstance, onBeforeUnmount, readonly, ref } from 'vue'
import { prepareWhisperAudio } from './audioPreprocessing'

const TARGET_SAMPLE_RATE = 16_000
const MIN_AUDIO_DURATION_MS = 250
const DEFAULT_MAX_BUFFERED_SECONDS = 30

export type BackendAudioFinalizerStatus = 'idle' | 'ready' | 'processing' | 'error'

export interface BackendAudioSegment {
  pcm16: ArrayBuffer
  sampleRate: 16_000
  durationMs: number
}

interface PublishResult {
  ok: boolean
  error?: { code: string; message: string }
}

export interface UseBackendAudioFinalizerOptions {
  publish: (segment: BackendAudioSegment) => Promise<PublishResult>
  maxBufferedSeconds?: number
}

function encodePcm16(samples: Float32Array): ArrayBuffer {
  const output = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    output[index] = Math.round(sample * (sample < 0 ? 32_768 : 32_767))
  }
  return output.buffer
}

export function useBackendAudioFinalizer(options: UseBackendAudioFinalizerOptions) {
  const status = ref<BackendAudioFinalizerStatus>('idle')
  const error = ref<string | null>(null)
  const bufferedFrames = ref(0)
  let sampleRate = 0
  let chunks: Float32Array[] = []
  let disposed = false

  const bufferedSeconds = computed(() =>
    sampleRate > 0 ? bufferedFrames.value / sampleRate : 0,
  )

  function resetBuffer(nextSampleRate = 0) {
    chunks = []
    bufferedFrames.value = 0
    sampleRate = nextSampleRate
  }

  function start() {
    if (disposed) return
    resetBuffer()
    error.value = null
    status.value = 'ready'
  }

  function addAudioChunk(samples: Float32Array, incomingSampleRate: number) {
    if (
      disposed ||
      status.value === 'idle' ||
      samples.length === 0 ||
      !Number.isFinite(incomingSampleRate) ||
      incomingSampleRate <= 0
    ) {
      return
    }
    if (sampleRate !== incomingSampleRate) resetBuffer(incomingSampleRate)
    const copy = samples.slice()
    chunks.push(copy)
    bufferedFrames.value += copy.length
    const maxFrames = Math.floor(
      sampleRate * (options.maxBufferedSeconds ?? DEFAULT_MAX_BUFFERED_SECONDS),
    )
    while (bufferedFrames.value > maxFrames && chunks.length > 0) {
      const first = chunks.shift()
      if (!first) break
      bufferedFrames.value -= first.length
    }
  }

  function consumeBuffer() {
    const output = new Float32Array(bufferedFrames.value)
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.length
    }
    const sourceSampleRate = sampleRate
    resetBuffer(sourceSampleRate)
    return { output, sourceSampleRate }
  }

  async function finalizeSegment(): Promise<
    | { accepted: true; durationMs: number }
    | { accepted: false; reason: string }
  > {
    if (status.value === 'idle' || disposed) {
      return { accepted: false, reason: 'stopped' }
    }
    const { output, sourceSampleRate } = consumeBuffer()
    const prepared = prepareWhisperAudio(output, sourceSampleRate, {
      targetSampleRate: TARGET_SAMPLE_RATE,
    })
    const durationMs = Math.round((prepared.length * 1_000) / TARGET_SAMPLE_RATE)
    if (durationMs < MIN_AUDIO_DURATION_MS) {
      return { accepted: false, reason: 'empty-audio' }
    }

    status.value = 'processing'
    error.value = null
    const result = await options.publish({
      pcm16: encodePcm16(prepared),
      sampleRate: TARGET_SAMPLE_RATE,
      durationMs,
    })
    if (!result.ok) {
      status.value = 'error'
      error.value = result.error?.code ?? 'delivery-failed'
      return { accepted: false, reason: error.value }
    }
    status.value = 'ready'
    return { accepted: true, durationMs }
  }

  function stop() {
    resetBuffer()
    error.value = null
    status.value = 'idle'
  }

  function dispose() {
    if (disposed) return
    stop()
    disposed = true
  }

  if (getCurrentInstance()) onBeforeUnmount(dispose)

  return {
    status: readonly(status),
    error: readonly(error),
    bufferedSeconds,
    start,
    stop,
    addAudioChunk,
    finalizeSegment,
  }
}
