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
})
