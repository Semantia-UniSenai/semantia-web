import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  RouterLink: {
    props: ['to'],
    template: '<a :href="String(to)"><slot /></a>',
  },
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../../stores/auth', () => ({
  useAuth: () => ({ user: { name: 'Cauê Foyth' }, logout: vi.fn() }),
}))

import RoomsHeader from './RoomsHeader.vue'

describe('RoomsHeader navegação consistente (WCAG 2.4.5 e 3.2.3)', () => {
  it.each(['inicio', 'reunioes'] as const)('mostra os mesmos links, na mesma ordem, em %s', (current) => {
    const wrapper = mount(RoomsHeader, { props: { current } })
    const links = wrapper.findAll('nav[aria-label="Aplicativo"] a')

    expect(links.map((link) => link.text())).toEqual(['Início', 'Minhas reuniões'])
    expect(links.map((link) => link.attributes('href'))).toEqual(['/app', '/app/salas'])
  })

  it('marca a página atual com aria-current', () => {
    const wrapper = mount(RoomsHeader, { props: { current: 'reunioes' } })
    const [home, rooms] = wrapper.findAll('nav[aria-label="Aplicativo"] a')

    expect(home!.attributes('aria-current')).toBeUndefined()
    expect(rooms!.attributes('aria-current')).toBe('page')
  })
})
