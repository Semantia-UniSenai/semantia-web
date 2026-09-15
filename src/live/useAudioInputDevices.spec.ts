import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import {
  buildAudioConstraints,
  useAudioInputDevices,
  type UseAudioInputDevices,
} from './useAudioInputDevices'
import type { SharedMicrophoneSource } from './media/shared-microphone-source'

const stopTrack = vi.fn()
const closeContext = vi.fn().mockResolvedValue(undefined)
const resumeContext = vi.fn().mockResolvedValue(undefined)
const disconnectSource = vi.fn()
const disconnectAnalyser = vi.fn()
const connectAnalyser = vi.fn()
const getUserMedia = vi.fn()
const enumerateDevices = vi.fn()
let deviceChangeHandler: (() => void) | null = null
let animationFrame: FrameRequestCallback | null = null
let sampleAmplitude = 0

const track = { stop: stopTrack }
const stream = { getTracks: () => [track] } as unknown as MediaStream
const source = { connect: vi.fn(), disconnect: disconnectSource }
const analyser = {
  fftSize: 0,
  smoothingTimeConstant: 0,
  getByteTimeDomainData(buffer: Uint8Array) {
    buffer.fill(128)
    buffer[0] = 128 + Math.round(sampleAmplitude * 127)
  },
  disconnect: disconnectAnalyser,
  connect: connectAnalyser,
}
const destination = { kind: 'speaker-output' }

class FakeAudioContext {
  state: AudioContextState = 'running'
  destination = destination
  createMediaStreamSource = vi.fn(() => source)
  createAnalyser = vi.fn(() => analyser)
  resume = resumeContext
  close = closeContext
}

function device(deviceId: string, label = '', groupId = ''): MediaDeviceInfo {
  return {
    deviceId,
    groupId,
    kind: 'audioinput',
    label,
    toJSON: () => ({}),
  }
}

