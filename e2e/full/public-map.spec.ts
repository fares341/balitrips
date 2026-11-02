import { expect, test, type Page } from '@playwright/test'

/**
 * Map v2 (owner concept, Nov 2026): area → 1–3 types → results, on phone and
 * desktop (both projects run this file). Runs against the seeded CI copy.
 */

const isDesk = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024

async function dismissConsent(page: Page) {
  await page
    .locator('.bt-consent .bt-consent-btn.primary')
    .last()
    .click({ timeout: 3000 })
    .catch(() => {})
}

test.describe('map v2', () => {
  test('three-step flow, URL state and the back button', async ({ page }) => {
    await page.goto('/en/map')
    await dismissConsent(page)

    if (isDesk(page)) {
      // One screen: filters beside the map.
      await expect(page.getByRole('heading', { name: 'Where will you be in Bali?' })).toBeVisible()
      await page.getByRole('button', { name: 'All of Bali' }).click()
      await expect(page).toHaveURL(/area=all/)
      const free = page.locator('.mx-cat:not(.is-locked)')
      await expect(free.first()).toBeVisible()
      await free.first().click()
      await expect(page).toHaveURL(/area=all&cat=[a-z-]+$/)
      await expect(page.locator('.mx-card')).toBeVisible({ timeout: 20_000 })
      await page.goBack()
      await expect(page).toHaveURL(/area=all$/)
      await expect(page.locator('.mx-card')).toHaveCount(0)
      return
    }

    // Step 1
    await expect(
      page.getByRole('heading', { level: 1, name: 'Where will you be in Bali?' }),
    ).toBeVisible()
    const next = page.getByRole('button', { name: 'Next: choose what to see' })
    await page.getByRole('button', { name: 'All of Bali' }).click()
    await next.click()
    await expect(page).toHaveURL(/\?area=all$/)

    // Step 2
    await expect(
      page.getByRole('heading', { level: 1, name: 'What do you want to see?' }),
    ).toBeVisible()
    const free = page.locator('.mx-cat:not(.is-locked)')
    await free.first().click()
    await expect(free.first()).toHaveAttribute('aria-checked', 'true')
    await expect(free.first().locator('.mx-badge')).toHaveText(/^Free · \d+ places?$/)
    await page.getByRole('button', { name: 'Show the map' }).click()

    // Step 3
    await expect(page).toHaveURL(/\?area=all&cat=[a-z-]+$/)
    await expect(page.locator('.mx-pill')).toBeVisible()
    await expect(page.locator('.mx-card')).toBeVisible({ timeout: 20_000 })
    await expect(
      page.locator('.mx-card').getByRole('link', { name: 'Directions' }),
    ).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d/)

    // In-map change sheet, then the list toggle.
    await page.locator('.mx-pill').click()
    await expect(page.getByRole('dialog', { name: 'Change area and types' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'List' }).click()
    await expect(page.locator('.mx-listview .mx-row').first()).toBeVisible()

    // Back → step 2, back again → step 1.
    await page.goBack()
    await expect(
      page.getByRole('heading', { level: 1, name: 'What do you want to see?' }),
    ).toBeVisible()
    await page.goBack()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Where will you be in Bali?' }),
    ).toBeVisible()
  })

  test('a fourth type shows the inline hint and greys nothing out', async ({ page }) => {
    await page.goto('/en/map?area=all')
    await dismissConsent(page)
    const free = page.locator('.mx-cat:not(.is-locked)')
    await expect(free.first()).toBeVisible()
    const n = await free.count()
    test.skip(n < 4, `the seed has only ${n} free types with places`)
    for (let i = 0; i < 4; i += 1) await free.nth(i).click()
    await expect(page.locator('.mx-full')).toHaveText(/up to 3 types/)
    await expect(free.nth(3)).toHaveAttribute('aria-checked', 'false')
    await expect(free.nth(3)).toBeEnabled()
  })

  test('a locked VIP type opens the paywall for a visitor', async ({ page }) => {
    await page.goto('/en/map?area=all')
    await dismissConsent(page)
    const locked = page.locator('.mx-cat.is-locked')
    test.skip((await locked.count()) === 0, 'no VIP type has places in the seed')
    await expect(locked.first().locator('.mx-badge')).toHaveText(/^VIP · \d+/)
    await locked.first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('a[href*="/plans/buy/"]').first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Not now' }).click()
    await expect(dialog).toHaveCount(0)
    // Nothing was selected.
    await expect(page).toHaveURL(/\?area=all$/)
  })

  test('deep links skip the steps (old free-guide cards too)', async ({ page }) => {
    await page.goto('/en/map?area=all')
    const cat = await page.locator('.mx-cat:not(.is-locked)').first().getAttribute('data-cat')
    expect(cat).toBeTruthy()

    await page.goto(`/en/map?cat=${cat}`)
    await dismissConsent(page)
    await expect(page.locator('.mx-card')).toBeVisible({ timeout: 20_000 })
    if (!isDesk(page)) await expect(page.locator('.mx-pill')).toContainText('All of Bali')

    // The home page's hospitals card: plural key still resolves.
    const response = await page.goto('/ar/map?cat=hospitals')
    expect(response?.ok()).toBe(true)
  })

  test('locked places never leave the server', async ({ page, request }) => {
    await page.goto('/en/map?area=all')
    const locked = page.locator('.mx-cat.is-locked')
    test.skip((await locked.count()) === 0, 'no VIP type has places in the seed')
    const key = await locked.first().getAttribute('data-cat')
    const api = await request.get(`/api/map/places?area=all&cat=${key}&locale=en`)
    expect(api.ok()).toBe(true)
    const body = (await api.json()) as { places: unknown[]; lockedCount: number }
    expect(body.places).toEqual([])
    expect(body.lockedCount).toBeGreaterThan(0)

    // The step pages carry counts only: no coordinates at all.
    const html = await (await request.get(`/en/map?area=all&cat=${key}`)).text()
    expect(html).not.toMatch(/-8\.\d{3,},\s*11[45]\.\d{3,}|"lat":-8\.\d/)
  })
})
