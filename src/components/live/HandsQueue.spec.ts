import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { RaisedHand } from '../../live/types'
import HandsQueue from './HandsQueue.vue'

function hand(userId: string, name: string): RaisedHand {
  return { userId, name, at: '2026-07-02T10:05:00.000Z' }
}

describe('HandsQueue', () => {
  it('sem mãos mostra o texto de fila vazia', () => {
    const wrapper = mount(HandsQueue, { props: { hands: [] } })
    expect(wrapper.text()).toContain('Nenhuma mão levantada.')
    expect(wrapper.find('.hands__item').exists()).toBe(false)
  })

  it('renderiza a fila na ordem, com posições 1º/2º e nomes', () => {
    const wrapper = mount(HandsQueue, {
      props: { hands: [hand('u1', 'Fulano'), hand('u2', 'Beltrana')] },
    })

    const items = wrapper.findAll('.hands__item')
    expect(items).toHaveLength(2)
    expect(items[0]!.find('.hands__pos').text()).toBe('1º')
    expect(items[0]!.find('.hands__name').text()).toBe('Fulano')
    expect(items[1]!.find('.hands__pos').text()).toBe('2º')
    expect(items[1]!.find('.hands__name').text()).toBe('Beltrana')
    expect(wrapper.text()).not.toContain('Nenhuma mão levantada.')
  })

  it('atualização das mãos rerenderiza a fila (nova ordem de posições)', async () => {
    const wrapper = mount(HandsQueue, {
      props: { hands: [hand('u1', 'Fulano'), hand('u2', 'Beltrana')] },
    })

    await wrapper.setProps({ hands: [hand('u2', 'Beltrana')] })

    const items = wrapper.findAll('.hands__item')
    expect(items).toHaveLength(1)
    expect(items[0]!.find('.hands__pos').text()).toBe('1º')
    expect(items[0]!.find('.hands__name').text()).toBe('Beltrana')
  })
})
