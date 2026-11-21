import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AudienceContextForm from './AudienceContextForm.vue'

describe('AudienceContextForm', () => {
  it('declara contraste claro para o título sobre o modal escuro', () => {
    const wrapper = mount(AudienceContextForm)
    const title = wrapper.get('.context-form__title')

    expect(title.attributes('style')).toContain('color: #f4f7ff')
  })
})

describe('AudienceContextForm acessível (WCAG 2.4.3, 2.4.11, 4.1.2)', () => {
  const mountForm = () => mount(AudienceContextForm, { attachTo: document.body })

  it('é um diálogo modal nomeado', () => {
    const wrapper = mountForm()
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-label')).toBe('Configuração da plateia')
    wrapper.unmount()
  })

  it('leva o foco para o primeiro campo ao abrir', async () => {
    const wrapper = mountForm()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(document.activeElement?.id).toBe('ctx-meeting-type')
    wrapper.unmount()
  })

  it('mantém o Tab dentro do diálogo', async () => {
    const wrapper = mountForm()
    const dialog = wrapper.get('[role="dialog"]')
    const buttons = dialog.findAll('button')
    const last = buttons[buttons.length - 1]!.element as HTMLElement
    last.focus()
    await dialog.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement?.id).toBe('ctx-meeting-type')
    ;(wrapper.get('#ctx-meeting-type').element as HTMLElement).focus()
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('Esc equivale a "Pular por enquanto"', async () => {
    const wrapper = mountForm()
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('skip')).toHaveLength(1)
    wrapper.unmount()
  })

  it('o botão "Controlar quem entra na sala" tem nome acessível', () => {
    const wrapper = mountForm()
    const toggle = wrapper.get('[role="switch"]')
    const labelId = toggle.attributes('aria-labelledby')!
    expect(wrapper.get(`#${labelId}`).text()).toBe('Controlar quem entra na sala')
    wrapper.unmount()
  })
})
