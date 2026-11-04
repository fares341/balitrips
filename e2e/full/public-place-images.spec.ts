import { expect, test, type Page } from '@playwright/test'

/**
 * Place photos never show the browser's broken-image glyph (owner report,
 * Nov 2026: "photos sometimes don't show").
 *
 * Every place image now walks retry -> smaller ladder rung -> placeholder
 * (src/lib/media/fallback.ts). Here the media origin is made to fail on
 * purpose and the page must end with only loaded images or placeholders.
 */

async function dismissConsent(page: Page) {
  await page
    .locator('.bt-consent .bt-consent-btn.primary')
    .last()
    .click({ timeout: 3000 })
    .catch(() => {})
}

/** Images in the document that finished loading and are broken. */
async function brokenImages(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.images]
      .filter((img) => img.complete && img.naturalWidth === 0 && img.currentSrc !== '')
      .map((img) => img.currentSrc),
  )
}

test.describe('place images', () => {
  test('map cards fall back down the ladder when a rung 404s', async ({ page }) => {
    // Every rung except 320 is "missing": the cards must land on 320.webp.
    await page.route(/\/media\/[0-9a-f-]{36}\/(?!320\.webp)\d+\.(webp|avif)/, (route) =>
      route.fulfill({ status: 404, body: 'Not found' }),
    )
    await page.goto('/en/map')
    await dismissConsent(page)
    const card = page.locator('.mx3-card').first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('.mx3-thumb')).toBeVisible()
    await expect.poll(() => brokenImages(page), { timeout: 15_000 }).toEqual([])
  })

  test('map cards and a place page show placeholders when all media fails', async ({ page }) => {
    await page.route(/\/media\//, (route) => route.fulfill({ status: 503, body: 'down' }))
    await page.goto('/en/map')
    await dismissConsent(page)
    const card = page.locator('.mx3-card').first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.locator('[data-testid=place-ph]')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => brokenImages(page), { timeout: 15_000 }).toEqual([])

    const href = await card.locator('a[href*="/places/"]').getAttribute('href')
    expect(href).toBeTruthy()
    await page.goto(href!)
    await expect.poll(() => brokenImages(page), { timeout: 15_000 }).toEqual([])
  })

  test('a transient failure is retried and the real photo shows', async ({ page }) => {
    const failed = new Set<string>()
    await page.route(/\/media\/[0-9a-f-]{36}\/\d+\.(webp|avif)/, (route) => {
      const url = route.request().url()
      if (!url.includes('img-retry') && !failed.has(url)) {
        failed.add(url)
        return route.fulfill({ status: 502, body: 'bad gateway' })
      }
      return route.continue()
    })
    await page.goto('/en/map')
    await dismissConsent(page)
    const thumb = page.locator('.mx3-card').first().locator('img.mx3-thumb')
    await expect(thumb).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0)
    await expect.poll(() => brokenImages(page), { timeout: 15_000 }).toEqual([])
  })
})
