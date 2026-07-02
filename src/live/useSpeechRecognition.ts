import { onBeforeUnmount, readonly, ref, shallowRef } from 'vue'

/**
 * Web Speech API (reconhecimento de fala nativo do browser, pt-BR).
 *
 * É o motor de transcrição do MVP: roda no browser do PROFESSOR, colado no
 * microfone, e devolve resultados parciais em centenas de ms — pela rede só
 * trafega texto. Suportado em Chrome/Edge (webkitSpeechRecognition).
 *
 * Comportamentos cobertos:
 * - `interimResults`: parciais viram `onPartial`, resultados consolidados
 *   viram `onFinal` (frase a frase).
 * - O Chrome encerra o reconhecimento sozinho após silêncio → enquanto
 *   `listening` for desejado, religa no evento `end` (auto-restart).
 * - Erros fatais (`not-allowed`, `audio-capture`) desligam e expõem `error`;
 *   `no-speech`/`aborted` são transitórios e só deixam o auto-restart agir.
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
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

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

export interface UseSpeechRecognitionOptions {
  lang?: string
  onPartial: (text: string) => void
  onFinal: (text: string) => void
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions) {
  const Ctor = getSpeechRecognitionCtor()

  const supported = Ctor !== null
  const listening = ref(false)
  const error = ref<string | null>(null)
  const recognition = shallowRef<SpeechRecognitionLike | null>(null)

  function handleResult(event: SpeechRecognitionEventLike) {
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

  function start() {
    if (!Ctor || listening.value) return
    error.value = null

    const rec = new Ctor()
    rec.lang = options.lang ?? 'pt-BR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = handleResult
    rec.onerror = (e) => {
      if (FATAL_SPEECH_ERRORS.has(e.error)) {
        error.value = e.error
        stop()
      }
      // Erros transitórios (no-speech, aborted, network intermitente) caem no
      // onend, que religa sozinho.
    }
    rec.onend = () => {
      // Auto-restart: o browser para sozinho após silêncio prolongado.
      if (listening.value && recognition.value === rec) {
        try {
          rec.start()
        } catch {
          listening.value = false
        }
      }
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
  }

  function stop() {
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
