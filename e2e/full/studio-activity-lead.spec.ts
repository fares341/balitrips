import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, type Page } from '@playwright/test'

import { closeDb, db } from '../support/db'
import { test } from '../support/fixtures'

import { ADMIN, OUT_DIR, settle, signInAs } from './_support'

/**
 * «أقرب موعد للحجز» (migration 0037), end to end:
 *
 *   1. Studio → activity → booking tab: set «من بعد الغد» (after 2 days).
 *   2. Public page: today and tomorrow (Bali) are disabled in the calendar,
 *      the day after is open, and «أقرب موعد متاح» names it.
 *   3. A forged request: the browser picks the open day, the request is
 *      rewritten in flight to today — the server refuses it, nothing is added.
 *
 * Screenshots (1440 and 390) go to full-test-out/shots/lead-*.
 */

test.describe.configure({ mode: 'serial' })
test.skip(!process.env.ACCOUNTS_FILE, 'test accounts not created')

const SHOTS = resolve(OUT_DIR, 'shots')
mkdirSync(SHOTS, { recursive: true })

const SLUG = 'mount-batur-sunrise-hike'

let page: Page
let activityId = ''
let original: { lead: number; days: number | null; cutoff: string | null } | null = null

function baliDay(offset: number): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + offset)).toISOString().slice(0, 10)
}

async function shots(name: string): Promise<void> {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: resolve(SHOTS, `lead-${name}-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

/** The visible calendar cell for a day, paging forward a month if needed. */
async function dayCell(day: string) {
  const cal = page.locator('.cal:visible').first()
  const cell = cal.locator(`button[data-date="${day}"]`)
  if ((await cell.count()) === 0) {
    await cal.locator('.cal-nav button').last().click()
  }
  return cal.locator(`button[data-date="${day}"]`)
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.37' },
    viewport: { width: 1440, height: 900 },
  })
  page = await context.newPage()
  const [found] = await db()`
    select id, lead_time_hours, min_advance_days, booking_cutoff
    from activities where slug = ${SLUG}`
  expect(found, `seeded activity ${SLUG} missing`).toBeTruthy()
  activityId = String(found?.id)
  original = {
    lead: Number(found?.lead_time_hours),
    days: (found?.min_advance_days as number | null) ?? null,
    cutoff: (found?.booking_cutoff as string | null) ?? null,
  }
  await signInAs(page, 'admin')
})

test.afterAll(async () => {
  if (original && activityId) {
    await db()`
      update activities
      set lead_time_hours = ${original.lead},
          min_advance_days = ${original.days},
          booking_cutoff = ${original.cutoff}
      where id = ${activityId}`
  }
  await closeDb()
})

test('Studio: set the earliest booking day to «after 2 days»', async () => {
  await page.goto(`${ADMIN}/activities/${activityId}?tab=booking`)
  await settle(page)
  const card = page.getByTestId('earliest-booking')
  await expect(card).toBeVisible()
  await page.locator('#advanceMode').selectOption('day_after')
  await page.locator('#leadTimeHours').fill('0')
  await page.locator('#bookingCutoff').fill('')
  await card.scrollIntoViewIfNeeded()
  await shots('studio-control')

  const before = page.url()
  await page.locator('form.a-form > .a-actions button[type="submit"]').first().click()
  await page.waitForURL((url) => url.href !== before, { timeout: 30_000 }).catch(() => {})
  await settle(page)
  expect(page.url()).not.toContain('err=')

  const [row] = await db()`
    select lead_time_hours, min_advance_days, booking_cutoff from activities where id = ${activityId}`
  expect(row?.min_advance_days).toBe(2)
  expect(row?.lead_time_hours).toBe(0)
  expect(row?.booking_cutoff ?? null).toBeNull()

  // Invalid N days is refused with a clear message.
  await page.goto(`${ADMIN}/activities/${activityId}?tab=booking`)
  await settle(page)
  await page.locator('#advanceMode').selectOption('days')
  // Bypass the browser's own min=1 check so the server's validation is what answers.
  await page.locator('#advanceDays').evaluate((el) => el.removeAttribute('min'))
  await page.locator('#advanceDays').fill('0')
  const again = page.url()
  await page.locator('form.a-form > .a-actions button[type="submit"]').first().click()
  await page.waitForURL((url) => url.href !== again, { timeout: 30_000 }).catch(() => {})
  await settle(page)
  expect(page.url()).toContain('err=')
  const [still] = await db()`select min_advance_days from activities where id = ${activityId}`
  expect(still?.min_advance_days).toBe(2)
})

test('calendar disables today and tomorrow, and names the earliest day', async () => {
  await page.goto(`/en/activities/${SLUG}`)
  await settle(page)
  const today = baliDay(0)
  const tomorrow = baliDay(1)
  const first = baliDay(2)

  await expect(await dayCell(today)).toBeDisabled()
  await expect(await dayCell(tomorrow)).toBeDisabled()
  await expect(await dayCell(first)).toBeEnabled()
  const note = page.getByTestId('earliest-note').first()
  await expect(note).toBeVisible()
  await expect(note).toContainText('Earliest available date')
  await note.scrollIntoViewIfNeeded()
  await shots('calendar')

  await page.goto(`/ar/activities/${SLUG}`)
  await settle(page)
  await expect(page.getByTestId('earliest-note').first()).toContainText('أقرب موعد متاح')
  await page.getByTestId('earliest-note').first().scrollIntoViewIfNeeded()
  await shots('calendar-ar')
})

test('the server refuses a forged date before the earliest day', async () => {
  const today = baliDay(0)
  const first = baliDay(2)
  await page.goto(`/en/activities/${SLUG}`)
  await settle(page)

  const [{ n: beforeCount } = { n: 0 }] = await db()`
    select count(*)::int as n from cart_items where ref_id = ${activityId} and travel_date < ${first}`

  // Rewrite the server action's payload in flight: the date the calendar
  // allowed becomes today, as a hand-crafted request would send it.
  let forged = false
  await page.route('**/*', async (route) => {
    const request = route.request()
    const body = request.postData()
    if (request.method() === 'POST' && request.headers()['next-action'] && body?.includes(first)) {
      forged = true
      await route.continue({ postData: body.split(first).join(today) })
      return
    }
    await route.continue()
  })

  await (await dayCell(first)).click()
  const slot = page.locator('.slots .slot:not([disabled])').first()
  if ((await slot.count()) > 0) await slot.click()
  await page.getByRole('button', { name: 'Add to My Trip' }).first().click()

  await expect(page.getByText('too soon to book').first()).toBeVisible({ timeout: 20_000 })
  expect(forged, 'the booking request was never sent').toBe(true)
  const [{ n: afterCount } = { n: 0 }] = await db()`
    select count(*)::int as n from cart_items where ref_id = ${activityId} and travel_date < ${first}`
  expect(afterCount).toBe(beforeCount)
  await page.unroute('**/*')
})
