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
  it('shows and removes a raised-hand icon inside the participant pill', async () => {
    const wrapper = mount(ConferenceMediaStage, {
      props: {
        participants,
        tracks: [
          track({
            key: 'local-1:camera',
            participantId: 'local-1',
            participantName: 'Você',
            kind: 'video',
            source: 'camera',
            isLocal: true,
          }),
        ],
        audioPlaybackBlocked: false,
        currentParticipantId: 'local-1',
        raisedParticipantIds: ['local-1'],
      },
    })

    const localTile = wrapper.findAll('[data-testid="conference-tile"]')[0]!
    expect(localTile.attributes('aria-label')).toContain('Mão levantada')
    expect(localTile.get('[title="Mão levantada"]')).toBeTruthy()
    expect(localTile.get('.conference-tile__identity strong').text()).toBe('Você (você)')

    await wrapper.setProps({ raisedParticipantIds: [] })
    expect(localTile.attributes('aria-label')).not.toContain('Mão levantada')
    expect(localTile.find('[title="Mão levantada"]').exists()).toBe(false)
  })

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
        currentParticipantId: 'local-1',
      },
    })

    expect(wrapper.get('[aria-label="Vídeo da chamada"]')).toBeTruthy()
    expect(wrapper.findAll('[data-testid="conference-tile"]')).toHaveLength(2)
    const tiles = wrapper.findAll('[data-testid="conference-tile"]')
    const localIdentity = tiles[0]!.get('.conference-tile__identity')
    expect(localIdentity.text()).toBe('Você (você)')
    expect(tiles[0]!.attributes('aria-label')).toBe(
      'Vídeo de Você. Câmera ativa. Microfone desligado.',
    )
    expect(localIdentity.get('[title="Câmera ativa"]')).toBeTruthy()
    expect(localIdentity.get('[title="Microfone desligado"]')).toBeTruthy()
    expect(localIdentity.findAll('.conference-tile__status-icon')).toHaveLength(2)
    expect(wrapper.text()).not.toMatch(/Câmera (ativa|desligada)|Microfone (ativo|desligado)/)
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
