import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveSessionToken: vi.fn(),
  createGuestAccess: vi.fn(),
  user: { value: null as { name: string } | null },
}))

vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a :href="String(to)"><slot /></a>' },
  useRoute: () => ({ params: { token: 'token-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../api/generated/sessions/sessions', () => ({
  resolveSessionToken: mocks.resolveSessionToken,
  createGuestAccess: mocks.createGuestAccess,
}))

vi.mock('../live/guestAccess', () => ({ saveGuestAccess: vi.fn() }))

vi.mock('../stores/auth', () => ({
  useAuth: () => ({ user: ref(mocks.user.value) }),
}))

import SessionInviteView from './SessionInviteView.vue'

describe('SessionInviteView entrada redundante (WCAG 3.3.7)', () => {
  beforeEach(() => {
    mocks.resolveSessionToken.mockResolvedValue({ roomName: 'Sala', title: 'Reunião instantânea' })
  })

  it('preenche o nome de quem já tem conta', async () => {
    mocks.user.value = { name: 'Cauê Foyth' }
    const wrapper = mount(SessionInviteView)
    await flushPromises()

    expect((wrapper.get('form input').element as HTMLInputElement).value).toBe('Cauê Foyth')
  })

  it('deixa o campo vazio para visitante sem conta', async () => {
    mocks.user.value = null
    const wrapper = mount(SessionInviteView)
    await flushPromises()

    expect((wrapper.get('form input').element as HTMLInputElement).value).toBe('')
  })
})
