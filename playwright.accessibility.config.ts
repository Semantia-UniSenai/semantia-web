import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'accessibility.spec.ts',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  outputDir: '.e2e-results/accessibility/private-runtime',
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:41780',
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    reducedMotion: 'reduce',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{
    name: 'chromium-accessibility',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
      permissions: ['camera', 'microphone'],
      launchOptions: { args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ] },
    },
  }],
})
