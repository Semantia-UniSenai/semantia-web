import { computed, getCurrentInstance, onBeforeUnmount, readonly, ref } from 'vue'

const TARGET_SAMPLE_RATE = 16_000
const MIN_AUDIO_DURATION_MS = 250
const DEFAULT_SEGMENT_SECONDS = 5
const MAX_SEGMENT_SECONDS = 30

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
  segmentSeconds?: number
}

type FinalizeResult =
  | { accepted: true; durationMs: number }
  | { accepted: false; reason: string }

function encodePcm16(samples: Float32Array): ArrayBuffer {
  const output = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    output[index] = Math.round(sample * (sample < 0 ? 32_768 : 32_767))
  }
  return output.buffer
}

function resample(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
) {
  if (input.length === 0 || !Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
    return new Float32Array()
  }
  if (sourceSampleRate === targetSampleRate) return input.slice()
  const outputLength = Math.max(
    1,
    Math.floor((input.length * targetSampleRate) / sourceSampleRate),
  )
  const output = new Float32Array(outputLength)
  const ratio = sourceSampleRate / targetSampleRate

  if (ratio > 1) {
    for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
      const start = Math.floor(outputIndex * ratio)
      const end = Math.max(start + 1, Math.floor((outputIndex + 1) * ratio))
      let sum = 0
      let count = 0
      for (let inputIndex = start; inputIndex < end && inputIndex < input.length; inputIndex += 1) {
        sum += input[inputIndex] ?? 0
        count += 1
      }
      output[outputIndex] = count > 0 ? sum / count : 0
    }
    return output
  }

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const position = outputIndex * ratio
    const left = Math.floor(position)
    const right = Math.min(input.length - 1, left + 1)
    const fraction = position - left
    output[outputIndex] =
      (input[left] ?? 0) * (1 - fraction) + (input[right] ?? 0) * fraction
  }
  return output
}

function validatedSegmentSeconds(value: number | undefined) {
  const seconds = value ?? DEFAULT_SEGMENT_SECONDS
  if (!Number.isFinite(seconds) || seconds < MIN_AUDIO_DURATION_MS / 1_000) {
    return DEFAULT_SEGMENT_SECONDS
  }
  return Math.min(seconds, MAX_SEGMENT_SECONDS)
}

export function useBackendAudioFinalizer(options: UseBackendAudioFinalizerOptions) {
  const status = ref<BackendAudioFinalizerStatus>('idle')
  const error = ref<string | null>(null)
  const bufferedFrames = ref(0)
  const segmentSeconds = validatedSegmentSeconds(options.segmentSeconds)
  let sampleRate = 0
  let chunks: Float32Array[] = []
  let disposed = false
  let generation = 0
  let publishChain: Promise<FinalizeResult> = Promise.resolve({
    accepted: false,
    reason: 'empty-audio',
  })

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
    generation += 1
    resetBuffer()
    error.value = null
    status.value = 'ready'
  }

  function consumeFrames(frameCount: number) {
    const requested = Math.min(frameCount, bufferedFrames.value)
    const output = new Float32Array(requested)
    let outputOffset = 0
    while (outputOffset < requested && chunks.length > 0) {
      const first = chunks[0]
      if (!first) break
      const take = Math.min(first.length, requested - outputOffset)
      output.set(first.subarray(0, take), outputOffset)
      outputOffset += take
      if (take === first.length) chunks.shift()
      else chunks[0] = first.slice(take)
    }
    bufferedFrames.value -= requested
    return { output, sourceSampleRate: sampleRate }
  }

  function enqueueSegment(
    output: Float32Array,
    sourceSampleRate: number,
    activeGeneration: number,
  ) {
    const prepared = resample(output, sourceSampleRate, TARGET_SAMPLE_RATE)
    const durationMs = Math.round((prepared.length * 1_000) / TARGET_SAMPLE_RATE)
    if (durationMs < MIN_AUDIO_DURATION_MS) {
      return Promise.resolve<FinalizeResult>({ accepted: false, reason: 'empty-audio' })
    }

    const task = publishChain.then(async () => {
      if (disposed || activeGeneration !== generation || status.value === 'idle') {
        return { accepted: false, reason: 'stopped' } as FinalizeResult
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
        return { accepted: false, reason: error.value } as FinalizeResult
      }
      status.value = 'ready'
      return { accepted: true, durationMs } as FinalizeResult
    })
    publishChain = task.catch(() => ({ accepted: false, reason: 'delivery-failed' }))
    return task
  }

  function queueReadyWindows() {
    if (sampleRate <= 0) return
    const segmentFrames = Math.max(1, Math.round(sampleRate * segmentSeconds))
    const activeGeneration = generation
    while (bufferedFrames.value >= segmentFrames) {
      const segment = consumeFrames(segmentFrames)
      void enqueueSegment(segment.output, segment.sourceSampleRate, activeGeneration)
    }
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
    if (sampleRate !== incomingSampleRate) {
      if (bufferedFrames.value > 0) resetBuffer(incomingSampleRate)
      else sampleRate = incomingSampleRate
    }
    const copy = samples.slice()
    chunks.push(copy)
    bufferedFrames.value += copy.length
    queueReadyWindows()
  }

  async function finalizeSegment(): Promise<FinalizeResult> {
    if (status.value === 'idle' || disposed) {
      return { accepted: false, reason: 'stopped' }
    }
    let residual: Promise<FinalizeResult> | null = null
    if (bufferedFrames.value > 0) {
      const segment = consumeFrames(bufferedFrames.value)
      residual = enqueueSegment(segment.output, segment.sourceSampleRate, generation)
    }
    if (residual) return residual
    return publishChain
  }

  async function stop(options: { flush?: boolean } = {}) {
    if (status.value === 'idle') return
    if (options.flush) await finalizeSegment()
    generation += 1
    resetBuffer()
    error.value = null
    status.value = 'idle'
  }

  function dispose() {
    if (disposed) return
    void stop()
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
