import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Registration and sign-in, through the dialog a customer actually uses.
 *
 * `AuthModal` is a Client Component with three panes behind pill switches, and
 * it is the only credential surface on the site — `/account` hosts it, and
 * every gated route redirects there. Driving it (rather than POSTing to
 * `/api/auth/sign-in/email`) is the point: the handoff's version signed you in
 * on an *empty* form, because `submitIn` ended in an unconditional
 * `onAuthed(...)`. Only a browser catches that class of bug.
 */

export const ADMIN_EMAIL = 'ops@balitrips.test'
export const ADMIN_PASSWORD = 'Str0ng-Passw0rd!23'

/** A fresh address per test run, so registration is never a duplicate. */
export function uniqueEmail(prefix = 'traveller'): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}+${stamp}@balitrips.test`
}

export interface Credentials {
  name: string
  email: string
  password: string
}

export function newCredentials(prefix?: string): Credentials {
  return {
    name: 'Test Traveller',
    email: uniqueEmail(prefix),
    // Long enough for the zod rule in components/auth/schemas.ts.
    password: 'Str0ng-Passw0rd!23',
  }
}

/**
 * Open the sign-in dialog from the account page.
 *
 * The button is server-rendered but its behaviour is not: `SignedOutPane` is a
 * Client Component, and `open` is React state. A click that lands between the
 * HTML arriving and React attaching its listener does nothing at all — the
 * button is visible, enabled, and inert. That is a genuine (if brief) property
 * of any hydrated page, not a defect, so the fix is to keep asking rather than
 * to assert on the first attempt.
 */
export async function openAuthDialog(page: Page, locale = 'en'): Promise<void> {
  await page.goto(`/${locale}/account`)

  const opener = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(opener, 'the account page offers no way to sign in').toBeVisible()

  const dialog = page.getByRole('dialog')

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await opener.click()
    try {
      await dialog.waitFor({ state: 'visible', timeout: 2000 })
      return
    } catch {
      // Not hydrated yet. Try again.
    }
  }

  await expect(dialog, 'the sign-in dialog never opened').toBeVisible()
}

/** Register a brand-new account and end up signed in. */
export async function register(page: Page, credentials: Credentials): Promise<void> {
  await openAuthDialog(page)

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Sign up' }).click()

  await dialog.getByLabel('Full name').fill(credentials.name)
  await dialog.getByLabel('Email address').fill(credentials.email)
  await dialog.getByLabel('Password', { exact: true }).fill(credentials.password)
  await dialog.getByLabel('Confirm password').fill(credentials.password)

  await dialog.getByRole('button', { name: 'Create account' }).click()
  await expect(dialog, 'the sign-up dialog stayed open — registration failed').toBeHidden()
}

/**
 * Sign in through the dialog, from wherever the visitor currently is.
 *
 * `alreadyOpen` covers the mid-checkout gate, which opens the dialog by
 * itself because it arrived with `?next=/checkout`.
 */
export async function signIn(
  page: Page,
  credentials: Pick<Credentials, 'email' | 'password'>,
  options: { alreadyOpen?: boolean } = {},
): Promise<void> {
  if (options.alreadyOpen !== true) await openAuthDialog(page)

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Email address').fill(credentials.email)
  await dialog.getByLabel('Password', { exact: true }).fill(credentials.password)
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click()

  await expect(
    dialog,
    'the sign-in dialog stayed open — the credentials were rejected',
  ).toBeHidden()
}

/**
 * Reveal the sign-out control for the current viewport, and return it.
 *
 * There are two of them, and which one is reachable depends on the width.
 * `.bt-acct-signout` in the account sidebar is `display: none` below 880px —
 * on a phone the rail collapses and the same control lives inside the account
 * dropdown instead, behind the "My account" button. A test that only knew
 * about the sidebar would report "sign-out is broken on mobile" when the truth
 * is that it moved.
 */
async function revealSignOut(page: Page): Promise<Locator> {
  const inSidebar = page.getByRole('button', { name: 'Sign out' })
  if (await inSidebar.isVisible().catch(() => false)) return inSidebar

  const menuButton = page.getByRole('button', { name: 'My account' })
  if (await menuButton.isVisible().catch(() => false)) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await menuButton.click()
      try {
        await inSidebar.waitFor({ state: 'visible', timeout: 1500 })
        return inSidebar
      } catch {
        // The dropdown is a Client Component; the first click can land before
        // React attaches. Ask again.
      }
    }
  }

  return inSidebar
}

/**
 * True when the account page is showing a signed-in visitor.
 *
 * Waits for the page to commit to one of the two states before reading it —
 * `/account` is `force-dynamic` and either pane can be the slower one, so a
 * bare `isVisible()` races the render and reports "signed out" for a session
 * that exists.
 */
export async function isSignedIn(page: Page, locale = 'en'): Promise<boolean> {
  await page.goto(`/${locale}/account`)

  // Viewport-independent signals: the account dropdown only renders for a
  // session, the "Sign in" card only without one.
  const signedIn = page.getByRole('button', { name: 'My account' })
  const signedOut = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(signedIn.or(signedOut).first()).toBeVisible()

  return signedIn.isVisible()
}

/**
 * Sign out, and wait for the navigation it performs.
 *
 * `SignOutButton` revokes the session and then `router.replace(HOME_HREF)` —
 * `replace`, not `push`, so Back cannot return to a signed-in account screen
 * with no session behind it. The caller therefore ends up on the home page,
 * not on `/account`.
 */
export async function signOut(page: Page, locale = 'en'): Promise<void> {
  await page.goto(`/${locale}/account`)

  const button = await revealSignOut(page)
  await expect(button, 'no sign-out control — is anyone signed in?').toBeVisible()
  await button.click()

  await page.waitForURL(new RegExp(`/${locale}/?$`), { timeout: 30_000 })
}
