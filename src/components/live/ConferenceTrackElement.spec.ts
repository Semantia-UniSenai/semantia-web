import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { ConferenceTrackRef } from '../../live/media/types'
import ConferenceTrackElement from './ConferenceTrackElement.vue'

function track(overrides: Partial<ConferenceTrackRef> = {}): ConferenceTrackRef {
  return {
    key: 'remote-1:camera',
    participantId: 'remote-1',
    participantName: 'Bruno',
    kind: 'video',
    source: 'camera',
    muted: false,
    isLocal: false,
    attach: vi.fn(),
    detach: vi.fn(),
    ...overrides,
  }
}

describe('ConferenceTrackElement', () => {
  it('attaches a conference track to the matching media element', () => {
    const videoTrack = track()

    const wrapper = mount(ConferenceTrackElement, {
      props: { track: videoTrack },
    })

    const video = wrapper.get('video')
    expect(video.attributes()).toMatchObject({ autoplay: '', playsinline: '' })
    expect(videoTrack.attach).toHaveBeenCalledWith(video.element)
  })

  it('keeps decorative video inside the named participant tile out of the accessibility tree', () => {
    const videoTrack = track()

    const wrapper = mount(ConferenceTrackElement, {
      props: { track: videoTrack },
    })

    expect(wrapper.get('video').attributes('aria-hidden')).toBe('true')
  })

  it('gives remote audio a stable accessible participant name', () => {
    const audioTrack = track({
      key: 'remote-1:microphone',
      kind: 'audio',
      source: 'microphone',
    })

    const wrapper = mount(ConferenceTrackElement, {
      props: { track: audioTrack },
    })

    expect(wrapper.get('audio').attributes('aria-label')).toBe('Áudio de Bruno')
  })

  it('detaches the exact element when it is unmounted', () => {
    const audioTrack = track({
      key: 'remote-1:microphone',
      kind: 'audio',
      source: 'microphone',
    })
    const wrapper = mount(ConferenceTrackElement, {
      props: { track: audioTrack },
    })
    const audio = wrapper.get('audio').element

    wrapper.unmount()

    expect(audioTrack.detach).toHaveBeenCalledWith(audio)
  })
})
