import { expect, test, type Page } from '@playwright/test'

import { closeDb, db, orderStatus } from './support/db'

/**
 * C2 — the whole purchase path in the payment test mode CI supports (the
 * sandbox provider, whose 3-D Secure page stands in for Stripe test mode):
 *
 *  1. itinerary: choose who it is for → buy → pay → the PDF is in the
 *     account and downloads as a real PDF (desktop and phone);
 *  2. an activity package (tier): choose → date → time → trip → pay →
 *     confirmation;
 *  3. a package: date → trip → pay → confirmation.
 *
 * Run by the purchase job of .github/workflows/preview-shots.yml against the
 * server it starts (`E2E_BASE_URL`).
 */

const ORDER_NUMBER = /\bBT-\d{4}-\d{4,}\b/

async function signUp(page: Page, tag: string): Promise<void> {
  const stamp = `${Date.now()}`.slice(-7) + `${Math.floor(Math.random() * 90 + 10)}`
  await page.goto('/en/register')
  await page.locator('input[autocomplete="name"]').fill('Purchase Check')
  await page.locator('input[autocomplete="email"]').fill(`buy-${tag}-${stamp}@example.com`)
  await page.locator('input[autocomplete="tel"]').fill(`+62812${stamp.slice(-8)}`)
  const pw = page.locator('input[autocomplete="new-password"]')
  await pw.nth(0).fill('Bali-Trips-2026!')
  await pw.nth(1).fill('Bali-Trips-2026!')
  await page
    .locator('form:has(input[autocomplete="new-password"]) button[type="submit"]')
    .first()
    .click()
  await expect(page, 'sign-up did not leave the register page').not.toHaveURL(/\/register/, {
    timeout: 30_000,
  })
}

/** Checkout → pay in the sandbox → confirmation; returns the paid order number. */
async function payTrip(page: Page): Promise<string> {
  await page.goto('/en/checkout')
  const toReview = page.getByRole('button', { name: 'Continue to review' })
  await expect(toReview, 'checkout did not open with the trip').toBeVisible()
  await toReview.click()
  await page.locator('input[name="terms"]').check()
  await page.getByRole('button', { name: 'Continue to payment' }).click()
  await page.getByRole('button', { name: /^Pay/ }).click()

  await expect(page, 'no payment was started').toHaveURL(/\/api\/payments\/sandbox\/challenge/, {
    timeout: 30_000,
  })
  await page.getByRole('button', { name: 'Approve' }).click()
  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60_000 })

  const orderNumber = ORDER_NUMBER.exec(page.url())?.[0] ?? ''
  expect(orderNumber, 'the confirmation URL carries no order number').not.toBe('')
  await expect(page.getByText(orderNumber).first()).toBeVisible()
  await expect
    .poll(() => orderStatus(orderNumber), { timeout: 60_000, message: 'order never paid' })
    .toMatch(/paid|confirmed/)
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible({
    timeout: 30_000,
  })
  return orderNumber
}

/** Pick the first open day in the second month the calendar shows. */
async function pickDate(scope: ReturnType<Page['locator']>): Promise<void> {
  const month = scope.locator('.cal-m').last()
  await expect(month, 'no calendar').toBeVisible()
  await month.locator('button.cd:not([disabled]):not(.un)').nth(3).click()
}

test.afterAll(async () => {
  await closeDb()
})

test('itinerary: choose audience, buy, pay, download the PDF', async ({ page }) => {
  const [row] = await db()<{ slug: string }[]>`
    select i.slug from itineraries i
    where i.status = 'published' and i.deleted_at is null and i.sale_digital
      and exists (select 1 from itinerary_documents d where d.itinerary_id = i.id)
    order by i.created_at limit 1`
  expect(row, 'no published itinerary with a rendered PDF').toBeDefined()

  await signUp(page, 'itin')
  await page.goto(`/en/itineraries/${row?.slug}`)

  // The buy button is a real control in the sidebar (H1: audience first).
  const box = page.locator('#it-buy')
  const buy = box.getByRole('button', { name: 'Get this itinerary' })
  await expect(buy).toBeVisible()
  const audience = box.locator('.it-audience input[type="radio"]')
  if ((await audience.count()) > 0) {
    await buy.click()
    await expect(box.getByRole('alert'), 'buying without an audience was allowed').toBeVisible()
    await audience.first().check()
  }
  await buy.click()
  await page.waitForURL(/\/my-trip/, { timeout: 30_000 })

  const orderNumber = await payTrip(page)

  await page.goto('/en/account/schedules')
  await expect(page.getByText(orderNumber).first()).toBeVisible()
  const download = page.getByRole('link', { name: 'Download PDF' }).first()
  const href =
    (await download.count()) > 0
      ? await download.getAttribute('href')
      : (await page.getByRole('link', { name: 'View' }).first().getAttribute('href'))?.replace(
          /\/view$/,
          '/file',
        )
  expect(href, 'the account offers no PDF').toBeTruthy()
  const response = await page.request.get(href ?? '', { headers: { 'x-bt-viewer': '1' } })
  expect(response.status(), `PDF request ${href}`).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF')
})

test('activity package: choose, date, time, pay, confirmation', async ({ page }) => {
  const [row] = await db()<{ slug: string }[]>`
    select a.slug from activities a
    where a.status = 'published' and a.deleted_at is null
      and exists (select 1 from activity_tiers t where t.activity_id = a.id)
    order by a.sort_order limit 1`
  expect(row, 'no published activity with packages').toBeDefined()

  await signUp(page, 'act')
  await page.goto(`/en/activities/${row?.slug}`)
  await page.getByRole('button', { name: 'Choose package' }).first().click()
  await pickDate(page.locator('body'))
  const groups = page.locator('.slots')
  for (let index = 0; index < (await groups.count()); index += 1) {
    const slot = groups.nth(index).locator('button.slot:not([disabled])').first()
    if ((await slot.count()) > 0) await slot.click()
  }
  await page.getByRole('button', { name: 'Add to My Trip' }).click()
  await expect(page.getByText('Activity added to My Trip').first()).toBeVisible()

  await payTrip(page)
})

test('package: date, add to trip, pay, confirmation', async ({ page }) => {
  const [row] = await db()<{ slug: string }[]>`
    select slug from packages where status = 'published' and deleted_at is null
    order by created_at limit 1`
  expect(row, 'no published package').toBeDefined()

  await signUp(page, 'pkg')
  await page.goto(`/en/packages/${row?.slug}`)
  const aside = page.locator('aside.bt-booking')
  // H5: the price always says what it is for.
  await expect(aside.getByText(/per person|whole group/).first()).toBeVisible()
  await pickDate(aside)
  await aside.getByRole('button', { name: 'Add package to trip' }).click()
  await expect(page.getByText('Added to your trip').first()).toBeVisible()

  await payTrip(page)
})
