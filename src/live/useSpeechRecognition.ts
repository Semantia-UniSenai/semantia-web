import { onBeforeUnmount, readonly, ref, shallowRef } from 'vue'

/**
 * Web Speech API (reconhecimento de fala nativo do browser, pt-BR).
 *
 * É uma otimização progressiva quando o browser comprova reconhecimento
 * on-device em pt-BR. Caso contrário, o orquestrador usa Vosk local; em ambos
 * os caminhos, pela rede trafega somente texto.
 *
 * Comportamentos cobertos:
 * - `interimResults`: parciais viram `onPartial`, resultados consolidados
 *   viram `onFinal` (frase a frase).
 * - O Chrome encerra o reconhecimento sozinho após silêncio → enquanto
 *   `listening` for desejado, religa no evento `end` (auto-restart).
 * - Erros fatais (`not-allowed`, `audio-capture`) desligam e expõem `error`;
 *   `no-speech`/`aborted` são transitórios e só deixam o auto-restart agir.
 * - `network` é ambíguo: pode ser queda momentânea (transitório) ou um browser
 *   sem acesso ao serviço de voz — no Brave a API existe mas toda tentativa
 *   morre com `network`, o que viraria loop infinito mudo. Erros `network`
 *   consecutivos sem nenhum resultado no meio viram fatais.
 */

// Tipos mínimos da Web Speech API (não existem no lib.dom do TS estável).
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}
interface SpeechRecognitionErrorEventLike {
  error: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  processLocally?: boolean
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type OnDeviceAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
interface OnDeviceSpeechOptions {
  langs: string[]
  processLocally: true
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike
  available?: (options: OnDeviceSpeechOptions) => Promise<OnDeviceAvailability>
  install?: (options: OnDeviceSpeechOptions) => Promise<boolean>
}

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = globalThis as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const FATAL_SPEECH_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
])

export const NETWORK_ERROR_LIMIT = 2
export const EMPTY_RESTART_LIMIT = 5
const RESTART_BASE_DELAY_MS = 250
const RESTART_MAX_DELAY_MS = 2_000

export interface UseSpeechRecognitionOptions {
  lang?: string
  localOnly?: boolean
  onPartial: (text: string) => void
  onFinal: (text: string) => void
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions) {
  const Ctor = getSpeechRecognitionCtor()

  const supported = Ctor !== null
  const listening = ref(false)
  const error = ref<string | null>(null)
  const recognition = shallowRef<SpeechRecognitionLike | null>(null)
  let consecutiveNetworkErrors = 0
  let consecutiveEmptyRestarts = 0
  let hadResultSinceStart = false
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  let startGeneration = 0

  async function hasOnDeviceLanguage(lang: string) {
    if (!Ctor?.available) return false
    const request: OnDeviceSpeechOptions = {
      langs: [lang],
      processLocally: true,
    }
    try {
      let availability = await Ctor.available(request)
      if (availability === 'downloadable' && Ctor.install) {
        if (!(await Ctor.install(request))) return false
        availability = await Ctor.available(request)
      }
      return availability === 'available'
    } catch {
      return false
    }
  }

  function handleResult(event: SpeechRecognitionEventLike) {
    consecutiveNetworkErrors = 0
    consecutiveEmptyRestarts = 0
    hadResultSinceStart = true
    // Reconstrói a frase corrente a partir dos resultados ainda não finais e
    // despacha cada resultado final exatamente uma vez.
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript = result[0]?.transcript ?? ''
      if (result.isFinal) {
        const finalText = transcript.trim()
        if (finalText) options.onFinal(finalText)
      } else {
        interim += transcript
      }
    }
    const partial = interim.trim()
    if (partial) options.onPartial(partial)
  }

  async function start(): Promise<boolean> {
    if (!Ctor) return false
    if (listening.value) return true
    const generation = ++startGeneration
    error.value = null
    consecutiveNetworkErrors = 0
    consecutiveEmptyRestarts = 0
    hadResultSinceStart = false
    const lang = options.lang ?? 'pt-BR'
    if (options.localOnly && !(await hasOnDeviceLanguage(lang))) {
      if (generation === startGeneration) error.value = 'local-unavailable'
      return false
    }
    if (generation !== startGeneration) return false

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    if (options.localOnly) rec.processLocally = true
    rec.onresult = handleResult
    rec.onerror = (e) => {
      if (e.error === 'network') {
        consecutiveNetworkErrors += 1
        if (consecutiveNetworkErrors >= NETWORK_ERROR_LIMIT) {
          error.value = 'network'
          stop()
        }
        return
      }
      if (FATAL_SPEECH_ERRORS.has(e.error)) {
        error.value = e.error
        stop()
      }
      // Erros transitórios (no-speech, aborted) caem no onend, que religa sozinho.
    }
    rec.onend = () => {
      if (!listening.value || recognition.value !== rec || restartTimer) return
      if (hadResultSinceStart) consecutiveEmptyRestarts = 0
      else consecutiveEmptyRestarts += 1
      hadResultSinceStart = false
      if (consecutiveEmptyRestarts >= EMPTY_RESTART_LIMIT) {
        error.value = 'no-speech-limit'
        stop()
        return
      }

      const restart = () => {
        restartTimer = null
        if (!listening.value || recognition.value !== rec) return
        try {
          rec.start()
        } catch {
          error.value = 'start-failed'
          stop()
        }
      }
      if (consecutiveEmptyRestarts === 1) {
        restart()
        return
      }
      const delay = Math.min(
        RESTART_BASE_DELAY_MS * 2 ** (consecutiveEmptyRestarts - 2),
        RESTART_MAX_DELAY_MS,
      )
      restartTimer = setTimeout(restart, delay)
    }

    recognition.value = rec
    listening.value = true
    try {
      rec.start()
    } catch {
      listening.value = false
      recognition.value = null
      error.value = 'start-failed'
    }
    return listening.value
  }

  function stop() {
    startGeneration += 1
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = null
    listening.value = false
    const rec = recognition.value
    recognition.value = null
    if (rec) {
      rec.onend = null
      try {
        rec.stop()
      } catch {
        // já parado
      }
    }
  }

  onBeforeUnmount(stop)

  return {
    supported,
    listening: readonly(listening),
    error: readonly(error),
    start,
    stop,
  }
}
