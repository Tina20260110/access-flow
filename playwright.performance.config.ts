import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'performance.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  reporter: [['list'], ['html', { open: 'never' }]],
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4174',
    channel: 'chrome',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174',
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:4174',
  },
})
