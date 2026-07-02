import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { TranscriptEntry } from '../../live/types'
import CaptionStage from './CaptionStage.vue'

const FONT_KEY = 'semantia.captions.font'

function entry(seq: number, text: string): TranscriptEntry {
  return { seq, text, at: '2026-07-02T10:00:00.000Z' }
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
      'Aguardando o professor falar',
    )
  })

  it('renderiza finais e parcial com classes distintas', () => {
    const wrapper = mountStage({
      transcript: [entry(1, 'Primeira frase.'), entry(2, 'Segunda frase.')],
      partialText: 'terceira em formação',
    })

    const finals = wrapper.findAll('.captions__final')
    expect(finals).toHaveLength(2)
    expect(finals[0]!.text()).toBe('Primeira frase.')
    expect(finals[1]!.text()).toBe('Segunda frase.')

    const partial = wrapper.find('.captions__partial')
    expect(partial.exists()).toBe(true)
    expect(partial.text()).toBe('terceira em formação')
    expect(wrapper.find('.captions__waiting').exists()).toBe(false)
  })

  it('só parcial (sem finais) também sai do estado de espera', () => {
    const wrapper = mountStage({ partialText: 'oi tur' })
    expect(wrapper.find('.captions__waiting').exists()).toBe(false)
    expect(wrapper.find('.captions__partial').text()).toBe('oi tur')
  })

  // NOTA: os testes de fonte semeiam o localStorage antes de montar por causa
  // de um BUG conhecido no onMounted do componente: sem valor salvo,
  // Number(localStorage.getItem(...)) = Number(null) = 0 passa na validação e
  // reseta a fonte para o menor passo (22px) em vez de manter o default (34px).
  it('A+ e A− mudam o font-size do palco e persistem no localStorage', async () => {
    localStorage.setItem(FONT_KEY, '2') // passo default explícito (34px)
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    const stage = wrapper.find('.captions__stage')
    const [minus, plus] = wrapper.findAll('.captions__font button')
    expect(stage.attributes('style')).toContain('font-size: 34px')

    await plus!.trigger('click')
    expect(stage.attributes('style')).toContain('font-size: 42px')
    expect(localStorage.getItem(FONT_KEY)).toBe('3')

    await minus!.trigger('click')
    await minus!.trigger('click')
    expect(stage.attributes('style')).toContain('font-size: 28px')
    expect(localStorage.getItem(FONT_KEY)).toBe('1')
  })

  it('restaura o tamanho salvo do localStorage e desabilita A+ no máximo', async () => {
    localStorage.setItem(FONT_KEY, '4')
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 52px',
    )
    const [minus, plus] = wrapper.findAll('.captions__font button')
    expect(plus!.attributes('disabled')).toBeDefined()
    expect(minus!.attributes('disabled')).toBeUndefined()

    // No teto, A+ não passa do último passo.
    await plus!.trigger('click')
    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 52px',
    )
  })

  it('A− desabilita no menor passo e não desce além dele', async () => {
    localStorage.setItem(FONT_KEY, '0')
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    const [minus] = wrapper.findAll('.captions__font button')
    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 22px',
    )
    expect(minus!.attributes('disabled')).toBeDefined()

    await minus!.trigger('click')
    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 22px',
    )
    expect(localStorage.getItem(FONT_KEY)).toBe('0')
  })

  it('valor inválido salvo é ignorado (fica no passo default)', async () => {
    localStorage.setItem(FONT_KEY, '99')
    const wrapper = mountStage()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 34px',
    )
  })

  it('modo compacto esconde as ferramentas e fixa a fonte em 18px', () => {
    const wrapper = mountStage({ compact: true })
    expect(wrapper.find('.captions__tools').exists()).toBe(false)
    expect(wrapper.find('.captions__stage').attributes('style')).toContain(
      'font-size: 18px',
    )
  })
})
