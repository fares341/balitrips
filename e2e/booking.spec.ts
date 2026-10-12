import { type Page } from '@playwright/test'

import { expect, test } from './support/fixtures'

import { addActivityToTrip, expectTripHasItems, travelDate } from './support/cart'
import { newCredentials, register } from './support/auth'
import { closeDb, orderStatus } from './support/db'

/**
 * The money path, end to end, through a browser.
 *
 * Nothing else in this repository exercises it. `checkout.integration.test.ts`
 * proves `checkout()` writes an order and holds capacity;
 * `webhook.integration.test.ts` proves a signed event moves it to `paid`. Both
 * call the functions directly. Neither presses a button, and the handoff's
 * version of this flow was a `useState` boolean called `done` — so the browser
 * half has never been run at all.
 *
 * The journey, in the order a customer performs it:
 *
 *   1. browse /en/activities
 *   2. open an activity
 *   3. choose a date, a departure time and a guest count
 *   4. add it to the trip
 *   5. open the cart and check the trip is there
 *   6. proceed to payment (signing up mid-flow, which is the normal path)
 *   7. accept the cancellation policy and pay
 *   8. clear the sandbox provider's 3-D Secure step-up
 *   9. land on a confirmation page carrying a real order number
 *  10. the order reaches `paid` — which only a verified webhook can do
 *
 * Every step is asserted where it happens, so a failure names the step that
 * broke rather than reporting "no order number" at the end.
 */

const ORDER_NUMBER = /\bBT-\d{4}-\d{4,}\b/

/** Approve the sandbox bank page and follow it back to the site. */
async function clearThreeDSecure(page: Page): Promise<void> {
  await expect(
    page,
    'the checkout never reached the 3-D Secure step-up — no payment intent was created',
  ).toHaveURL(/\/api\/payments\/sandbox\/challenge/)

  await expect(page.getByRole('heading', { name: 'Sandbox 3-D Secure' })).toBeVisible()

  await page.getByRole('button', { name: 'Approve' }).click()

  // The stand-in signs a webhook, delivers it over real HTTP, then 303s the
  // browser to /checkout/return?k=…, which trades the idempotency key for the
  // order number and forwards to the confirmation page.
  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60_000 })
}

test.describe('booking', () => {
  test.afterAll(async () => {
    await closeDb()
  })

  test('a traveller can browse, book, pay and be confirmed', async ({ page }) => {
    // ---- 1. browse -------------------------------------------------------
    await page.goto('/en/activities')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const activityLink = page.locator('a[href^="/en/activities/"]').first()
    await expect(activityLink, 'the activities index lists nothing to book').toBeVisible()

    // ---- 2. open an activity --------------------------------------------
    await activityLink.click()
    await page.waitForURL(/\/en\/activities\/[a-z0-9-]+$/)

    // ---- 3 + 4. choose a date, a time, guests, and add to the trip -------
    await addActivityToTrip(page, { date: travelDate(21), guests: 3 })
    await expectTripHasItems(page)

    // ---- 5. open the cart ------------------------------------------------
    await page.goto('/en/cart')
    await expect(page.getByRole('heading', { name: 'My Trip' })).toBeVisible()
    await expect(
      page.getByText('Your trip is empty.'),
      'the cart is empty after adding an activity to it',
    ).toBeHidden()

    // The cart must price the trip. "—" is reserved for a line that genuinely
    // cannot be priced; a real total is what the customer is about to accept.
    await expect(page.getByText('Grand total')).toBeVisible()

    // ---- 6. proceed to payment, signing up mid-flow ----------------------
    await page
      .getByRole('link', { name: /payment|checkout|booking/i })
      .first()
      .click()
    await page.waitForURL(/\/en\/checkout/)

    // The checkout gate asks an anonymous visitor to sign in. Creating the
    // account here is the normal path, and the trip has to survive it.
    const signInGate = page.getByRole('button', { name: 'Sign in' })
    if (await signInGate.isVisible().catch(() => false)) {
      await signInGate.click()
      await register(page, newCredentials('booker'))
      await page.goto('/en/checkout')
    }

    await expect(
      page.getByRole('heading', { name: 'Checkout' }),
      'the checkout page did not render for a signed-in visitor with a trip',
    ).toBeVisible()
    await expect(
      page.getByText('Your trip is empty.'),
      'the trip was lost between the cart and the checkout',
    ).toBeHidden()

    // ---- 7. accept the policy and pay ------------------------------------
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Proceed to payment' }).click()

    // ---- 8. the 3-D Secure stand-in --------------------------------------
    await clearThreeDSecure(page)

    // ---- 9. a real order number ------------------------------------------
    const url = page.url()
    expect(url, 'the confirmation URL carries no order number').toMatch(ORDER_NUMBER)

    const orderNumber = ORDER_NUMBER.exec(url)?.[0] ?? ''
    await expect(page.getByText(orderNumber)).toBeVisible()
    await expect(page.getByText('Order number')).toBeVisible()

    // ---- 10. the order reaches `paid` ------------------------------------
    // Only a verified webhook can do this. The page polls while `pending`, so
    // the assertion is on the settled headline, not on a snapshot.
    await expect(
      page.getByRole('heading', { name: 'Your booking is confirmed' }),
      'the order never reached `paid` — the webhook did not confirm it',
    ).toBeVisible({ timeout: 70_000 })

    // And the same fact from the row itself, which only a signature-verified
    // webhook can write. The headline is what the customer sees; this is what
    // the business is owed.
    expect(
      await orderStatus(orderNumber),
      `order ${orderNumber} did not reach 'paid' in the database`,
    ).toBe('paid')

    // The confirmation is addressable: reloading it must show the same order.
    await page.reload()
    await expect(page.getByText(orderNumber)).toBeVisible()
  })

  test('the cancellation policy cannot be skipped', async ({ page }) => {
    await register(page, newCredentials('terms'))

    await page.goto('/en/activities/mount-batur-sunrise-hike')
    await addActivityToTrip(page, { guests: 2 })
    await expectTripHasItems(page)

    await page.goto('/en/checkout')
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()

    // Submit without ticking the box. `terms_accepted_at` and `terms_version`
    // are the evidence that wins a chargeback; an order without them is worse
    // than no order.
    await page.getByRole('button', { name: 'Proceed to payment' }).click()

    await expect(page).toHaveURL(/\/en\/checkout/)
    await expect(
      page.getByRole('alert'),
      'checkout proceeded without an explicit acceptance of the cancellation policy',
    ).toBeVisible()
  })

  test('a declined step-up does not confirm the booking', async ({ page }) => {
    await register(page, newCredentials('declined'))

    await page.goto('/en/activities/mount-batur-sunrise-hike')
    await addActivityToTrip(page, { guests: 2 })
    await expectTripHasItems(page)

    await page.goto('/en/checkout')
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Proceed to payment' }).click()

    await expect(page).toHaveURL(/\/api\/payments\/sandbox\/challenge/)
    await page.getByRole('button', { name: 'Decline' }).click()
    await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60_000 })

    // A declined payment must never render the confirmed headline.
    await expect(
      page.getByRole('heading', { name: 'Your booking is confirmed' }),
      'a declined 3-D Secure step-up produced a confirmed booking',
    ).toBeHidden()
  })
})
