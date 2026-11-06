import { type Browser } from '@playwright/test'

import { expect, test } from './support/fixtures'

/**
 * One base currency (SAR) and the visitor's «≈» display currency.
 *
 *  - the proxy decides the currency on the server (CDN geo header, else IP,
 *    else Accept-Language) and the runtime in <head> applies it before first
 *    paint, so the price is already right in the first frame;
 *  - a Saudi visitor sees exact SAR, an Egyptian visitor «≈ … ج.م»;
 *  - the switcher cookie wins; JSON-LD stays SAR;
 *  - the itinerary box offers two options with «وفّر», once.
 */

async function pageAs(browser: Browser, country: string, cookies: Record<string, string> = {}) {
  const context = await browser.newContext({ extraHTTPHeaders: { 'cf-ipcountry': country } })
  const base = test.info().project.use.baseURL ?? 'http://localhost:3000'
  if (Object.keys(cookies).length > 0) {
    await context.addCookies(
      Object.entries(cookies).map(([name, value]) => ({ name, value, url: base })),
    )
  }
  return { context, page: await context.newPage() }
}

async function firstActivityHref(browser: Browser): Promise<string> {
  const { context, page } = await pageAs(browser, 'SA')
  await page.goto('/ar/activities')
  const href = await page.locator('a[href*="/ar/activities/"]').first().getAttribute('href')
  await context.close()
  expect(href, 'no activity on /ar/activities').toBeTruthy()
  return href!
}

test('an Egyptian visitor sees ≈ EGP from the first frame; a Saudi visitor sees SAR', async ({
  browser,
}) => {
  const href = await firstActivityHref(browser)

  const eg = await pageAs(browser, 'EG')
  await eg.page.goto(href)
  await expect(eg.page.locator('html')).toHaveAttribute('data-cur', 'EGP')
  const egPrice = eg.page.locator('[data-money]').first()
  await expect(egPrice).toContainText('≈')
  await expect(egPrice).toContainText('ج.م')
  // SEO stays in SAR whatever the visitor sees.
  const ld = await eg.page.locator('script[type="application/ld+json"]').allTextContents()
  expect(ld.join('\n')).toContain('"priceCurrency":"SAR"')
  await eg.context.close()

  const sa = await pageAs(browser, 'SA')
  await sa.page.goto(href)
  await expect(sa.page.locator('html')).toHaveAttribute('data-cur', 'SAR')
  const saPrice = sa.page.locator('[data-money]').first()
  await expect(saPrice).toContainText('ر.س')
  await expect(saPrice).not.toContainText('≈')
  await sa.context.close()
})

test('the switcher choice (cookie) wins over the country', async ({ browser }) => {
  const href = await firstActivityHref(browser)
  const { context, page } = await pageAs(browser, 'EG', { bt_cur_choice: 'USD' })
  await page.goto(href)
  await expect(page.locator('html')).toHaveAttribute('data-cur', 'USD')
  await expect(page.locator('[data-money]').first()).toContainText('≈')
  await context.close()
})

test('an old bt_currency override is ignored and cleared; the switcher shows the effective currency', async ({
  browser,
}) => {
  const href = await firstActivityHref(browser)
  const { context, page } = await pageAs(browser, 'EG', { bt_currency: 'SAR' })
  await page.goto(href)
  await expect(page.locator('html')).toHaveAttribute('data-cur', 'EGP')
  await expect(page.locator('select[aria-label]').first()).toHaveValue('EGP')
  const names = (await context.cookies()).map((c) => c.name)
  expect(names).not.toContain('bt_currency')
  expect(names).not.toContain('bt_cur_choice')
  await context.close()
})

test('prices stay converted after a client-side navigation', async ({ browser }) => {
  const { context, page } = await pageAs(browser, 'EG')
  await page.goto('/ar/activities')
  await expect(page.locator('html')).toHaveAttribute('data-cur', 'EGP')
  await page.locator('a[href*="/ar/activities/"]').first().click()
  await page.waitForURL(/\/ar\/activities\/.+/)
  await expect(page.locator('[data-money]:not([data-money-mode])').first()).toContainText('ج.م')
  await context.close()
})

test('no page mixes US$ with ر.س for a Saudi visitor', async ({ browser }) => {
  const { context, page } = await pageAs(browser, 'SA')
  for (const path of ['/ar/activities', '/ar/itineraries', '/ar/plans']) {
    await page.goto(path)
    const text = await page.locator('main').innerText()
    expect(text, path).not.toMatch(/US\$|\$\s?\d/)
  }
  await context.close()
})

test('the itinerary box offers the plan and the plan + map, once each', async ({ browser }) => {
  const { context, page } = await pageAs(browser, 'SA')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/ar/itineraries')
  const href = await page.locator('a[href*="/ar/itineraries/"]').first().getAttribute('href')
  await page.goto(href!)
  const box = page.getByTestId('itp-box')
  await box.scrollIntoViewIfNeeded()
  const options = box.locator('.itp-opt')
  const count = await options.count()
  expect(count).toBeGreaterThanOrEqual(1)
  const labels = await options.locator('.itp-opt-head b').allInnerTexts()
  expect(new Set(labels).size, `duplicate options: ${labels.join(' | ')}`).toBe(labels.length)
  if (count === 2) await expect(box.locator('.itp-save')).toContainText('وفّر')
  // The phone bar does not repeat the box while the box is on screen.
  await expect(page.getByTestId('itp-mbar')).toBeHidden()
  await context.close()
})
