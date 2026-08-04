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

  it('não declara transcrição antes da primeira hipótese textual', () => {
    const wrapper = mountMic({
      listening: true,
      localEngine: true,
      inputState: 'receiving',
      audioLevel: 0.32,
      transport: 'direct',
      hasHypothesis: false,
    })

    expect(wrapper.find('.mic__status').text()).toContain('aguardando a primeira hipótese')
    expect(wrapper.find('.mic__status').text()).not.toContain('transcrevendo localmente')
    expect(wrapper.find('.mic__meter').attributes('aria-valuenow')).toBe('32')
  })

  it('mostra recuperação automática e confirmação textual separadamente', async () => {
    const wrapper = mountMic({
      listening: true,
      localEngine: true,
      inputState: 'receiving',
      audioLevel: 0.32,
      transport: 'switching',
      hasHypothesis: false,
    })

    expect(wrapper.find('.mic__status').text()).toContain('Ajustando compatibilidade')

    await wrapper.setProps({ transport: 'compatible' })
    expect(wrapper.find('.mic__status').text()).toContain('Modo compatível ativo')

    await wrapper.setProps({ hasHypothesis: true })
    expect(wrapper.find('.mic__status').text()).toContain('Transcrição local confirmada')
  })

  it('shows local quality-model progress without claiming captions are blocked', () => {
    const wrapper = mountMic({
      listening: true,
      localEngine: true,
      inputState: 'receiving',
      hasHypothesis: true,
      qualityStatus: 'loading',
      qualityProgress: 37,
    } as any)

    const quality = wrapper.find('.mic__quality')
    expect(quality.exists()).toBe(true)
    expect(quality.text()).toContain('37%')
    expect(quality.text()).toContain('legendas rápidas continuam disponíveis')
    expect(quality.text()).toContain('neste navegador')
    expect(wrapper.find('.mic__quality-progress').attributes('aria-valuenow')).toBe('37')
  })

  it('announces ready, refining and graceful quality fallback as separate states', async () => {
    const wrapper = mountMic({
      listening: true,
      localEngine: true,
      qualityStatus: 'ready',
    } as any)

    expect(wrapper.find('.mic__quality').text()).toContain('Precisão local aprimorada pronta')

    await wrapper.setProps({ qualityStatus: 'processing' } as any)
    expect(wrapper.find('.mic__quality').text()).toContain('Refinando a última legenda localmente')
    expect(wrapper.find('.mic__quality').text()).toContain('próximas falas continuam')

    await wrapper.setProps({ qualityStatus: 'error' } as any)
    expect(wrapper.find('.mic__quality').text()).toContain('Aprimoramento indisponível')
    expect(wrapper.find('.mic__quality').text()).toContain('reconhecedor local rápido')
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

  it('opens Meet-inspired audio settings and exposes the selected microphone', async () => {
    const wrapper = mountMic({
      audioDevices: [
        { deviceId: 'default', groupId: 'group-1', label: 'Microfone interno' },
        { deviceId: 'usb-headset', groupId: 'group-2', label: 'Headset USB' },
      ],
      selectedDeviceId: 'usb-headset',
      audioDevicesSupported: true,
    })

    const trigger = wrapper.find('.mic__device-trigger')
    expect(trigger.text()).toContain('Headset USB')
    expect(trigger.attributes('aria-label')).toBe('Escolher e testar microfone')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')

    expect(wrapper.emitted('refresh-audio-devices')?.[0]).toEqual([true])
    expect(trigger.attributes('aria-expanded')).toBe('true')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('Configurações de áudio')
    expect(dialog.text()).toContain('Teste do microfone')
    expect(dialog.text()).toContain('O áudio do teste não é enviado')

    await trigger.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('emits the selected device and explains why a specific input uses local mode', async () => {
    const wrapper = mountMic({
      audioDevices: [
        { deviceId: 'default', groupId: '', label: 'Microfone padrão' },
        { deviceId: 'usb-headset', groupId: '', label: 'Headset USB' },
      ],
      selectedDeviceId: 'default',
      audioDevicesSupported: true,
    })
    await wrapper.find('.mic__device-trigger').trigger('click')

    await wrapper.find('#audio-input-device').setValue('usb-headset')

    expect(wrapper.emitted('select-audio-device')?.[0]).toEqual(['usb-headset'])
    expect(wrapper.find('.mic__local-note').text()).toContain('processamento local')
  })

  it('tests the microphone with visual level and clear working feedback', async () => {
    const wrapper = mountMic({
      audioDevices: [
        { deviceId: 'default', groupId: '', label: 'Microfone padrão' },
      ],
      selectedDeviceId: 'default',
      audioDevicesSupported: true,
      microphoneTestState: 'idle',
      microphoneTestLevel: 0,
    })
    await wrapper.find('.mic__device-trigger').trigger('click')

    const testButton = wrapper.find('.mic-test__action')
    expect(testButton.text()).toContain('Testar microfone')
    await testButton.trigger('click')
    expect(wrapper.emitted('start-microphone-test')).toHaveLength(1)

    await wrapper.setProps({ microphoneTestState: 'working', microphoneTestLevel: 0.72 })
    expect(wrapper.find('.mic-test__status').text()).toContain('Seu microfone está funcionando')
    expect(wrapper.findAll('.mic-test__bar.active').length).toBeGreaterThan(0)
    expect(wrapper.find('.mic-test__meter').attributes('aria-valuenow')).toBe('72')

    await wrapper.find('.mic-test__action').trigger('click')
    expect(wrapper.emitted('stop-microphone-test')).toHaveLength(1)
  })

  it('shows actionable permission errors inside audio settings', async () => {
    const wrapper = mountMic({
      audioDevicesSupported: true,
      audioDeviceError: 'not-allowed',
    })
    await wrapper.find('.mic__device-trigger').trigger('click')

    const error = wrapper.find('.mic-settings__error')
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('Permita o acesso ao microfone')
  })

  it('disabled desabilita o botão', () => {
    const wrapper = mountMic({ disabled: true })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })
})
