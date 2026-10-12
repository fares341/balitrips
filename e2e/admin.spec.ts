import { expect, test } from './support/fixtures'

import { ADMIN_EMAIL, ADMIN_PASSWORD, newCredentials, register, signIn } from './support/auth'
import { closeDb, resetTwoFactor } from './support/db'

/**
 * The admin's front door.
 *
 * `ADMIN_BASE_PATH` keeps the studio off a guessable URL, but obscurity is not
 * the control — `requireCapability()` inside every page and every server action
 * is. This spec asserts the three outcomes that matter, in the order of how
 * badly each one would hurt:
 *
 *  1. **Anonymous gets 404**, not a redirect and not a login form. A redirect
 *     to `/account` would confirm that something exists at the guessed path,
 *     which is the one fact the base path is trying not to leak.
 *  2. **A signed-in customer gets 404 too.** Role, not authentication, is the
 *     boundary. This is the check that catches a gate which only tested "is
 *     there a session".
 *  3. **The seeded administrator reaches two-factor enrolment** — and *only*
 *     that. TOTP is mandatory for elevated roles, so an admin who has not
 *     enrolled must be bounced to the enrolment screen rather than into the
 *     dashboard. The enrolment page is the single route exempt from the gate,
 *     because gating it would redirect an unenrolled admin to a page that
 *     refuses to render, which is the loop that made the admin unreachable
 *     before it existed.
 */

const ADMIN_PATH = '/studio-8f2a'

test.describe('admin studio', () => {
  /*
   * Enrolment is per-account and the administrator is shared, so a test that
   * mints a pending secret would change the screen the next run asserts
   * against. Reset it, so every run starts from the state the account ships in:
   * elevated, TOTP mandatory, nothing enrolled.
   */
  test.beforeAll(async () => {
    await resetTwoFactor(ADMIN_EMAIL)
  })

  test.afterAll(async () => {
    await resetTwoFactor(ADMIN_EMAIL)
    await closeDb()
  })

  test('is a 404 for an anonymous visitor', async ({ page }) => {
    const response = await page.goto(ADMIN_PATH)

    expect(
      response?.status(),
      'the admin path answered something other than 404 to an anonymous request',
    ).toBe(404)

    // And it must not have bounced to a sign-in screen, which would be a
    // confirmation that the path is real.
    expect(page.url(), 'the admin path redirected instead of 404ing').toContain(ADMIN_PATH)
  })

  test('is a 404 for a signed-in customer', async ({ page }) => {
    await register(page, newCredentials('customer'))

    const response = await page.goto(ADMIN_PATH)

    expect(response?.status(), 'a customer session was able to load the admin studio').toBe(404)
  })

  test('every studio sub-route is a 404 for a customer', async ({ page }) => {
    await register(page, newCredentials('customer-deep'))

    // The layout is not the authorization boundary — each page re-checks. A
    // sub-route reached directly must be as closed as the index.
    for (const sub of ['/orders', '/activities', '/audit', '/security']) {
      const response = await page.goto(`${ADMIN_PATH}${sub}`)
      expect(response?.status(), `${ADMIN_PATH}${sub} was reachable by a customer`).toBe(404)
    }
  })

  test('the internal mount is equally closed', async ({ page }) => {
    // `/studio` is deliberately not refused by the proxy — rotating
    // ADMIN_BASE_PATH retires the public URL, and `requireCapability()` is what
    // protects both. Assert that second half is true.
    const response = await page.goto('/studio')
    expect(response?.status(), '/studio was reachable without an elevated session').toBe(404)
  })

  test('the seeded administrator reaches two-factor enrolment', async ({ page }) => {
    await signIn(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })

    await page.goto(ADMIN_PATH)

    // The dashboard calls `requireCapability()`, which enforces the second
    // factor and redirects an unenrolled admin to the enrolment screen.
    await page.waitForURL(new RegExp(`${ADMIN_PATH}/security`), { timeout: 30_000 })

    await expect(
      page.getByRole('heading', { name: 'Two-factor authentication' }),
      'the admin did not land on the two-factor enrolment page',
    ).toBeVisible()

    /*
     * Enrolment must be *offerable*, not merely explained.
     *
     * The seeded admin has no secret yet, and the page deliberately does not
     * mint one on render — `beginEnrolment` does, on submit, so that loading
     * the page is not a state change and closing it cannot strand the account
     * half-enrolled. So the correct assertion for an unenrolled admin is that
     * the "Set up" step is present and actionable; the QR only exists once the
     * secret does.
     */
    await expect(page.getByRole('heading', { name: 'Set up' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Start setup' }),
      'the enrolment page offers no way to begin enrolling',
    ).toBeEnabled()
  })

  /*
   * Deliberately NOT tested here: pressing "Start setup" and asserting the QR
   * renders. It mints a secret on the one shared administrator account, which
   * changes the pane the test above asserts against — and both browser
   * projects can reach this file at the same time, so there is no ordering
   * that makes it safe. Enrolment past this point needs its own account, which
   * `scripts/create-admin.mjs` can only make from an already-registered user.
   */

  test('an unenrolled administrator cannot reach anything but enrolment', async ({ page }) => {
    await signIn(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })

    // TOTP is mandatory and not yet enrolled on the seeded account, so every
    // capability-gated page must bounce back to /security rather than render.
    await page.goto(`${ADMIN_PATH}/orders`)
    await expect(
      page,
      'an admin without a second factor reached a capability-gated page',
    ).toHaveURL(new RegExp(`${ADMIN_PATH}/security`))
  })
})
