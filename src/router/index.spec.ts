import { describe, expect, it } from 'vitest'
import router from './index'

describe('meeting routes', () => {
  it('exposes a meeting invitation and removes the room configuration dashboard', () => {
    const routes = router.getRoutes()
    expect(routes.some((route) => route.path === '/convite/reuniao/:token')).toBe(true)
    expect(routes.some((route) => route.path === '/app/salas/:id')).toBe(false)
    expect(routes.some((route) => route.name === 'room-detail')).toBe(false)
  })
})
