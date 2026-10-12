import { expect, type Page } from '@playwright/test'

/**
 * Driving the product pages the way a customer does.
 *
 * These helpers deliberately click what a person clicks. Nothing here calls a
 * server action directly or posts to an endpoint — the whole point of the
 * booking spec is that the *browser* path works, and a helper that quietly
 * took a shortcut around a broken button would hide exactly the defect the
 * suite exists to find.
 */

/** A date far enough out to clear any activity's lead time, in Bali. */
export function travelDate(daysAhead = 21): string {
  const now = new Date()
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  target.setUTCDate(target.getUTCDate() + daysAhead)
  return target.toISOString().slice(0, 10)
}

/**
 * Fill the booking engine on an activity detail page and press "Add to my
 * trip".
 *
 * Time is a slot grid when `activities.time_slots` is populated and a real
 * `<input type="time">` when it is not, so both are handled.
 */
export async function addActivityToTrip(
  page: Page,
  options: { date?: string; guests?: number } = {},
): Promise<void> {
  const date = options.date ?? travelDate()
  const guests = options.guests ?? 3

  const panel = page.locator('aside.bt-booking')
  await expect(panel, 'the activity page has no booking engine').toBeVisible()

  /*
   * Wait for hydration before touching the form.
   *
   * The date field is a controlled input whose `min` is set in a post-mount
   * effect — "today in Bali" is read from the clock, and baking it into the
   * server render trips a hydration mismatch across a midnight boundary. A
   * value typed into the pre-hydration DOM is therefore discarded the instant
   * React attaches and re-renders with its own (empty) state, and the booking
   * then fails validation with "Please choose a date." for reasons that have
   * nothing to do with the product.
   *
   * `min` appearing is the precise signal that the effect has run, so it is
   * what we wait for.
   */
  const dateField = panel.locator('input[type="date"]')
  await expect(dateField, 'the booking form never hydrated').not.toHaveAttribute('min', '')

  await dateField.fill(date)
  await expect(dateField, 'the date did not stick — the form re-rendered under us').toHaveValue(
    date,
  )

  const slots = panel.locator('.bt-slot')
  if ((await slots.count()) > 0) {
    await slots.first().click()
    await expect(slots.first()).toHaveAttribute('aria-pressed', 'true')
  } else {
    await panel.locator('input[type="time"]').fill('09:00')
  }

  // The stepper starts at 2; step up to the requested guest count so the
  // quantity that reaches the cart is one the test chose, not the default.
  const readout = panel.getByRole('spinbutton')
  const increase = panel.getByRole('button', { name: /increase|\+/i }).first()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = Number(await readout.getAttribute('aria-valuenow'))
    if (current >= guests) break
    await increase.click()
  }
  await expect(readout).toHaveAttribute('aria-valuenow', String(guests))

  await panel.getByRole('button', { name: 'Add to my trip' }).click()
}

/**
 * Assert the trip actually contains what was just added.
 *
 * Every downstream step — the cart page, the checkout summary, the pay button,
 * the payment intent — is conditional on the cart being non-empty, so without
 * this the whole journey fails as a chain of "element not found" timeouts that
 * name the wrong thing. One explicit check here turns that into a single
 * sentence about the actual defect.
 */
export async function expectTripHasItems(page: Page): Promise<void> {
  const count = await cartCountCookie(page)

  expect(
    count,
    'Nothing reached the server-owned cart. "Add to my trip" reports success to the ' +
      'customer (the toast fires and validation passes) but performs no mutation — ' +
      'BookingEngine.commit() only raises a toast and dispatches CART_CHANGED_EVENT, ' +
      'and addToCartAction() in src/app/[locale]/cart/actions.ts has no callers anywhere ' +
      'in the app. Everything downstream of this point is unreachable.',
  ).toBeGreaterThan(0)
}

/**
 * Read the header's cart badge.
 *
 * `bt_cart_count` is a non-httpOnly cookie written by every cart mutation, so
 * this is both what the badge shows and a direct read of whether the server
 * believes anything was added.
 */
export async function cartCountCookie(page: Page): Promise<number | null> {
  const cookies = await page.context().cookies()
  const badge = cookies.find((cookie) => cookie.name === 'bt_cart_count')
  return badge === undefined ? null : Number(badge.value)
}
