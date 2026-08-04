import { computed, getCurrentInstance, onBeforeUnmount, readonly, ref } from 'vue'

export type WhisperFinalizerStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'processing'
  | 'error'

export type FinalizedTranscript =
  | { text: string; engine: 'whisper'; inferenceMs: number }
  | { text: string; engine: 'vosk'; reason: string }
  | { text: ''; engine: 'cancelled'; reason: 'stopped' }

interface WhisperWorkerMessage {
  type: 'progress' | 'ready' | 'complete' | 'error'
  requestId?: string
  progress?: number
  text?: string
  inferenceMs?: number
  error?: string
}

interface PendingRequest {
  fallbackText: string
  resolve: (result: FinalizedTranscript) => void
  timeout: ReturnType<typeof setTimeout>
}

export interface UseLocalWhisperFinalizerOptions {
  workerFactory?: () => Worker
  timeoutMs?: number
  maxBufferedSeconds?: number
}

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_BUFFERED_SECONDS = 35

function defaultWorkerFactory() {
  return new Worker(new URL('./localWhisper.worker.ts', import.meta.url), {
    type: 'module',
    name: 'semantia-local-whisper',
  })
}

export function useLocalWhisperFinalizer(
  options: UseLocalWhisperFinalizerOptions = {},
) {
  const status = ref<WhisperFinalizerStatus>('idle')
  const progress = ref(0)
  const error = ref<string | null>(null)
  const lastInferenceMs = ref<number | null>(null)
  const bufferedFrames = ref(0)
  const bufferedSeconds = computed(() =>
    sampleRate > 0 ? bufferedFrames.value / sampleRate : 0,
  )

  let worker: Worker | null = null
  let sampleRate = 0
  let chunks: Float32Array[] = []
  let requestSequence = 0
  let disposed = false
  const pending = new Map<string, PendingRequest>()

  function start() {
    if (disposed || worker) return
    error.value = null
    progress.value = 0
    status.value = 'loading'
    worker = (options.workerFactory ?? defaultWorkerFactory)()
    worker.onmessage = (event: MessageEvent<WhisperWorkerMessage>) => {
      handleWorkerMessage(event.data)
    }
    worker.onerror = () => failWorker('model-load-failed')
    worker.postMessage({ type: 'load' })
  }

  function handleWorkerMessage(message: WhisperWorkerMessage) {
    if (message.type === 'progress') {
      progress.value = Math.max(0, Math.min(99, Math.round(message.progress ?? 0)))
      return
    }
    if (message.type === 'ready') {
      progress.value = 100
      status.value = pending.size > 0 ? 'processing' : 'ready'
      error.value = null
      return
    }
    if (!message.requestId) {
      if (message.type === 'error') failWorker(message.error || 'model-load-failed')
      return
    }
    const request = pending.get(message.requestId)
    if (!request) return
    clearTimeout(request.timeout)
    pending.delete(message.requestId)

    if (message.type === 'complete') {
      const text = message.text?.trim() ?? ''
      const inferenceMs = Math.max(0, message.inferenceMs ?? 0)
      lastInferenceMs.value = inferenceMs
      request.resolve(
        text
          ? { text, engine: 'whisper', inferenceMs }
          : { text: request.fallbackText, engine: 'vosk', reason: 'empty-result' },
      )
    } else {
      const reason = message.error || 'inference-failed'
      request.resolve({
        text: request.fallbackText,
        engine: 'vosk',
        reason,
      })
      failWorker(reason)
      return
    }
    status.value = pending.size > 0 ? 'processing' : 'ready'
  }

  function addAudioChunk(samples: Float32Array, incomingSampleRate: number) {
    if (disposed || samples.length === 0 || !Number.isFinite(incomingSampleRate)) return
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

  function finalizeSegment(fallbackText: string): Promise<FinalizedTranscript> {
    const audio = consumeBuffer()
    const cleanFallback = fallbackText.trim()
    if (!worker || status.value === 'idle' || status.value === 'loading' || status.value === 'error') {
      return Promise.resolve({
        text: cleanFallback,
        engine: 'vosk',
        reason: status.value === 'loading' ? 'model-loading' : 'quality-unavailable',
      })
    }
    if (audio.length === 0 || sampleRate <= 0) {
      return Promise.resolve({
        text: cleanFallback,
        engine: 'vosk',
        reason: 'empty-audio',
      })
    }

    status.value = 'processing'
    const requestId = `whisper-${++requestSequence}`
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!pending.has(requestId)) return
        failWorker('inference-timeout')
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      pending.set(requestId, { fallbackText: cleanFallback, resolve, timeout })
      worker?.postMessage(
        { type: 'transcribe', requestId, samples: audio, sampleRate },
        [audio.buffer],
      )
    })
  }

  function consumeBuffer() {
    const total = bufferedFrames.value
    const output = new Float32Array(total)
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.length
    }
    resetBuffer(sampleRate)
    return output
  }

  function resetBuffer(nextSampleRate = 0) {
    chunks = []
    bufferedFrames.value = 0
    sampleRate = nextSampleRate
  }

  function resolvePendingAsCancelled() {
    for (const request of pending.values()) {
      clearTimeout(request.timeout)
      request.resolve({ text: '', engine: 'cancelled', reason: 'stopped' })
    }
    pending.clear()
  }

  function resolvePendingWithFallback(reason: string) {
    for (const request of pending.values()) {
      clearTimeout(request.timeout)
      request.resolve({
        text: request.fallbackText,
        engine: 'vosk',
        reason,
      })
    }
    pending.clear()
  }

  function failWorker(reason: string) {
    error.value = reason
    status.value = 'error'
    resolvePendingWithFallback(reason)
    worker?.terminate()
    worker = null
  }

  function stop() {
    resetBuffer()
    resolvePendingAsCancelled()
    worker?.terminate()
    worker = null
    status.value = 'idle'
    progress.value = 0
  }

  function dispose() {
    if (disposed) return
    disposed = true
    resetBuffer()
    resolvePendingAsCancelled()
    worker?.terminate()
    worker = null
    status.value = 'idle'
  }

  if (getCurrentInstance()) onBeforeUnmount(dispose)

  return {
    status: readonly(status),
    progress: readonly(progress),
    error: readonly(error),
    lastInferenceMs: readonly(lastInferenceMs),
    bufferedSeconds,
    start,
    stop,
    addAudioChunk,
    finalizeSegment,
  }
}
