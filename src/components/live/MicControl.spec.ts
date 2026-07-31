import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MicControl from './MicControl.vue'

function mountMic(props: Partial<InstanceType<typeof MicControl>['$props']> = {}) {
  return mount(MicControl, {
    props: {
      supported: true,
      listening: false,
      loading: false,
      error: null,
      ...props,
    },
  })
}

describe('MicControl', () => {
  it('unsupported explica a limitação técnica sem recomendar uma marca de navegador', () => {
    const wrapper = mountMic({ supported: false })

    const alert = wrapper.find('.mic__unsupported')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toMatch(/captura de áudio/i)
    expect(alert.text()).not.toMatch(/Chrome|Edge|Brave/i)
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

  it('loading mostra o tempo real de preparação e permite cancelar', async () => {
    const wrapper = mountMic({ loading: true })
    const button = wrapper.find('button')

    expect(button.text()).toContain('Cancelar preparação')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.mic__status').text()).toContain('até cerca de um minuto')
    await button.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('mostra microfone conectado sem voz quando recebe silêncio', () => {
    const wrapper = mountMic({
      listening: true,
      localEngine: true,
      inputState: 'silent',
      audioLevel: 0,
    })

    expect(wrapper.find('.mic__status').text()).toContain('sem sinal de voz')
    expect(wrapper.find('.mic__meter').attributes('aria-valuenow')).toBe('0')
  })

  it('mostra nível real quando frames de voz chegam', () => {
    const wrapper = mountMic({
      listening: true,
      localEngine: true,
      inputState: 'receiving',
      audioLevel: 0.32,
    })

    expect(wrapper.find('.mic__status').text()).toContain('Áudio recebido')
    expect(wrapper.find('.mic__meter').attributes('aria-valuenow')).toBe('32')
  })

  it("error 'not-allowed' mostra a dica de permissão de microfone", () => {
    const wrapper = mountMic({ error: 'not-allowed' })

    const error = wrapper.find('.mic__error')
    expect(error.exists()).toBe(true)
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('Permissão de microfone negada')
  })

  it('falha do modelo local não culpa navegador nem serviço server-side', () => {
    const wrapper = mountMic({ error: 'model-load-failed' })
    const text = wrapper.find('.mic__error').text()

    expect(text).toContain('modelo local de transcrição')
    expect(text).not.toMatch(/servidor|provedor|Chrome|Edge|Brave/i)
  })

  it('pipeline sem frames mostra diagnóstico do microfone selecionado', () => {
    const wrapper = mountMic({ error: 'audio-processing-stalled' })
    expect(wrapper.find('.mic__error').text()).toContain('nenhum áudio chegou')
    expect(wrapper.find('.mic__error').text()).toContain('entrada selecionada')
  })

  it('erro desconhecido cai na mensagem genérica com o código', () => {
    const wrapper = mountMic({ error: 'esquisito' })
    expect(wrapper.find('.mic__error').text()).toContain(
      'Erro na transcrição: esquisito',
    )
  })

  it('disabled desabilita o botão', () => {
    const wrapper = mountMic({ disabled: true })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })
})
