import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

const baseURL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:41780'
const chromiumMediaArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
]
const autoplayTest = /autoplay blocked/

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'accessibility.spec.ts',
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
      grepInvert: autoplayTest,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera', 'microphone'],
        launchOptions: { args: chromiumMediaArgs },
      },
    },
    {
      name: 'firefox-desktop',
      grepInvert: autoplayTest,
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.permission.disabled': true,
            'media.navigator.streams.fake': true,
            'media.peerconnection.ice.loopback': true,
            'media.peerconnection.ice.obfuscate_host_addresses': false,
            'media.peerconnection.ice.proxy_only_if_behind_proxy': false,
          },
        },
      },
    },
    {
      name: 'webkit-desktop',
      grepInvert: autoplayTest,
      use: {
        ...devices['Desktop Safari'],
        permissions: ['camera', 'microphone'],
      },
    },
    {
      name: 'chromium-mobile',
      grepInvert: autoplayTest,
      use: {
        ...devices['Pixel 7'],
        permissions: ['camera', 'microphone'],
        launchOptions: { args: chromiumMediaArgs },
      },
    },
    {
      name: 'webkit-mobile',
      grepInvert: autoplayTest,
      use: {
        ...devices['iPhone 15'],
        permissions: ['camera', 'microphone'],
      },
    },
    {
      name: 'chromium-autoplay-blocked',
      grep: autoplayTest,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera', 'microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=user-gesture-required',
          ],
        },
      },
    },
  ],
})
