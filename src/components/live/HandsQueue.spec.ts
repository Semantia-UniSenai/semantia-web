import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { RaisedHand } from '../../live/types'
import HandsQueue from './HandsQueue.vue'

function hand(participantId: string, name: string): RaisedHand {
  return { participantId, name, at: '2026-07-02T10:05:00.000Z' }
}

describe('HandsQueue', () => {
  it('shows the empty queue', () => {
    const wrapper = mount(HandsQueue, { props: { hands: [] } })
    expect(wrapper.text()).toContain('Nenhuma mão levantada.')
  })

  it('keeps contextual participant order', async () => {
    const wrapper = mount(HandsQueue, {
      props: { hands: [hand('p1', 'Bruno'), hand('p2', 'Carla')] },
    })
    expect(wrapper.findAll('.hands__item')).toHaveLength(2)
    await wrapper.setProps({ hands: [hand('p2', 'Carla')] })
    expect(wrapper.find('.hands__pos').text()).toBe('1º')
    expect(wrapper.find('.hands__name').text()).toBe('Carla')
  })
})
