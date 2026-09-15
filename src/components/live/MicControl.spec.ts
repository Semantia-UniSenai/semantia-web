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
  it('explica captura indisponível sem recomendar navegador', () => {
    const wrapper = mountMic({ supported: false })
    const alert = wrapper.find('.mic__unsupported')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toMatch(/captura de áudio/i)
    expect(alert.text()).not.toMatch(/Chrome|Edge|Brave/i)
  })

  it('inicia e pausa a captura para transcrição backend', async () => {
    const wrapper = mountMic({ listening: false })
    const button = wrapper.find('.mic__btn')
    expect(button.text()).toContain('Iniciar transcrição')
    await button.trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)

    await wrapper.setProps({ listening: true, inputState: 'receiving' })
    expect(button.text()).toContain('Pausar transcrição')
    await button.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('descreve somente captura e backend, sem prévia, hipótese, Vosk ou modelo local', () => {
    const wrapper = mountMic({
      listening: true,
      inputState: 'receiving',
      audioLevel: 0.32,
      qualityStatus: 'ready',
      backendEngine: 'faster-whisper',
      backendModel: 'small',
    })
    const text = wrapper.text()
    expect(text).toContain('janelas de 5 segundos')
    expect(text).toContain('servidor')
    expect(text).toContain('faster-whisper/small')
    expect(text).not.toMatch(/prévia|hipótese|Vosk|modelo local|transcrição local/i)
    expect(wrapper.find('.mic__meter').attributes('aria-valuenow')).toBe('32')
  })

  it('loading representa apenas preparação da captura', () => {
    const wrapper = mountMic({ loading: true })
    const text = wrapper.find('.mic__status').text()
    expect(text).toContain('microfone')
    expect(text).not.toMatch(/modelo|português|um minuto/i)
  })

  it('explica fila backend e retenção zero', async () => {
    const wrapper = mountMic({
      listening: true,
      inputState: 'receiving',
      qualityStatus: 'processing',
      pendingAudioCount: 2,
    })
    expect(wrapper.find('.mic__quality').text()).toContain('2 segmentos')
    expect(wrapper.find('.mic__quality').text()).toContain('descartado após o processamento')

    await wrapper.setProps({ qualityStatus: 'error' })
    expect(wrapper.find('.mic__quality').text()).toContain('indisponível')
    expect(wrapper.find('.mic__quality').text()).not.toContain('final local')
  })

  it('mostra dica acionável para permissão negada e pipeline sem frames', async () => {
    const wrapper = mountMic({ error: 'not-allowed' })
    expect(wrapper.find('.mic__error').text()).toContain('Permissão de microfone negada')
    await wrapper.setProps({ error: 'audio-processing-stalled' })
    expect(wrapper.find('.mic__error').text()).toContain('nenhum áudio chegou')
  })

  it('does not duplicate device selection or microphone testing owned by the unified panel', () => {
    const wrapper = mountMic()

    expect(wrapper.find('.mic__device-trigger').exists()).toBe(false)
    expect(wrapper.find('.mic-settings').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Entrada de áudio')
    expect(wrapper.text()).not.toContain('Teste do microfone')
  })
})
