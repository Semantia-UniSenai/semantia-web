import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { TranscriptEntry } from '../../live/types'
import CaptionStage from './CaptionStage.vue'

const FONT_KEY = 'semantia.captions.font'

function entry(seq: number, text: string): TranscriptEntry {
  return {
    seq,
    startMs: 0,
    endMs: null,
    text,
    confidence: null,
    createdAt: '2026-07-02T10:00:00.000Z',
  }
}

function mountStage(props: Partial<InstanceType<typeof CaptionStage>['$props']> = {}) {
  return mount(CaptionStage, {
    props: { transcript: [], partialText: '', ...props },
  })
}

beforeEach(() => {
  localStorage.clear()
  // happy-dom pode não implementar scrollTo em elemento (rolagem presa ao vivo).
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
})

describe('CaptionStage', () => {
  it('sem transcrição nem parcial mostra o estado de espera', () => {
    const wrapper = mountStage()
    expect(wrapper.find('.captions__waiting').text()).toContain(
      'Aguardando o comunicador falar',
    )
  })

  it('renderiza cada frase como linha e a parcial com classe própria', () => {
    const wrapper = mountStage({
      transcript: [entry(1, 'Primeira frase.'), entry(2, 'Segunda frase.')],
      partialText: 'terceira em formação',
    })

    const lines = wrapper.findAll('.captions__line')
    expect(lines).toHaveLength(3)
    expect(lines[0]!.text()).toBe('Primeira frase.')
    expect(lines[1]!.text()).toBe('Segunda frase.')

    const partial = wrapper.find('.captions__line--partial')
    expect(partial.exists()).toBe(true)
    expect(partial.text()).toBe('terceira em formação')
    expect(wrapper.find('.captions__waiting').exists()).toBe(false)
  })

  it('quebra um final longo em linhas curtas balanceadas (karaokê)', () => {
    const wrapper = mountStage({
      transcript: [
        entry(1, 'um dois três quatro cinco seis sete oito nove'),
      ],
    })

    const lines = wrapper.findAll('.captions__line')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text()).toBe('um dois três quatro cinco')
    expect(lines[1]!.text()).toBe('seis sete oito nove')
  })

  it('destaca a última linha como corrente quando não há parcial', () => {
    const wrapper = mountStage({
      transcript: [entry(1, 'Primeira frase.'), entry(2, 'Segunda frase.')],
    })

    const lines = wrapper.findAll('.captions__line')
    expect(lines[0]!.classes()).not.toContain('captions__line--current')
    expect(lines[1]!.classes()).toContain('captions__line--current')
  })

  it('com parcial em formação, nenhuma linha final fica marcada como corrente', () => {
    const wrapper = mountStage({
      transcript: [entry(1, 'Primeira frase.')],
      partialText: 'segunda em formação',
    })

    expect(wrapper.findAll('.captions__line--current')).toHaveLength(0)
  })

  it('só parcial (sem finais) também sai do estado de espera', () => {
    const wrapper = mountStage({ partialText: 'oi tur' })
    expect(wrapper.find('.captions__waiting').exists()).toBe(false)
    expect(wrapper.find('.captions__line--partial').text()).toBe('oi tur')
  })

  it('sem preferência salva mantém o tamanho padrão de 36px', async () => {
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 36px',
    )
  })

  it('A+ e A− mudam o font-size do palco e persistem no localStorage', async () => {
    localStorage.setItem(FONT_KEY, '1')
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    const stage = wrapper.find('.captions__stage')
    const [minus, plus] = wrapper.findAll('.captions__font button')
    expect(stage.attributes('style')).toContain('font-size: 36px')

    await plus!.trigger('click')
    expect(stage.attributes('style')).toContain('font-size: 48px')
    expect(localStorage.getItem(FONT_KEY)).toBe('2')

    await minus!.trigger('click')
    await minus!.trigger('click')
    expect(stage.attributes('style')).toContain('font-size: 28px')
    expect(localStorage.getItem(FONT_KEY)).toBe('0')
  })

  it('restaura o tamanho salvo do localStorage e desabilita A+ no máximo', async () => {
    localStorage.setItem(FONT_KEY, '2')
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 48px',
    )
    const [minus, plus] = wrapper.findAll('.captions__font button')
    expect(plus!.attributes('disabled')).toBeDefined()
    expect(minus!.attributes('disabled')).toBeUndefined()

    // No teto, A+ não passa do último passo.
    await plus!.trigger('click')
    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 48px',
    )
  })

  it('A− desabilita no menor passo e não desce além dele', async () => {
    localStorage.setItem(FONT_KEY, '0')
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    const [minus] = wrapper.findAll('.captions__font button')
    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 28px',
    )
    expect(minus!.attributes('disabled')).toBeDefined()

    await minus!.trigger('click')
    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 28px',
    )
    expect(localStorage.getItem(FONT_KEY)).toBe('0')
  })

  it('valor inválido salvo é ignorado (fica no passo default)', async () => {
    localStorage.setItem(FONT_KEY, '99')
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 36px',
    )
  })

  it('modo compacto esconde as ferramentas e fixa a fonte em 18px', () => {
    const wrapper = mountStage({ compact: true })
    expect(wrapper.find('.captions__tools').exists()).toBe(false)
    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 18px',
    )
  })

  it('distingue transcrição pausada de disponibilidade da legenda', () => {
    const wrapper = mountStage({ captionState: 'paused' })

    expect(wrapper.get('[data-testid="caption-status"]').text()).toContain(
      'Transcrição pausada',
    )
    expect(wrapper.text()).not.toContain('Transcrição ao vivo')
  })

  it('não declara processamento somente local quando o ASR backend está ativo', () => {
    const wrapper = mountStage({ captionState: 'listening', backendAsr: true } as any)
    const status = wrapper.get('[data-testid="caption-status"]').text()

    expect(status).toContain('servidor')
    expect(status).not.toContain('processado somente neste navegador')
  })

  it('anuncia somente a frase final mais recente fora do histórico navegável', () => {
    const wrapper = mountStage({
      transcript: [entry(1, 'Primeira frase.'), entry(2, 'Segunda frase.')],
      partialText: 'terceira em formação',
    })

    const announcer = wrapper.get('[data-testid="caption-announcer"]')
    expect(announcer.attributes('aria-live')).toBe('polite')
    expect(announcer.text()).toBe('Segunda frase.')
    expect(wrapper.get('.captions__stage').attributes('aria-live')).toBeUndefined()
  })
})
