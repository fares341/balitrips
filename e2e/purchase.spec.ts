import { type Page } from '@playwright/test'

import { expect, test } from './support/fixtures'

import { closeDb, db, orderStatus } from './support/db'

/**
 * C2 — the whole purchase path in the payment test mode CI supports (the
 * sandbox provider, whose 3-D Secure page stands in for Stripe test mode):
 *
 *  1. itinerary: «Itinerary only» → continue → pay → the PDF is in the
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
  // The gateway only takes SAR: the payment step says so, with the amount.
  const chargeNote = page.locator('[data-testid="charge-note"]')
  await expect(chargeNote.first(), 'no SAR charge note on the payment step').toContainText(
    /charged in Saudi riyals: SAR\s?[\d,.]+/,
  )
  await expect(page.getByRole('button', { name: /^Pay/ })).toContainText('SAR')
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
    .toMatch(/paid|confirmed|authorized/)
  // Bookings are only authorised until the supplier confirms (client, Oct
  // 2026); digital products are paid at once.
  await expect(page.getByRole('heading', { name: /Payment successful|Amount held/ })).toBeVisible({
    timeout: 30_000,
  })
  return orderNumber
}

/**
 * Pick an open day well ahead. Near the end of a month the months on screen
 * (one on mobile) can hold fewer than four open days, so the calendar is
 * moved one month forward first: that month is always entirely ahead.
 */
async function pickDate(scope: ReturnType<Page['locator']>): Promise<void> {
  const calendar = scope.locator('.cal').first()
  await expect(calendar, 'no calendar').toBeVisible()
  await calendar.locator('.cal-nav button').last().click()
  const month = calendar.locator('.cal-m').last()
  await month.locator('button.cd:not([disabled]):not(.un)').nth(3).click()
}

test.afterAll(async () => {
  await closeDb()
})

test('itinerary pages: no day content, places or PDF links in the public HTML', async ({
  request,
}) => {
  const rows = await db()<{ id: string; slug: string }[]>`
    select id, slug from itineraries
    where status = 'published' and deleted_at is null order by created_at limit 3`
  for (const row of rows) {
    // Every name the plan is made of: day titles, activities, linked places.
    const secrets = await db()<{ text: string }[]>`
      select v.text from (
        select jsonb_each_text(d.title) as kv from itinerary_days d where d.itinerary_id = ${row.id}
        union all
        select jsonb_each_text(a.name) from itinerary_days d
          join activities a on a.id = d.activity_id where d.itinerary_id = ${row.id}
        union all
        select jsonb_each_text(p.name) from itinerary_day_places dp
          join itinerary_days d on d.id = dp.day_id
          join map_places p on p.id = dp.place_id where d.itinerary_id = ${row.id}
      ) s, lateral (select (s.kv).value as text) v
      where length((s.kv).value) >= 6`
    for (const locale of ['ar', 'en']) {
      // Site chrome (menus, the message bundle) names famous spots on every
      // page; only what this page adds counts.
      const chrome = await (await request.get(`/${locale}/contact`)).text()
      const html = await (await request.get(`/${locale}/itineraries/${row.slug}`)).text()
      expect(html).not.toContain('linkedPlaceIds')
      expect(html).not.toMatch(/\.pdf\b|\/file\b|uploadedPdf/i)
      for (const secret of secrets) {
        if (chrome.includes(secret.text)) continue
        expect(html, `"${secret.text}" leaked on /${locale}/itineraries/${row.slug}`).not.toContain(
          secret.text,
        )
      }
    }
  }
})

test('itinerary: choose a package, continue, pay, download the PDF', async ({ page }) => {
  const [row] = await db()<{ slug: string }[]>`
    select i.slug from itineraries i
    where i.status = 'published' and i.deleted_at is null and i.sale_digital
      and exists (select 1 from itinerary_documents d where d.itinerary_id = i.id)
    order by i.created_at limit 1`
  expect(row, 'no published itinerary with a rendered PDF').toBeDefined()

  await signUp(page, 'itin')
  await page.goto(`/en/itineraries/${row?.slug}`)

  // Phase 2: the package box — «Itinerary only», then «Continue» → checkout.
  const box = page.locator('#it-buy')
  await box.getByRole('radio', { name: /Itinerary only/ }).check()
  await box.getByRole('button', { name: 'Continue' }).first().click()
  await page.waitForURL(/\/checkout/, { timeout: 30_000 })

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

test('package: request with date, travellers and vehicle', async ({ page }) => {
  const [row] = await db()<{ slug: string }[]>`
    select slug from packages where status = 'published' and deleted_at is null
    order by created_at limit 1`
  test.skip(row === undefined, 'no published package (the demo packages are drafts)')

  await signUp(page, 'pkg')
  await page.goto(`/en/packages/${row?.slug}`)
  const aside = page.locator('aside.bt-booking')
  // Client, Oct 2026: a request with an estimate, not an instant purchase.
  await expect(aside.getByText('Estimated total')).toBeVisible()
  await pickDate(aside)
  await aside.getByLabel('Name').fill('Package Check')
  await aside.getByLabel('Email').fill('package-check@example.com')
  await aside.getByLabel('Phone / WhatsApp').fill('+6281234567890')
  await aside.getByRole('button', { name: 'Send package request' }).click()
  await expect(page.getByText('We have your request')).toBeVisible({ timeout: 30_000 })
})
