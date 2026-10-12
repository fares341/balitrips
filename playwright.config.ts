import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end suite.
 *
 * These specs drive the built site through a real browser. They exist because
 * every layer below them can be green while the product is broken: the unit
 * tests prove `redactPlace()` redacts, the integration tests prove
 * `checkout()` writes an order — neither proves that a person with a mouse can
 * buy anything, or that the paywall survives the trip through the RSC stream
 * into the browser. That gap is exactly where the prototype shipped its worst
 * defects, so it is what these tests cover.
 *
 * ## The server under test
 *
 * `scripts/serve-standalone.mjs` runs the *production* build the way the
 * Dockerfile does — it copies `.next/static` and `public/` into the standalone
 * bundle and loads `.env.local`, neither of which the bare
 * `node .next/standalone/server.js` does. Testing `next dev` instead would
 * test a different application: dev has no minification, different caching,
 * different `NODE_ENV`, and it does not exercise the standalone packaging at
 * all.
 *
 * Node is portable here and is not on PATH, so the command is built from
 * `process.execPath` — the same interpreter that is running Playwright. It is
 * `node scripts/serve-standalone.mjs 3200` with the interpreter spelled out.
 *
 * `reuseExistingServer` is on outside CI: a build takes long enough that
 * re-launching a server for every run is a real cost, and a developer almost
 * always has one up already. In CI it is off, so a stale process can never be
 * mistaken for a fresh deploy.
 */

const PORT = 3200
const BASE_URL = `http://localhost:${PORT}`

const isCI = process.env.CI !== undefined && process.env.CI !== ''

export default defineConfig({
  testDir: './e2e',

  /**
   * Fully parallel across files, but see `workers` — these specs share one
   * Postgres database and one seeded catalogue, so the isolation that matters
   * is per-browser-context (cookies, carts, sessions), which Playwright gives
   * every test by default.
   */
  fullyParallel: true,

  /** A committed `test.only` silently shrinks the suite; refuse it in CI. */
  forbidOnly: isCI,

  retries: isCI ? 2 : 0,

  /**
   * Serialised in CI.
   *
   * Capacity holds, order numbers and the cart all live in one shared
   * database; parallel checkout specs would contend for the same seeded
   * inventory and produce flakes that say nothing about the code.
   */
  workers: isCI ? 1 : 2,

  reporter: isCI ? [['github'], ['list']] : [['list']],

  /** Generous: the first request to a route in a cold standalone server
   *  compiles nothing but does open a database pool and warm next-intl. */
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /** Locale-agnostic default; every spec navigates to an explicit prefix. */
    locale: 'en-GB',
    timezoneId: 'Asia/Makassar',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      /**
       * One mobile project, not a matrix.
       *
       * Pixel 5 is a real device profile: 393x851 CSS px, touch, mobile UA.
       * It is what catches the RTL overflow and the tap-target regressions
       * that a 1280px desktop viewport cannot see.
       */
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: `"${process.execPath}" scripts/serve-standalone.mjs ${PORT}`,
    url: `${BASE_URL}/en`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
