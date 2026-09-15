import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import {
  useVideoInputDevices,
  type UseVideoInputDevices,
} from './useVideoInputDevices'

const stopTrack = vi.fn()
const getUserMedia = vi.fn()
const enumerateDevices = vi.fn()
let deviceChangeHandler: (() => void) | null = null

function device(deviceId: string, label = '', groupId = ''): MediaDeviceInfo {
  return {
    deviceId,
    groupId,
    kind: 'videoinput',
    label,
    toJSON: () => ({}),
  }
}

function mountDevices() {
  let api!: UseVideoInputDevices
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useVideoInputDevices()
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
  getUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: stopTrack }],
  })
  enumerateDevices.mockResolvedValue([
    device('default', 'Câmera integrada', 'group-1'),
    device('usb-camera', 'Webcam USB', 'group-2'),
    {
      deviceId: 'microphone',
      groupId: 'group-3',
      kind: 'audioinput',
      label: 'Microfone',
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
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useVideoInputDevices', () => {
  it('previews the selected camera locally and releases it when the test stops', async () => {
    const previewStop = vi.fn()
    const previewStream = {
      getTracks: () => [{ stop: previewStop }],
    } as unknown as MediaStream
    getUserMedia.mockResolvedValueOnce(previewStream)
    const { api, wrapper } = mountDevices()
    api.selectDevice('usb-camera')

    await api.startTest()

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { deviceId: { ideal: 'usb-camera' } },
    })
    expect(api.testStream.value).toBe(previewStream)
    expect(api.testState.value).toBe('previewing')

    await api.stopTest()
    expect(previewStop).toHaveBeenCalledTimes(1)
    expect(api.testStream.value).toBeNull()
    expect(api.testState.value).toBe('idle')
    wrapper.unmount()
  })

  it('falls back to the default camera when the selected device disappears', async () => {
    const { api, wrapper } = mountDevices()
    await api.refresh(false)
    api.selectDevice('usb-camera')
    enumerateDevices.mockResolvedValue([device('default', 'Câmera integrada')])

    await deviceChangeHandler?.()

    expect(api.selectedDeviceId.value).toBe('default')
    expect(localStorage.getItem('semantia.video-input-device-id')).toBe('default')
    wrapper.unmount()
  })

  it('persists the selected camera without storing its label', async () => {
    const { api, wrapper } = mountDevices()
    await api.refresh(false)

    api.selectDevice('usb-camera')

    expect(api.selectedDeviceId.value).toBe('usb-camera')
    expect(localStorage.getItem('semantia.video-input-device-id')).toBe('usb-camera')
    expect(JSON.stringify(localStorage)).not.toContain('Webcam USB')
    wrapper.unmount()
  })

  it('requests permission, lists only cameras and releases the temporary stream', async () => {
    const { api, wrapper } = mountDevices()

    await api.refresh(true)

    expect(getUserMedia).toHaveBeenCalledWith({ video: true })
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(api.devices.value).toEqual([
      { deviceId: 'default', groupId: 'group-1', label: 'Câmera integrada' },
      { deviceId: 'usb-camera', groupId: 'group-2', label: 'Webcam USB' },
    ])
    expect(api.selectedDeviceId.value).toBe('default')
    wrapper.unmount()
  })
})
