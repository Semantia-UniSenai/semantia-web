import { describe, expect, it } from 'vitest'
import router from './index'

describe('router bundle boundaries', () => {
  it('loads the conference room asynchronously', () => {
    const liveRoute = router.getRoutes().find((route) => route.path === '/sala/:sessionId')

    expect(typeof liveRoute?.components?.default).toBe('function')
  })
})
