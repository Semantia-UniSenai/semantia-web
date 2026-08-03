import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createMeeting: vi.fn(),
  listRooms: vi.fn(),
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  RouterLink: {
    props: ['to'],
    template: '<a :href="String(to)"><slot /></a>',
  },
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('../api/generated/rooms/rooms', () => ({
  createMeeting: mocks.createMeeting,
  listRooms: mocks.listRooms,
}))

import RoomsView from './RoomsView.vue'

describe('RoomsView instant meeting journey', () => {
  beforeEach(() => {
    mocks.createMeeting.mockReset()
    mocks.listRooms.mockReset()
    mocks.push.mockReset()
    mocks.listRooms.mockResolvedValue([])
    mocks.createMeeting.mockResolvedValue({
      roomId: 'room-1',
      meetingId: 'meeting-1',
      name: 'Reunião instantânea',
      joinToken: 'join-token',
      status: 'LIVE',
      startedAt: new Date().toISOString(),
    })
  })

  it('opens a live meeting with one click and no preparation step', async () => {
    const wrapper = mount(RoomsView)
    await flushPromises()

    const button = wrapper
      .findAll('button')
      .find((candidate) => candidate.text() === 'Nova reunião')
    expect(button).toBeDefined()

    await button!.trigger('click')
    await flushPromises()

    expect(mocks.createMeeting).toHaveBeenCalledWith({})
    expect(mocks.push).toHaveBeenCalledWith('/sala/meeting-1')
    expect(wrapper.text()).not.toMatch(/sessões|preparação/i)
  })

  it('opens a recent meeting directly instead of a room dashboard', async () => {
    mocks.listRooms.mockResolvedValue([
      {
        id: 'room-1',
        name: 'Reunião de produto',
        hostId: 'host-1',
        inviteCode: 'ROOMCODE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hostName: 'Cauê',
        memberCount: 0,
        currentUserRole: 'HOST',
        meetingId: 'meeting-1',
        meetingStatus: 'LIVE',
        startedAt: new Date().toISOString(),
        endedAt: null,
      },
    ])

    const wrapper = mount(RoomsView)
    await flushPromises()

    const meetingLink = wrapper.find('a[href="/sala/meeting-1"]')
    expect(meetingLink.exists()).toBe(true)
    expect(meetingLink.text()).toContain('Reunião de produto')
  })

  it('falls back to the creation date when nullable startedAt is not a string', async () => {
    mocks.listRooms.mockResolvedValue([
      {
        id: 'room-legacy',
        name: 'Reunião migrada',
        hostId: 'host-1',
        inviteCode: 'ROOMCODE',
        createdAt: '2026-07-30T12:00:00.000Z',
        updatedAt: '2026-07-30T12:00:00.000Z',
        hostName: 'Cauê',
        memberCount: 0,
        currentUserRole: 'HOST',
        meetingId: 'meeting-legacy',
        meetingStatus: 'ENDED',
        startedAt: {} as never,
        endedAt: null,
      },
    ])

    const wrapper = mount(RoomsView)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Invalid Date')
  })
})
