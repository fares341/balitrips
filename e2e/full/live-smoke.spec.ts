import { expect, test } from '@playwright/test'

import { check } from './_support'

/**
 * READ-ONLY smoke of the live site. Every non-GET request is aborted before
 * it leaves the browser, so a click on a submit button can never create a
 * message, account, order or lead — only client-side validation can run.
 */

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const method = route.request().method()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue()
    return route.abort('blockedbyclient')
  })
})

const PAGES: [string, string][] = [
  ['/en', 'home'],
  ['/ar', 'home ar'],
  ['/en/contact', 'contact'],
  ['/ar/contact', 'contact ar'],
  ['/en/custom', 'custom trip'],
  ['/en/search', 'search'],
  ['/en/blog', 'blog'],
  ['/en/help', 'help'],
  ['/en/activities', 'activities'],
  ['/en/itineraries', 'itineraries'],
  ['/en/plans', 'plans'],
  ['/en/register', 'register'],
  ['/en/account?signin=1', 'sign-in'],
  ['/en/cart', 'cart'],
]

for (const [path, name] of PAGES) {
  test(`live ${name} loads and its inputs render`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    check(
      info,
      `live ${name}`,
      'status < 400',
      (response?.status() ?? 0) < 400,
      `${response?.status()}`,
    )
    const inputs = await page.locator('input:visible, textarea:visible, select:visible').count()
    check(
      info,
      `live ${name}`,
      'has visible inputs',
      inputs > 0 ||
        name.startsWith('home') ||
        name === 'custom trip' ||
        name === 'cart' ||
        name.startsWith('activities') ||
        name.startsWith('itineraries') ||
        name === 'plans',
      `${inputs}`,
    )
    check(info, `live ${name}`, 'no uncaught JS errors', errors.length === 0, errors.join(' | '))
  })
}

test('live contact: client validation on empty submit (nothing sent)', async ({ page }, info) => {
  await page.goto('/en/contact')
  const valid = await page.evaluate(() => {
    const form = [...document.querySelectorAll('form')].find((f) => f.querySelector('textarea'))
    return form ? form.checkValidity() : null
  })
  check(info, 'live contact', 'empty form is invalid in the browser', valid === false, `${valid}`)
  await page.locator('input[type="email"]').first().fill('not-an-email')
  const emailValid = await page
    .locator('input[type="email"]')
    .first()
    .evaluate((el: HTMLInputElement) => el.validity.valid)
  check(info, 'live contact', 'bad email flagged', emailValid === false)
})

test('live register: client validation messages (nothing sent)', async ({ page }, info) => {
  await page.goto('/en/register')
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  const pw = page.locator('input[autocomplete="new-password"]')
  await pw.nth(0).fill('short')
  await page
    .locator('form:has(input[autocomplete="new-password"]) button[type="submit"]')
    .first()
    .click()
  await expect(page.getByText('Password must be at least 8 characters.').first())
    .toBeVisible({ timeout: 10_000 })
    .catch(() => {})
  check(
    info,
    'live register',
    'short password message',
    await page.getByText('Password must be at least 8 characters.').first().isVisible(),
  )
})
