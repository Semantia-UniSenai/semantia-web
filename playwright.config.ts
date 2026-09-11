import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

const baseURL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:41780'
const chromiumMediaArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
]

export default defineConfig({
  testDir: './e2e',
  outputDir: '.e2e-results/artifacts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '.e2e-results/report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera', 'microphone'],
        launchOptions: { args: chromiumMediaArgs },
      },
    },
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.permission.disabled': true,
            'media.navigator.streams.fake': true,
          },
        },
      },
    },
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        permissions: ['camera', 'microphone'],
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 7'],
        permissions: ['camera', 'microphone'],
        launchOptions: { args: chromiumMediaArgs },
      },
    },
    {
      name: 'webkit-mobile',
      use: {
        ...devices['iPhone 15'],
        permissions: ['camera', 'microphone'],
      },
    },
  ],
})
