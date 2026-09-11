import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConferenceControls from './ConferenceControls.vue'

describe('ConferenceControls', () => {
  it('keeps activation available after media connection fails so the click can retry', async () => {
    const wrapper = mount(ConferenceControls, {
      props: {
        mediaStatus: 'failed',
        mediaError: null,
        microphoneEnabled: false,
        cameraEnabled: false,
      },
    })

    const microphone = wrapper.get('button[aria-label="Ativar microfone da chamada"]')
    const camera = wrapper.get('button[aria-label="Ativar câmera da chamada"]')
    expect(microphone.attributes()).not.toHaveProperty('disabled')
    expect(camera.attributes()).not.toHaveProperty('disabled')

    await camera.trigger('click')
    expect(wrapper.emitted('toggle-camera')).toHaveLength(1)
  })

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

  it('shows pending media permission without accepting repeated activation', () => {
    const wrapper = mount(ConferenceControls, {
      props: {
        mediaStatus: 'connected',
        mediaError: null,
        microphoneEnabled: false,
        cameraEnabled: false,
        microphonePending: true,
        cameraPending: false,
      },
    })

    const microphone = wrapper.get('button[aria-label="Ativando áudio da chamada"]')
    expect(microphone.attributes('aria-busy')).toBe('true')
    expect(microphone.attributes()).toHaveProperty('disabled')
    expect(microphone.text()).toContain('Ativando…')
  })

  it('refreshes camera labels without opening a second capture over an active camera', async () => {
    const wrapper = mount(ConferenceControls, {
      props: {
        mediaStatus: 'connected',
        mediaError: null,
        microphoneEnabled: false,
        cameraEnabled: true,
        videoDevicesSupported: true,
      },
    })

    await wrapper.get('button[aria-label="Testar câmera e microfone"]').trigger('click')

    expect(wrapper.emitted('refresh-video-devices')).toEqual([[false]])
  })

  it('lets the user choose a camera without starting capture', async () => {
    const wrapper = mount(ConferenceControls, {
      props: {
        mediaStatus: 'connected',
        mediaError: null,
        microphoneEnabled: false,
        cameraEnabled: false,
        videoDevicesSupported: true,
        videoDevices: [
          { deviceId: 'default', groupId: 'g1', label: 'Câmera integrada' },
          { deviceId: 'usb-camera', groupId: 'g2', label: 'Webcam USB' },
        ],
        selectedVideoDeviceId: 'default',
      },
    })

    await wrapper.get('button[aria-label="Testar câmera e microfone"]').trigger('click')
    const dialog = wrapper.get('[role="dialog"][aria-label="Testar câmera e microfone"]')
    await dialog.get('#conference-camera-select').setValue('usb-camera')

    expect(wrapper.emitted('select-video-device')).toEqual([['usb-camera']])
  })

  it('offers local camera preview and audible microphone test even when the call is unavailable', async () => {
    const previewStream = new MediaStream()
    const wrapper = mount(ConferenceControls, {
      props: {
        mediaStatus: 'failed',
        mediaError: null,
        microphoneEnabled: false,
        cameraEnabled: false,
        videoDevicesSupported: true,
        videoDevices: [
          { deviceId: 'default', groupId: 'g1', label: 'Câmera integrada' },
        ],
        selectedVideoDeviceId: 'default',
        cameraTestState: 'previewing',
        cameraTestStream: previewStream,
        audioDevicesSupported: true,
        audioDevices: [
          { deviceId: 'default', groupId: 'g2', label: 'Microfone integrado' },
        ],
        selectedAudioDeviceId: 'default',
        microphoneTestState: 'working',
        microphoneTestLevel: 0.64,
        microphoneTestMonitorEnabled: true,
      },
    })

    const trigger = wrapper.get('button[aria-label="Testar câmera e microfone"]')
    expect(trigger.attributes()).not.toHaveProperty('disabled')
    await trigger.trigger('click')
    const dialog = wrapper.get('[role="dialog"][aria-label="Testar câmera e microfone"]')
    const preview = dialog.get('video[aria-label="Prévia da sua câmera"]')
    expect((preview.element as HTMLVideoElement).srcObject).toBe(previewStream)
    expect(preview.attributes()).toHaveProperty('autoplay')
    expect(preview.attributes()).toHaveProperty('playsinline')
    expect((preview.element as HTMLVideoElement).muted).toBe(true)
    expect(dialog.get('[role="meter"][aria-label="Nível do microfone"]').attributes('aria-valuenow')).toBe('64')
    expect(dialog.text()).toContain('Você está ouvindo seu próprio microfone')
    expect(dialog.text()).toContain('Use fones de ouvido para evitar eco')

    await dialog.get('button[aria-label="Parar teste da câmera"]').trigger('click')
    await dialog.get('button[aria-label="Parar teste do microfone"]').trigger('click')
    expect(wrapper.emitted('stop-camera-test')).toHaveLength(1)
    expect(wrapper.emitted('stop-microphone-test')).toHaveLength(1)
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
