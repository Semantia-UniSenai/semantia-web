import { describe, expect, it } from 'vitest'
import router from './index'

describe('router bundle boundaries', () => {
  it('loads the conference room asynchronously', () => {
    const liveRoute = router.getRoutes().find((route) => route.path === '/sala/:sessionId')

    expect(typeof liveRoute?.components?.default).toBe('function')
  })
})

describe('títulos de rota (WCAG 2.4.2)', () => {
  it.each([
    ['/entrar', 'Entrar — Semantia'],
    ['/criar-conta', 'Criar conta — Semantia'],
    ['/convite/reuniao/abc', 'Convite para reunião — Semantia'],
  ])('%s tem título próprio', async (path, title) => {
    await router.push(path)
    expect(document.title).toBe(title)
  })

  it('cada rota pública tem um título diferente', async () => {
    const titles = new Set<string>()
    for (const path of ['/', '/entrar', '/criar-conta', '/convite/reuniao/abc']) {
      await router.push(path)
      titles.add(document.title)
    }
    expect(titles.size).toBe(4)
  })
})
