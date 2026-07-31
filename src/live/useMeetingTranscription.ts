import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'
import { useSpeechRecognition } from './useSpeechRecognition'
import { useVoskTranscription } from './useVoskTranscription'

export interface UseMeetingTranscriptionOptions {
  lang?: string
  modelUrl?: string
  onPartial: (text: string) => void
  onFinal: (text: string) => void
}

type TranscriptionEngine = 'browser' | 'local' | null
const LOCAL_FALLBACK_ERRORS = new Set([
  'network',
  'service-not-allowed',
  'start-failed',
])

export function useMeetingTranscription(options: UseMeetingTranscriptionOptions) {
  const browser = useSpeechRecognition({
    lang: options.lang,
    onPartial: options.onPartial,
    onFinal: options.onFinal,
  })
  const local = useVoskTranscription({
    modelUrl: options.modelUrl,
    onPartial: options.onPartial,
    onFinal: options.onFinal,
  })
  const engine = ref<TranscriptionEngine>(null)
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
  const error = computed(() => {
    if (engine.value === 'browser') return browser.error.value
    if (engine.value === 'local') return local.error.value
    return null
  })

  async function start() {
    if (browser.supported) {
      engine.value = 'browser'
      browser.start()
      return
    }
    if (local.supported) {
      engine.value = 'local'
      await local.start()
    }
  }

  function stop() {
    browser.stop()
    local.stop()
    engine.value = null
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
    engine.value = 'local'
    await local.start()
  })

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      stopErrorWatch()
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
    engine: computed(() => engine.value),
    start,
    stop,
  }
}
