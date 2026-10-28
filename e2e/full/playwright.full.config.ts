import { defineConfig, devices } from '@playwright/test'

/**
 * Full forms suite (.github/workflows/full-test.yml). Two configs in one:
 * FULL_LIVE=1 runs only the read-only live smoke against balitrips.co;
 * otherwise everything else runs against the CI copy at E2E_BASE_URL.
 */
const live = process.env.FULL_LIVE === '1'

export default defineConfig({
  testDir: '.',
  testMatch: live ? /live-smoke\.spec\.ts/ : /(public|studio)-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: live ? 1 : 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: '../../full-test-out/report.json' }],
    ['html', { outputFolder: '../../full-test-out/html', open: 'never' }],
  ],
  outputDir: '../../full-test-out/test-results',
  use: {
    baseURL: live ? 'https://balitrips.co' : (process.env.E2E_BASE_URL ?? 'http://localhost:3000'),
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'en-GB',
    timezoneId: 'Asia/Makassar',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      testMatch: live ? /live-smoke\.spec\.ts/ : /public-.*\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],
})
