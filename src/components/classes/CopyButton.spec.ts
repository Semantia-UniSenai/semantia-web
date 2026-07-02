import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CopyButton from './CopyButton.vue'

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

/** Escoa as microtasks pendentes sem depender de timers reais. */
async function flushMicrotasks(times = 4) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CopyButton', () => {
  it('mostra o label e copia o texto para o clipboard no click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    const wrapper = mount(CopyButton, {
      props: { text: 'https://semantia.dev/join/abc', label: 'Copiar link' },
    })
    expect(wrapper.text()).toBe('Copiar link')

    await wrapper.find('button').trigger('click')
    await flushMicrotasks()
    await wrapper.vm.$nextTick()

    expect(writeText).toHaveBeenCalledWith('https://semantia.dev/join/abc')
    expect(wrapper.text()).toBe('Copiado!')
    expect(wrapper.find('button').classes()).toContain('done')
  })

  it('usa o copiedLabel customizado e volta ao label após 2s', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    const wrapper = mount(CopyButton, {
      props: { text: 'abc', label: 'Copiar', copiedLabel: 'Na área!' },
    })

    await wrapper.find('button').trigger('click')
    await flushMicrotasks()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('Na área!')

    await vi.advanceTimersByTimeAsync(2000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('Copiar')
    expect(wrapper.find('button').classes()).not.toContain('done')
  })

  it('cai no fallback com execCommand quando o clipboard nativo falha', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('sem permissão')))
    const execCommand = vi.fn().mockReturnValue(true)
    ;(document as unknown as { execCommand: typeof execCommand }).execCommand =
      execCommand

    const wrapper = mount(CopyButton, { props: { text: 'plano-b', label: 'Copiar' } })
    await wrapper.find('button').trigger('click')
    await flushMicrotasks()
    await wrapper.vm.$nextTick()

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(wrapper.text()).toBe('Copiado!')
    // O textarea temporário não pode sobrar no DOM.
    expect(document.querySelector('textarea')).toBeNull()
  })
})
