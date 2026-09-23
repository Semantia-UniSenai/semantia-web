import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { TranscriptEntry } from '../../live/types'
import CaptionStage from './CaptionStage.vue'

const FONT_KEY = 'semantia.captions.font'
const MODE_KEY = 'semantia.captions.mode'

function entry(seq: number, text: string): TranscriptEntry {
  return {
    seq,
    startMs: 0,
    endMs: null,
    text,
    cleaningStrategyVersion: 'pt-br-conservative-v1',
    confidence: null,
    createdAt: '2026-07-02T10:00:00.000Z',
  }
}

function adaptedEntry(
  seq: number,
  literalText: string,
  adaptedText: string,
  status: 'succeeded' | 'fallback' | 'bypassed' = 'succeeded',
): TranscriptEntry {
  return {
    ...entry(seq, literalText),
    adaptation: {
      text: adaptedText,
      status,
      failureCode: status === 'succeeded' ? null : 'PROVIDER_ERROR',
      automatic: true,
      contextVersion: 2,
      promptVersion: 'pt-br-accessible-v2',
      provider: 'fake',
      model: 'deterministic-v1',
      at: '2026-09-16T21:00:00.000Z',
    },
  }
}

function mountStage(props: Partial<InstanceType<typeof CaptionStage>['$props']> = {}) {
  return mount(CaptionStage, { props: { transcript: [], ...props } })
}

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
})

describe('CaptionStage', () => {
  it('não promete fala ao vivo enquanto a transcrição está pausada', () => {
    const waiting = mountStage({ captionState: 'paused' }).get('.captions__waiting').text()

    expect(waiting).toContain('Ative a transcrição')
    expect(waiting).not.toContain('Aguardando o comunicador falar')
  })

  it('sem final canônico mostra o estado de espera', () => {
    expect(mountStage().find('.captions__waiting').text()).toContain(
      'Aguardando o comunicador falar',
    )
  })

  it('renderiza somente finais canônicos, sem linha parcial', () => {
    const wrapper = mountStage({
      transcript: [entry(1, 'Primeira frase.'), entry(2, 'Segunda frase.')],
    })
    const lines = wrapper.findAll('.captions__line')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text()).toBe('Primeira frase.')
    expect(lines[1]!.text()).toBe('Segunda frase.')
    expect(wrapper.find('.captions__line--partial').exists()).toBe(false)
    expect(lines[1]!.classes()).toContain('captions__line--current')
  })

  it('mantém o literal como padrão mesmo quando há adaptação pronta', () => {
    const wrapper = mountStage({
      transcript: [adaptedEntry(1, 'Texto literal.', 'Texto adaptado.')],
    })

    expect(wrapper.get('.captions__line').text()).toBe('Texto literal.')
    const toggle = wrapper.get('.captions__mode-toggle')
    expect(toggle.attributes('data-caption-mode')).toBe('literal')
    expect(toggle.attributes('aria-pressed')).toBe('false')
  })

  it('permite escolher adaptado e persiste apenas essa preferência local', async () => {
    const wrapper = mountStage({
      transcript: [adaptedEntry(1, 'Texto literal.', 'Texto adaptado.')],
    })

    const toggle = wrapper.get('.captions__mode-toggle')
    await toggle.trigger('click')

    expect(wrapper.get('.captions__line').text()).toBe('Texto adaptado.')
    expect(wrapper.get('[data-testid="caption-announcer"]').text()).toBe('Texto adaptado.')
    expect(toggle.attributes('data-caption-mode')).toBe('adapted')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem(MODE_KEY)).toBe('adapted')
  })

  it.each(['fallback', 'bypassed'] as const)(
    'usa literal no modo adaptado quando o resultado é %s',
    async (status) => {
      const wrapper = mountStage({
        transcript: [adaptedEntry(1, 'Texto literal.', 'Não deve aparecer.', status)],
      })

      await wrapper.get('.captions__mode-toggle').trigger('click')

      expect(wrapper.get('.captions__line').text()).toBe('Texto literal.')
    },
  )

  it('restaura uma preferência adaptada válida sem alterar o transcript', () => {
    localStorage.setItem(MODE_KEY, 'adapted')

    const wrapper = mountStage({
      transcript: [adaptedEntry(1, 'Texto literal.', 'Texto adaptado.')],
    })

    expect(wrapper.get('.captions__line').text()).toBe('Texto adaptado.')
    expect(wrapper.get('.captions__mode-toggle').attributes('data-caption-mode')).toBe('adapted')
    expect(wrapper.get('.captions__mode-toggle').attributes('aria-pressed')).toBe('true')
  })

  it('quebra um final longo em linhas curtas balanceadas', () => {
    const wrapper = mountStage({
      transcript: [entry(1, 'um dois três quatro cinco seis sete oito nove')],
    })
    expect(wrapper.findAll('.captions__line').map((line) => line.text())).toEqual([
      'um dois três quatro cinco',
      'seis sete oito nove',
    ])
  })

  it('informa que apenas o servidor produz texto e não menciona prévia/local', () => {
    const wrapper = mountStage({ captionState: 'listening' })
    const status = wrapper.get('[data-testid="caption-status"]').text()
    expect(status).toContain('servidor')
    expect(status).not.toMatch(/prévia|local|navegador|Vosk|hipótese/i)
  })

  it('distingue pausa, reconexão e encerramento', async () => {
    const wrapper = mountStage({ captionState: 'paused' })
    expect(wrapper.get('[data-testid="caption-status"]').text()).toContain('pausada')
    await wrapper.setProps({ captionState: 'reconnecting' })
    expect(wrapper.get('[data-testid="caption-status"]').text()).toContain('Reconectando')
    await wrapper.setProps({ captionState: 'ended' })
    expect(wrapper.get('[data-testid="caption-status"]').text()).toContain('Somente leitura')
  })

  it('A+ e A− ajustam e persistem o tamanho', async () => {
    const wrapper = mountStage()
    const stage = wrapper.find('.captions__stage')
    const [minus, plus] = wrapper.findAll('.captions__font button')
    expect(stage.attributes('style')).toContain('font-size: 36px')
    await plus!.trigger('click')
    expect(stage.attributes('style')).toContain('font-size: 48px')
    expect(localStorage.getItem(FONT_KEY)).toBe('2')
    await minus!.trigger('click')
    expect(stage.attributes('style')).toContain('font-size: 36px')
  })

  it('modo compacto esconde ferramentas e fixa 18px', () => {
    const wrapper = mountStage({ compact: true })
    expect(wrapper.find('.captions__tools').exists()).toBe(false)
    expect(wrapper.find('.captions__stage').attributes('style')).toContain('font-size: 18px')
  })

  it('anuncia somente o final mais recente', () => {
    const wrapper = mountStage({
      transcript: [entry(1, 'Primeira frase.'), entry(2, 'Segunda frase.')],
    })
    expect(wrapper.get('[data-testid="caption-announcer"]').text()).toBe('Segunda frase.')
  })
})
