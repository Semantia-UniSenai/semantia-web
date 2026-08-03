import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ChatMessage } from '../../live/types'
import ChatPanel from './ChatPanel.vue'

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    participantId: 'participant-1',
    participantName: 'Bruno',
    participantRole: 'PARTICIPANT',
    text: 'Olá, pessoal',
    createdAt: '2026-07-30T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
})

describe('ChatPanel', () => {
  it('renders contextual names and manager badges', () => {
    const wrapper = mount(ChatPanel, {
      props: {
        messages: [
          message({ participantName: 'Ana', participantRole: 'HOST' }),
          message({ id: 'message-2', participantName: 'Caio' }),
        ],
      },
    })
    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.find('.chat__badge').text()).toBe('Anfitrião')
    expect(wrapper.text()).toContain('Caio')
  })

  it('marks the current participant message', () => {
    const wrapper = mount(ChatPanel, {
      props: {
        myParticipantId: 'participant-1',
        messages: [message()],
      },
    })
    expect(wrapper.find('.chat__msg').classes()).toContain('mine')
    expect(wrapper.find('strong').text()).toBe('Você')
  })

  it('trims and emits messages', async () => {
    const wrapper = mount(ChatPanel, { props: { messages: [] } })
    await wrapper.find('input').setValue('  mensagem acessível  ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('send')).toEqual([['mensagem acessível']])
  })

  it('becomes read-only after the meeting ends', () => {
    const wrapper = mount(ChatPanel, { props: { messages: [], disabled: true } })
    expect(wrapper.find('input').attributes('placeholder')).toBe('A reunião foi encerrada')
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })
})
