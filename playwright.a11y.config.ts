import { defineConfig, devices } from '@playwright/test'

/**
 * Accessibility suite.
 *
 * Separate from `playwright.config.ts` on purpose. That suite answers "can a
 * person buy a trip"; this one answers "can a person who cannot see the screen,
 * or cannot use a mouse, buy a trip". They fail for different reasons, they are
 * read by different people, and mixing them means the slow one gets skipped.
 * Same server, same build, different `testDir` — `./e2e-a11y`.
 *
 * ## The server under test
 *
 * The *production* build, through `scripts/serve-standalone.mjs`, for the
 * reasons that script's own header sets out: `node .next/standalone/server.js`
 * serves no CSS and reads no `.env.local`. Scanning an unstyled page for
 * accessibility problems is worse than not scanning it — `color-contrast` and
 * every target-size measurement would be meaningless, and the run would come
 * back green.
 *
 * `next dev` is equally unsuitable here, and for a reason specific to this
 * suite: the development overlay injects its own controls into the document,
 * and they would show up as findings against code nobody ships.
 *
 * Node is portable in this checkout and is not on PATH, so the command is
 * built from `process.execPath` — the interpreter already running Playwright.
 *
 * Port 3200 is shared with the functional suite, and `reuseExistingServer` is
 * on outside CI, so running both back to back costs one server start, not two.
 *
 * `A11Y_BASE_URL` overrides all of that and scans a server this config did not
 * start — a deployed preview, or a build snapshot kept somewhere `next build`
 * cannot delete. That second case is not hypothetical: `next build` empties
 * `.next/static` before it writes, so a build started while a scan is running
 * takes the stylesheets out from under it, and an unstyled page reports wrong
 * colours and wrong element sizes rather than reporting nothing.
 */

const PORT = 3200
const BASE_URL = process.env.A11Y_BASE_URL ?? `http://localhost:${PORT}`

/** Whether this run owns the server, or is pointed at one already running. */
const ownsServer = process.env.A11Y_BASE_URL === undefined

const isCI = process.env.CI !== undefined && process.env.CI !== ''

export default defineConfig({
  testDir: './e2e-a11y',

  /**
   * Outside `e2e-a11y/`, because Playwright treats everything under `testDir`
   * as a candidate spec file and traces are not specs. Nested under the
   * already-gitignored `test-results/`, in its own subdirectory so this suite
   * and the functional one cannot clear each other's artifacts.
   */
  outputDir: './test-results/a11y',

  fullyParallel: true,
  forbidOnly: isCI,

  /**
   * No retries, ever — not even in CI.
   *
   * An accessibility violation is deterministic: the same DOM produces the
   * same axe result every time. A retry here could only ever paper over a
   * flake in the harness, and the cost of that is a suite that quietly stops
   * meaning anything.
   */
  retries: 0,

  workers: isCI ? 2 : 4,

  /** Its own report folder, for the same reason as `outputDir`. */
  reporter: isCI
    ? [['github'], ['list'], ['html', { outputFolder: 'playwright-report/a11y', open: 'never' }]]
    : [['list']],

  /** A cold standalone server opens a database pool on the first hit. */
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /**
     * Bali time, matching the functional suite: the booking engine validates
     * dates against Asia/Makassar, and a browser in another zone can put the
     * activity detail page into an error state that is nothing to do with
     * accessibility.
     */
    timezoneId: 'Asia/Makassar',
    locale: 'en-GB',
  },

  projects: [
    {
      /**
       * 1280x800. Wide enough for the desktop header — the second-row nav and
       * the icon rail — which is where most of the site's controls live.
       */
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      /**
       * Tap targets only, at 393x851.
       *
       * Below 900px the header swaps its nav for a drawer, so the desktop
       * project never measures a single one of the controls a phone user
       * actually touches. Re-running the axe sweep here as well would double a
       * five-minute suite to find the same rule violations in the same markup;
       * the size checks are the ones whose answer genuinely changes with the
       * viewport.
       */
      name: 'mobile',
      testMatch: /tap-targets\.spec\.ts$/,
      use: { ...devices['Pixel 5'] },
    },
  ],

  ...(ownsServer
    ? {
        webServer: {
          command: `"${process.execPath}" scripts/serve-standalone.mjs ${PORT}`,
          url: `${BASE_URL}/en`,
          reuseExistingServer: !isCI,
          timeout: 180_000,
          stdout: 'pipe' as const,
          stderr: 'pipe' as const,
        },
      }
    : {}),
})
