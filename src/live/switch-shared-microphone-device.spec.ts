import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { switchSharedMicrophoneDevice } from './switch-shared-microphone-device'

describe('switchSharedMicrophoneDevice', () => {
  it('switches the shared input transactionally', async () => {
    const order: string[] = []
    const conference = {
      microphoneEnabled: ref(true),
      toggleMicrophone: vi.fn(async (deviceId?: string) => {
        order.push(`conference:${deviceId ?? 'off'}`)
      }),
    }
    const transcription = {
      listening: ref(true),
      loading: ref(false),
      stop: vi.fn(async () => {
        order.push('transcription:stop')
      }),
      start: vi.fn(async (deviceId: string) => {
        order.push(`transcription:start:${deviceId}`)
        return true
      }),
    }
    const microphoneSource = {
      acquire: vi.fn(),
      reset: vi.fn(async (deviceId: string) => {
        order.push(`source:reset:${deviceId}`)
      }),
      dispose: vi.fn(),
    }

    await switchSharedMicrophoneDevice({
      deviceId: 'microphone-2',
      previousDeviceId: 'microphone-1',
      microphoneSource,
      conference,
      transcription,
      stopTest: vi.fn(async () => {
        order.push('test:stop')
      }),
      selectDevice: vi.fn(async (deviceId: string) => {
        order.push(`select:${deviceId}`)
      }),
    })

    expect(order).toEqual([
      'test:stop',
      'conference:off',
      'transcription:stop',
      'select:microphone-2',
      'source:reset:microphone-2',
      'transcription:start:microphone-2',
      'conference:microphone-2',
    ])
  })

  it('rolls back the source and active consumers when the new input fails', async () => {
    const order: string[] = []
    const microphoneEnabled = ref(true)
    const listening = ref(true)
    const conference = {
      microphoneEnabled,
      toggleMicrophone: vi.fn(async (deviceId?: string) => {
        microphoneEnabled.value = !microphoneEnabled.value
        order.push(`conference:${deviceId ?? 'off'}`)
      }),
    }
    const transcription = {
      listening,
      loading: ref(false),
      stop: vi.fn(async () => {
        listening.value = false
        order.push('transcription:stop')
      }),
      start: vi.fn(async (deviceId: string) => {
        listening.value = true
        order.push(`transcription:start:${deviceId}`)
        return true
      }),
    }
    const microphoneSource = {
      acquire: vi.fn(),
      reset: vi.fn(async (deviceId: string) => {
        order.push(`source:reset:${deviceId}`)
        if (deviceId === 'microphone-2') throw new Error('device unavailable')
      }),
      dispose: vi.fn(),
    }
    const selectDevice = vi.fn(async (deviceId: string) => {
      order.push(`select:${deviceId}`)
    })

    await expect(
      switchSharedMicrophoneDevice({
        deviceId: 'microphone-2',
        previousDeviceId: 'microphone-1',
        microphoneSource,
        conference,
        transcription,
        stopTest: vi.fn(async () => {
          order.push('test:stop')
        }),
        selectDevice,
      }),
    ).rejects.toThrow('device unavailable')

    expect(order).toEqual([
      'test:stop',
      'conference:off',
      'transcription:stop',
      'select:microphone-2',
      'source:reset:microphone-2',
      'select:microphone-1',
      'source:reset:microphone-1',
      'transcription:start:microphone-1',
      'conference:microphone-1',
    ])
    expect(microphoneEnabled.value).toBe(true)
    expect(listening.value).toBe(true)
  })
})
