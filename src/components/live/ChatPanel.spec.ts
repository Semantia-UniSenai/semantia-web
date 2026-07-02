import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ChatMessage } from '../../live/types'
import ChatPanel from './ChatPanel.vue'

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    userId: 'user-x',
    name: 'Fulano',
    role: 'ALUNO',
    text: 'oi, professora',
    at: '2026-07-02T10:00:00.000Z',
    ...overrides,
  }
}

function mountPanel(props: Partial<InstanceType<typeof ChatPanel>['$props']> = {}) {
  return mount(ChatPanel, {
    props: { messages: [], ...props },
  })
}

beforeEach(() => {
  // happy-dom pode não implementar scrollTo (auto-scroll do watch de mensagens).
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
})

describe('ChatPanel', () => {
  it('mostra estado vazio sem mensagens', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Sem mensagens ainda')
  })

  it('renderiza as mensagens com nome e texto', () => {
    const wrapper = mountPanel({
      messages: [
        msg({ id: 'm1', name: 'Fulano', text: 'primeira dúvida' }),
        msg({ id: 'm2', name: 'Beltrana', text: 'segunda dúvida' }),
      ],
    })

    const items = wrapper.findAll('.chat__msg')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toContain('Fulano')
    expect(items[0]!.text()).toContain('primeira dúvida')
    expect(items[1]!.text()).toContain('Beltrana')
    expect(items[1]!.text()).toContain('segunda dúvida')
  })

  it('badge Professor só aparece para mensagens de PROFESSOR', () => {
    const wrapper = mountPanel({
      messages: [
        msg({ id: 'm1', role: 'PROFESSOR', name: 'Marina' }),
        msg({ id: 'm2', role: 'ALUNO', name: 'Fulano' }),
      ],
    })

    const items = wrapper.findAll('.chat__msg')
    expect(items[0]!.find('.chat__badge').exists()).toBe(true)
    expect(items[0]!.find('.chat__badge').text()).toBe('Professor')
    expect(items[1]!.find('.chat__badge').exists()).toBe(false)
  })

  it('mensagem própria vira "Você" e recebe a classe mine', () => {
    const wrapper = mountPanel({
      myUserId: 'user-me',
      messages: [
        msg({ id: 'm1', userId: 'user-me', name: 'Eu Mesmo' }),
        msg({ id: 'm2', userId: 'user-x', name: 'Fulano' }),
      ],
    })

    const items = wrapper.findAll('.chat__msg')
    expect(items[0]!.classes()).toContain('mine')
    expect(items[0]!.find('strong').text()).toBe('Você')
    expect(items[1]!.classes()).not.toContain('mine')
    expect(items[1]!.find('strong').text()).toBe('Fulano')
  })

  it('submit emite send com o texto (trim) e limpa o input', async () => {
    const wrapper = mountPanel()
    const input = wrapper.find('input')

    await input.setValue('  minha pergunta  ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('send')).toEqual([['minha pergunta']])
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('não emite send com texto vazio/só espaços', async () => {
    const wrapper = mountPanel()

    await wrapper.find('form').trigger('submit')
    await wrapper.find('input').setValue('    ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('botão de enviar fica desabilitado enquanto o draft está vazio', async () => {
    const wrapper = mountPanel()
    const button = wrapper.find('button[type="submit"]')

    expect(button.attributes('disabled')).toBeDefined()

    await wrapper.find('input').setValue('algo')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('disabled desabilita input e botão e não emite send', async () => {
    const wrapper = mountPanel({ disabled: true })
    const input = wrapper.find('input')

    expect(input.attributes('disabled')).toBeDefined()
    expect(input.attributes('placeholder')).toBe('A aula foi encerrada')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    await input.setValue('tentativa')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('send')).toBeUndefined()
  })
})