function mountDevices(options?: { microphoneSource?: SharedMicrophoneSource }) {
  let api!: UseAudioInputDevices
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useAudioInputDevices(options)
        return () => null
      },
    }),
  )
  return { api, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  deviceChangeHandler = null
  animationFrame = null
  sampleAmplitude = 0
  getUserMedia.mockResolvedValue(stream)
  enumerateDevices.mockResolvedValue([
    device('default', 'Padrão — Microfone interno', 'group-1'),
    device('usb-headset', 'Headset USB', 'group-2'),
    {
      deviceId: 'speaker',
      groupId: 'group-3',
      kind: 'audiooutput',
      label: 'Alto-falante',
      toJSON: () => ({}),
    },
  ])
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia,
      enumerateDevices,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'devicechange') deviceChangeHandler = handler
      }),
      removeEventListener: vi.fn(),
    },
  })
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    animationFrame = callback
    return 17
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useAudioInputDevices', () => {
  it('tests through a shared microphone lease instead of a competing capture', async () => {
    const release = vi.fn()
    const leaseTrack = { stop: vi.fn() } as unknown as MediaStreamTrack
    const microphoneSource = {
      acquire: vi.fn().mockResolvedValue({ track: leaseTrack, release }),
      reset: vi.fn(),
      dispose: vi.fn(),
    }
    vi.stubGlobal(
      'MediaStream',
      class {
        private readonly tracks: MediaStreamTrack[]
        constructor(tracks: MediaStreamTrack[]) {
          this.tracks = tracks
        }
        getTracks() {
          return this.tracks
        }
      },
    )
    const { api } = mountDevices({ microphoneSource })

    await api.startTest()
    await api.stopTest()

    expect(microphoneSource.acquire).toHaveBeenCalledWith('default')
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
    expect(leaseTrack.stop).not.toHaveBeenCalled()
  })

  it('reproduces the selected microphone locally only when monitoring is explicit', async () => {
    const { api } = mountDevices()

    await api.startTest(true)

    expect(connectAnalyser).toHaveBeenCalledWith(destination)
    expect(api.testMonitorEnabled.value).toBe(true)
    await api.stopTest()
    expect(api.testMonitorEnabled.value).toBe(false)
  })

  it('solicita permissão, lista apenas entradas com labels e libera a stream temporária', async () => {
    const { api } = mountDevices()

    await api.refresh(true)

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(api.devices.value).toEqual([
      {
        deviceId: 'default',
        groupId: 'group-1',
        label: 'Padrão — Microfone interno',
      },
      { deviceId: 'usb-headset', groupId: 'group-2', label: 'Headset USB' },
    ])
    expect(api.selectedDeviceId.value).toBe('default')
    expect(api.permissionGranted.value).toBe(true)
  })

  it('usa labels acessíveis antes da permissão e recupera preferência válida', async () => {
    localStorage.setItem('semantia.audio-input-device-id', 'usb-headset')
    enumerateDevices.mockResolvedValue([
      device('default'),
      device('usb-headset'),
    ])
    const { api } = mountDevices()

    await api.refresh(false)

    expect(getUserMedia).not.toHaveBeenCalled()
    expect(api.devices.value.map((item) => item.label)).toEqual([
      'Microfone padrão',
      'Microfone 2',
    ])
    expect(api.selectedDeviceId.value).toBe('usb-headset')
  })

  it('cai para o dispositivo padrão quando o selecionado é removido', async () => {
    const { api } = mountDevices()
    await api.refresh(false)
    api.selectDevice('usb-headset')
    expect(api.selectedDeviceId.value).toBe('usb-headset')

    enumerateDevices.mockResolvedValue([device('default', 'Microfone interno')])
    await deviceChangeHandler?.()

    expect(api.selectedDeviceId.value).toBe('default')
    expect(localStorage.getItem('semantia.audio-input-device-id')).toBe('default')
  })

  it('testa o dispositivo exato, confirma sinal e libera todos os recursos', async () => {
    const { api, wrapper } = mountDevices()
    await api.refresh(false)
    api.selectDevice('usb-headset')

    await api.startTest()
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: expect.objectContaining({ deviceId: { exact: 'usb-headset' } }),
    })
    expect(api.testState.value).toBe('listening')

    sampleAmplitude = 0.9
    animationFrame?.(16)
    expect(api.testLevel.value).toBeGreaterThan(0)
    expect(api.testState.value).toBe('working')

    await api.stopTest()
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(disconnectSource).toHaveBeenCalledTimes(1)
    expect(disconnectAnalyser).toHaveBeenCalledTimes(1)
    expect(closeContext).toHaveBeenCalledTimes(1)
    expect(api.testState.value).toBe('idle')

    wrapper.unmount()
  })

  it('reinicia o teste ao trocar a entrada e não mantém a track antiga', async () => {
    const { api } = mountDevices()
    await api.refresh(false)
    await api.startTest()
    stopTrack.mockClear()

    await api.selectDevice('usb-headset')

    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: expect.objectContaining({ deviceId: { exact: 'usb-headset' } }),
    })
    expect(api.testState.value).toBe('listening')
  })

  it('cancels a pending test before switching to another input', async () => {
    const lateStop = vi.fn()
    let resolveLate!: (value: MediaStream) => void
    const lateStream = {
      getTracks: () => [{ stop: lateStop }],
    } as unknown as MediaStream
    getUserMedia
      .mockReturnValueOnce(new Promise<MediaStream>((resolve) => (resolveLate = resolve)))
      .mockResolvedValueOnce(stream)
    const { api } = mountDevices()

    const pendingTest = api.startTest()
    await vi.waitFor(() => expect(api.testState.value).toBe('requesting'))
    const switching = api.selectDevice('usb-headset')
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
    await switching
    resolveLate(lateStream)
    await pendingTest

    expect(lateStop).toHaveBeenCalledTimes(1)
    expect(api.selectedDeviceId.value).toBe('usb-headset')
    expect(api.testState.value).toBe('listening')
  })

  it('releases an acquired stream when Web Audio initialization fails', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    const { api } = mountDevices()

    await api.startTest()

    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(api.error.value).toBe('unavailable')
    expect(api.testState.value).toBe('error')
  })

  it.each([
    ['NotAllowedError', 'not-allowed'],
    ['NotFoundError', 'not-found'],
    ['NotReadableError', 'not-readable'],
    ['OverconstrainedError', 'overconstrained'],
  ])('classifica %s ao iniciar teste como %s', async (name, expected) => {
    getUserMedia.mockRejectedValueOnce(new DOMException('falhou', name))
    const { api } = mountDevices()

    await api.startTest()

    expect(api.error.value).toBe(expected)
    expect(api.testState.value).toBe('error')
  })
})

describe('buildAudioConstraints', () => {
  it('usa constraint exata somente para uma entrada específica', () => {
    expect(buildAudioConstraints('usb-headset')).toEqual(
      expect.objectContaining({ deviceId: { exact: 'usb-headset' } }),
    )
    expect(buildAudioConstraints('default').deviceId).toBeUndefined()
    expect(buildAudioConstraints(null).deviceId).toBeUndefined()
  })
})
