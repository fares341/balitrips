import { expect, test } from './support/fixtures'

import { addActivityToTrip, cartCountCookie, expectTripHasItems } from './support/cart'
import { isSignedIn, newCredentials, register, signIn, signOut } from './support/auth'

/**
 * Accounts, and the one thing about them that is worth money.
 *
 * Registration, sign-in and sign-out are table stakes; they are here because
 * the handoff's "auth" was `localStorage.setItem("bt_user", …)` and an empty
 * form signed you in, so there is no prior evidence that any of it works
 * against a real session store.
 *
 * The cart merge is the test that matters commercially. The checkout gate
 * signs people up *mid-flow*: a visitor builds a trip signed out, presses
 * "complete booking", and is asked to create an account. If the anonymous cart
 * does not survive that, the customer lands on an empty trip at the exact
 * moment they had decided to pay. `mergeAnonymousCart` exists for this, and
 * `mergeAnonymousCartOnSignIn` is called from `startCheckoutAction` — but a
 * unit test of the merge function proves nothing about whether the cookie, the
 * session and the redirect line up in a browser.
 */

const ACTIVITY_PATH = '/en/activities/mount-batur-sunrise-hike'

test.describe('accounts', () => {
  test('a visitor can register, and lands signed in', async ({ page }) => {
    const credentials = newCredentials()

    await register(page, credentials)

    expect(await isSignedIn(page), 'registration did not produce a session').toBe(true)
  })

  test('a registered visitor can sign out and back in', async ({ page }) => {
    const credentials = newCredentials()
    await register(page, credentials)

    await signOut(page)
    expect(
      await isSignedIn(page),
      'the session survived sign-out — the account page still renders signed in',
    ).toBe(false)

    await signIn(page, credentials)
    expect(await isSignedIn(page), 'sign-in with correct credentials failed').toBe(true)
  })

  test('a wrong password is rejected', async ({ page }) => {
    const credentials = newCredentials()
    await register(page, credentials)
    await signOut(page)

    await page.goto('/en/account')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email address').fill(credentials.email)
    await dialog.getByLabel('Password', { exact: true }).fill('not-the-password-1A!')
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click()

    // The dialog must stay open with an error. The handoff closed it and
    // signed you in regardless of what you typed.
    await expect(dialog, 'a wrong password was accepted').toBeVisible()
    expect(await isSignedIn(page), 'a wrong password produced a session').toBe(false)
  })

  test('an anonymous cart survives signing in', async ({ page }) => {
    // 1. Build a trip with no account.
    await page.goto(ACTIVITY_PATH)
    await addActivityToTrip(page, { guests: 3 })

    await expectTripHasItems(page)

    await page.goto('/en/cart')
    await expect(
      page.getByText('Your trip is empty.'),
      'the anonymous cart is empty immediately after adding to it',
    ).toBeHidden()

    // 2. Create an account, which is what the checkout gate asks for.
    const credentials = newCredentials('merge')
    await register(page, credentials)

    // 3. The trip must still be there.
    await page.goto('/en/cart')
    await expect(
      page.getByText('Your trip is empty.'),
      'the anonymous trip was destroyed by signing up — this is a lost sale',
    ).toBeHidden()

    expect(
      await cartCountCookie(page),
      'the cart badge lost the anonymous items after sign-in',
    ).toBeGreaterThan(0)
  })

  test('an anonymous cart survives signing in to an existing account', async ({ page }) => {
    // The other half of the same risk: the account already exists and already
    // has its own (empty) cart, so the merge has two rows to reconcile rather
    // than one to re-parent.
    const credentials = newCredentials('merge-existing')
    await register(page, credentials)
    await signOut(page)

    await page.goto(ACTIVITY_PATH)
    await addActivityToTrip(page, { guests: 2 })
    await expectTripHasItems(page)

    await signIn(page, credentials)

    await page.goto('/en/cart')
    await expect(
      page.getByText('Your trip is empty.'),
      'signing in to an existing account discarded the anonymous trip',
    ).toBeHidden()
  })
})
