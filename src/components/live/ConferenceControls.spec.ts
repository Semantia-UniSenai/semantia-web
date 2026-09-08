import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConferenceControls from './ConferenceControls.vue'

describe('ConferenceControls', () => {
  it('exposes independent microphone and camera controls with programmatic state', async () => {
    const wrapper = mount(ConferenceControls, {
      props: {
        mediaStatus: 'connected',
        mediaError: null,
        microphoneEnabled: false,
        cameraEnabled: true,
      },
    })

    const microphone = wrapper.get('button[aria-label="Ativar microfone da chamada"]')
    const camera = wrapper.get('button[aria-label="Desativar câmera da chamada"]')
    expect(microphone.attributes('aria-pressed')).toBe('false')
    expect(camera.attributes('aria-pressed')).toBe('true')

    await microphone.trigger('click')
    await camera.trigger('click')

    expect(wrapper.emitted('toggle-microphone')).toHaveLength(1)
    expect(wrapper.emitted('toggle-camera')).toHaveLength(1)
  })

  it('offers retry without hiding the text room when media fails', async () => {
    const wrapper = mount(ConferenceControls, {
      props: {
        mediaStatus: 'failed',
        mediaError: {
          code: 'MEDIA_CONNECTION_FAILED',
          message: 'Não foi possível conectar o áudio e vídeo',
        },
        microphoneEnabled: false,
        cameraEnabled: false,
      },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Não foi possível conectar o áudio e vídeo',
    )
    await wrapper.get('button[data-testid="retry-media"]').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
