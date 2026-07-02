import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MicControl from './MicControl.vue'

function mountMic(props: Partial<InstanceType<typeof MicControl>['$props']> = {}) {
  return mount(MicControl, {
    props: { supported: true, listening: false, error: null, ...props },
  })
}

describe('MicControl', () => {
  it('unsupported mostra alerta indicando Chrome/Edge e esconde o botão', () => {
    const wrapper = mountMic({ supported: false })

    const alert = wrapper.find('.mic__unsupported')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('Chrome')
    expect(alert.text()).toContain('Edge')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it("listening=false mostra 'Iniciar transcrição' e o click emite start", async () => {
    const wrapper = mountMic({ listening: false })
    const button = wrapper.find('button')

    expect(button.text()).toContain('Iniciar transcrição')
    expect(button.classes()).not.toContain('live')

    await button.trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
    expect(wrapper.emitted('stop')).toBeUndefined()
  })

  it("listening=true mostra 'Pausar transcrição' e o click emite stop", async () => {
    const wrapper = mountMic({ listening: true })
    const button = wrapper.find('button')

    expect(button.text()).toContain('Pausar transcrição')
    expect(button.classes()).toContain('live')
    expect(wrapper.find('.mic__status').text()).toContain('Transcrevendo')

    await button.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
    expect(wrapper.emitted('start')).toBeUndefined()
  })

  it("error 'not-allowed' mostra a dica de permissão de microfone", () => {
    const wrapper = mountMic({ error: 'not-allowed' })

    const error = wrapper.find('.mic__error')
    expect(error.exists()).toBe(true)
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('Permissão de microfone negada')
  })

  it('erro desconhecido cai na mensagem genérica com o código', () => {
    const wrapper = mountMic({ error: 'esquisito' })
    expect(wrapper.find('.mic__error').text()).toContain(
      'Erro no reconhecimento de voz: esquisito',
    )
  })

  it('disabled desabilita o botão', () => {
    const wrapper = mountMic({ disabled: true })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })
})
