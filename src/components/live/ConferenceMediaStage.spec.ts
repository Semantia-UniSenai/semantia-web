import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type {
  ConferenceParticipantRef,
  ConferenceTrackRef,
} from '../../live/media/types'
import ConferenceMediaStage from './ConferenceMediaStage.vue'

function track(overrides: Partial<ConferenceTrackRef>): ConferenceTrackRef {
  return {
    key: 'remote-1:microphone',
    participantId: 'remote-1',
    participantName: 'Bruno',
    kind: 'audio',
    source: 'microphone',
    muted: false,
    isLocal: false,
    attach: vi.fn(),
    detach: vi.fn(),
    ...overrides,
  }
}

const participants: ConferenceParticipantRef[] = [
  { participantId: 'local-1', name: 'Você' },
  { participantId: 'remote-1', name: 'Bruno' },
]

describe('ConferenceMediaStage', () => {
  it('shows compact participant tiles only while a camera is active', () => {
    const camera = track({
      key: 'local-1:camera',
      participantId: 'local-1',
      participantName: 'Você',
      kind: 'video',
      source: 'camera',
      isLocal: true,
    })
    const microphone = track({})

    const wrapper = mount(ConferenceMediaStage, {
      props: {
        participants,
        tracks: [camera, microphone],
        audioPlaybackBlocked: false,
      },
    })

    expect(wrapper.get('[aria-label="Vídeo da chamada"]')).toBeTruthy()
    expect(wrapper.findAll('[data-testid="conference-tile"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Câmera desligada')
    expect(camera.attach).toHaveBeenCalledTimes(1)
    expect(microphone.attach).toHaveBeenCalledTimes(1)
  })

  it('offers an explicit action when browser autoplay blocks remote audio', async () => {
    const wrapper = mount(ConferenceMediaStage, {
      props: {
        participants,
        tracks: [],
        audioPlaybackBlocked: true,
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('resume-audio')).toHaveLength(1)
  })
})
