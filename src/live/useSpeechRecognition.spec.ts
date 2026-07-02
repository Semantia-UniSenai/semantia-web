import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import {
  useSpeechRecognition,
  type UseSpeechRecognitionOptions,
} from './useSpeechRecognition'

interface FakeResultEvent {
  resultIndex: number
  results: Array<{ isFinal: boolean; 0: { transcript: string }; length: number }>
}

class FakeRecognition {
  static instances: FakeRecognition[] = []

  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: FakeResultEvent) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()

  constructor() {
    FakeRecognition.instances.push(this)
  }
}

const g = globalThis as { SpeechRecognition?: unknown }

function resultEvent(
  items: Array<{ text: string; final?: boolean }>,
  resultIndex = 0,
): FakeResultEvent {
  return {
    resultIndex,
    results: items.map((i) => ({
      isFinal: !!i.final,
      0: { transcript: i.text },
      length: 1,
    })),
  }
}

/** Monta o composable dentro de um componente (onBeforeUnmount precisa de setup). */
function mountSpeech(overrides: Partial<UseSpeechRecognitionOptions> = {}) {
  const onPartial = vi.fn()
  const onFinal = vi.fn()
  let api!: ReturnType<typeof useSpeechRecognition>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useSpeechRecognition({ onPartial, onFinal, ...overrides })
        return () => null
      },
    }),
  )
  return { api, wrapper, onPartial, onFinal }
}

function lastRec(): FakeRecognition {
  const rec = FakeRecognition.instances.at(-1)
  if (!rec) throw new Error('nenhuma instância de SpeechRecognition criada')
  return rec
}

beforeEach(() => {
  FakeRecognition.instances = []
  g.SpeechRecognition = FakeRecognition
})

afterEach(() => {
  delete g.SpeechRecognition
})

describe('useSpeechRecognition', () => {
  it('supported=false sem construtor no ambiente; start vira no-op', () => {
    delete g.SpeechRecognition
    const { api } = mountSpeech()

    expect(api.supported).toBe(false)
    api.start()
    expect(api.listening.value).toBe(false)
    expect(FakeRecognition.instances).toHaveLength(0)
  })

  it('start configura pt-BR/continuous/interimResults, chama rec.start e liga listening', () => {
    const { api } = mountSpeech()
    expect(api.supported).toBe(true)

    api.start()
    const rec = lastRec()

    expect(rec.lang).toBe('pt-BR')
    expect(rec.continuous).toBe(true)
    expect(rec.interimResults).toBe(true)
    expect(rec.start).toHaveBeenCalledTimes(1)
    expect(api.listening.value).toBe(true)
    expect(api.error.value).toBeNull()
  })

  it('respeita lang customizada', () => {
    const { api } = mountSpeech({ lang: 'en-US' })
    api.start()
    expect(lastRec().lang).toBe('en-US')
  })

  it('resultado parcial dispara onPartial com o texto', () => {
    const { api, onPartial, onFinal } = mountSpeech()
    api.start()

    lastRec().onresult?.(resultEvent([{ text: 'bom di' }]))

    expect(onPartial).toHaveBeenCalledWith('bom di')
    expect(onFinal).not.toHaveBeenCalled()
  })

  it('resultado final dispara onFinal com trim e ignora final vazio', () => {
    const { api, onPartial, onFinal } = mountSpeech()
    api.start()

    lastRec().onresult?.(resultEvent([{ text: '  bom dia turma  ', final: true }]))
    expect(onFinal).toHaveBeenCalledWith('bom dia turma')

    onFinal.mockClear()
    lastRec().onresult?.(resultEvent([{ text: '   ', final: true }]))
    expect(onFinal).not.toHaveBeenCalled()
    expect(onPartial).not.toHaveBeenCalled()
  })

  it('mistura de finais e parciais no mesmo evento despacha os dois callbacks', () => {
    const { api, onPartial, onFinal } = mountSpeech()
    api.start()

    lastRec().onresult?.(
      resultEvent([
        { text: 'primeira frase.', final: true },
        { text: 'segunda em ', final: false },
        { text: 'formação', final: false },
      ]),
    )

    expect(onFinal).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenCalledWith('primeira frase.')
    expect(onPartial).toHaveBeenCalledTimes(1)
    expect(onPartial).toHaveBeenCalledWith('segunda em formação')
  })

  it('respeita resultIndex (não reprocessa resultados antigos)', () => {
    const { api, onFinal } = mountSpeech()
    api.start()

    lastRec().onresult?.(
      resultEvent(
        [
          { text: 'já processado', final: true },
          { text: 'novo trecho', final: true },
        ],
        1,
      ),
    )

    expect(onFinal).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenCalledWith('novo trecho')
  })

  it('auto-restart: onend com listening=true religa o reconhecimento', () => {
    const { api } = mountSpeech()
    api.start()
    const rec = lastRec()
    expect(rec.start).toHaveBeenCalledTimes(1)

    rec.onend?.()

    expect(rec.start).toHaveBeenCalledTimes(2)
    expect(api.listening.value).toBe(true)
  })

  it('stop desliga listening e onend antigo NÃO religa', () => {
    const { api } = mountSpeech()
    api.start()
    const rec = lastRec()
    const oldOnend = rec.onend

    api.stop()

    expect(api.listening.value).toBe(false)
    expect(rec.stop).toHaveBeenCalledTimes(1)
    expect(rec.onend).toBeNull()

    // Mesmo que o browser dispare o end pendente, não pode religar.
    oldOnend?.()
    expect(rec.start).toHaveBeenCalledTimes(1)
    expect(api.listening.value).toBe(false)
  })

  it("erro fatal 'not-allowed' seta error e para de escutar", () => {
    const { api } = mountSpeech()
    api.start()
    const rec = lastRec()

    rec.onerror?.({ error: 'not-allowed' })

    expect(api.error.value).toBe('not-allowed')
    expect(api.listening.value).toBe(false)
    expect(rec.stop).toHaveBeenCalled()
  })

  it("erro transitório 'no-speech' não seta error nem desliga", () => {
    const { api } = mountSpeech()
    api.start()

    lastRec().onerror?.({ error: 'no-speech' })

    expect(api.error.value).toBeNull()
    expect(api.listening.value).toBe(true)
  })

  it('unmount do componente para o reconhecimento', () => {
    const { api, wrapper } = mountSpeech()
    api.start()
    const rec = lastRec()

    wrapper.unmount()

    expect(api.listening.value).toBe(false)
    expect(rec.stop).toHaveBeenCalled()
  })
})
