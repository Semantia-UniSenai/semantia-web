import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createMeeting: vi.fn(),
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  RouterLink: {
    props: ['to'],
    template: '<a :href="String(to)"><slot /></a>',
  },
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('../stores/auth', () => ({
  useAuth: () => ({
    user: { name: 'Cauê Foyth' },
  }),
}))

vi.mock('../api/generated/rooms/rooms', () => ({
  createMeeting: mocks.createMeeting,
}))

import AppHomeView from './AppHomeView.vue'

describe('AppHomeView instant meeting entry point', () => {
  beforeEach(() => {
    mocks.createMeeting.mockReset()
    mocks.push.mockReset()

    mocks.createMeeting.mockResolvedValue({ meetingId: 'meeting-home' })
  })

  it('opens a live meeting from the home screen with one click', async () => {
    const wrapper = mount(AppHomeView)
    const button = wrapper
      .findAll('button')
      .find((candidate) => candidate.text() === 'Nova reunião')
    expect(button).toBeDefined()

    await button!.trigger('click')
    await flushPromises()

    expect(mocks.createMeeting).toHaveBeenCalledWith({})
    expect(mocks.push).toHaveBeenCalledWith('/sala/meeting-home')
  })

  it('presents invitation entry as a clear meeting action instead of a technical URL field', () => {
    const wrapper = mount(AppHomeView)
    const inviteInput = wrapper.get('#meeting-invite')
    const inviteLabel = wrapper.get('label[for="meeting-invite"]')
    const inviteForm = wrapper.get('form[aria-label="Entrar com convite"]')

    expect(inviteLabel.text()).toBe('Link ou código da reunião')
    expect(inviteInput.attributes('placeholder')).toBe('Cole o link ou código do convite')
    expect(inviteInput.attributes('autocomplete')).toBe('off')
    expect(inviteForm.get('button[type="submit"]').text()).toContain('Entrar na reunião')
    expect(inviteForm.text()).not.toContain('https://')
  })
})
