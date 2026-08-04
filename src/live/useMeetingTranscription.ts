import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useSpeechRecognition } from './useSpeechRecognition'
import { useVoskTranscription } from './useVoskTranscription'
import { useLocalWhisperFinalizer } from './useLocalWhisperFinalizer'

export interface UseMeetingTranscriptionOptions {
  lang?: string
  modelUrl?: string
  deviceId?: Readonly<Ref<string>>
  onPartial: (text: string) => void
  onFinal: (text: string) => void
}

type TranscriptionEngine = 'browser' | 'local' | null
const LOCAL_FALLBACK_ERRORS = new Set([
  'network',
  'service-not-allowed',
  'start-failed',
  'local-unavailable',
  'no-speech-limit',
])
const PARTIAL_THROTTLE_MS = 250
const FINAL_DEDUPLICATION_MS = 2_000

function normalizeTranscriptText(text: string) {
  return text.trim().replace(/\s+/g, ' ')
}

export function useMeetingTranscription(options: UseMeetingTranscriptionOptions) {
  let partialTimer: ReturnType<typeof setTimeout> | null = null
  let pendingPartial = ''
  let lastPartial = ''
  let lastFinal = ''
  let lastFinalAt: number | null = null
  let lifecycleGeneration = 0
  let captureActive = false

  function schedulePartialWindow() {
    partialTimer = setTimeout(() => {
      partialTimer = null
      if (!pendingPartial || pendingPartial === lastPartial) {
        pendingPartial = ''
        return
      }
      const text = pendingPartial
      pendingPartial = ''
      lastPartial = text
      options.onPartial(text)
      schedulePartialWindow()
    }, PARTIAL_THROTTLE_MS)
  }

  function handlePartial(rawText: string) {
    if (!captureActive) return
    const text = normalizeTranscriptText(rawText)
    if (!text || text === lastPartial || text === pendingPartial) return
    if (partialTimer) {
      pendingPartial = text
      return
    }
    lastPartial = text
    options.onPartial(text)
    schedulePartialWindow()
  }

  function resetPartialEmission() {
    if (partialTimer) clearTimeout(partialTimer)
    partialTimer = null
    pendingPartial = ''
    lastPartial = ''
  }

  function handleFinal(rawText: string) {
    if (!captureActive) return
    const text = normalizeTranscriptText(rawText)
    if (!text) return
    const now = Date.now()
    if (
      text === lastFinal &&
      lastFinalAt !== null &&
      now - lastFinalAt <= FINAL_DEDUPLICATION_MS
    ) {
      return
    }
    resetPartialEmission()
    lastFinal = text
    lastFinalAt = now
    options.onFinal(text)
  }

  function resetEmission() {
    resetPartialEmission()
    lastFinal = ''
    lastFinalAt = null
  }

  const browser = useSpeechRecognition({
    lang: options.lang,
    localOnly: true,
    onPartial: handlePartial,
    onFinal: handleFinal,
  })
  const quality = useLocalWhisperFinalizer()

  async function handleLocalFinal(rawText: string) {
    if (!captureActive) return
    const generation = lifecycleGeneration
    const result = await quality.finalizeSegment(rawText)
    if (!captureActive || generation !== lifecycleGeneration || !result.text) return
    handleFinal(result.text)
  }

  const local = useVoskTranscription({
    modelUrl: options.modelUrl,
    onPartial: handlePartial,
    onFinal: (text) => void handleLocalFinal(text),
    onAudioChunk: quality.addAudioChunk,
  })
  const engine = ref<TranscriptionEngine>(null)
  let activeDeviceId = 'default'
  const supported = browser.supported || local.supported
  const listening = computed(
    () => browser.listening.value || local.listening.value,
  )
  const loading = computed(
    () => engine.value === 'local' && local.loading.value,
  )
  const inputState = computed(() => {
    if (engine.value === 'local') return local.inputState.value
    return browser.listening.value ? 'receiving' : 'idle'
  })
  const audioLevel = computed(() =>
    engine.value === 'local' ? local.audioLevel.value : 0,
  )
  const transport = computed(() =>
    engine.value === 'local' ? local.transport.value : null,
  )
  const hasHypothesis = computed(() =>
    engine.value === 'local' ? local.hasHypothesis.value : false,
  )
  const error = computed(() => {
    if (engine.value === 'browser') return browser.error.value
    if (engine.value === 'local') return local.error.value
    return null
  })

  async function startLocal() {
    engine.value = 'local'
    quality.start()
    await local.start(activeDeviceId)
  }

  async function start(deviceId = options.deviceId?.value ?? 'default') {
    const generation = ++lifecycleGeneration
    captureActive = true
    activeDeviceId = deviceId || 'default'
    const hasSpecificInput = activeDeviceId !== 'default'
    if (browser.supported && !hasSpecificInput) {
      const browserStarted = await browser.start()
      if (!captureActive || generation !== lifecycleGeneration) return
      if (browserStarted) {
        engine.value = 'browser'
        return
      }
    }
    if (!captureActive || generation !== lifecycleGeneration) return
    if (local.supported) {
      await startLocal()
    }
  }

  function stop() {
    captureActive = false
    lifecycleGeneration += 1
    resetEmission()
    browser.stop()
    local.stop()
    quality.stop()
    engine.value = null
  }

  async function changeDevice(deviceId: string) {
    const wasActive = listening.value || loading.value
    activeDeviceId = deviceId || 'default'
    if (!wasActive) return
    stop()
    await start(activeDeviceId)
  }

  const stopErrorWatch = watch(browser.error, async (value) => {
    if (
      engine.value !== 'browser' ||
      !value ||
      !LOCAL_FALLBACK_ERRORS.has(value) ||
      !local.supported
    ) {
      return
    }
    browser.stop()
    lifecycleGeneration += 1
    await startLocal()
  })
  const stopDeviceWatch = options.deviceId
    ? watch(options.deviceId, async (deviceId) => {
        await changeDevice(deviceId)
      })
    : () => undefined

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      stopErrorWatch()
      stopDeviceWatch()
      stop()
    })
  }

  return {
    supported,
    listening,
    loading,
    error,
    inputState,
    audioLevel,
    transport,
    hasHypothesis,
    qualityStatus: quality.status,
    qualityProgress: quality.progress,
    qualityError: quality.error,
    qualityInferenceMs: quality.lastInferenceMs,
    engine: computed(() => engine.value),
    start,
    stop,
    changeDevice,
  }
}
