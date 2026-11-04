import { expect, test, type Page } from '@playwright/test'

/**
 * Map v3 (owner, Nov 2026 — reference UX): the map is the landing page.
 * Header (back · title · list), filter chips, clustered pins drawn by
 * MapLibre, and a snap carousel of cards synced with the selected pin.
 * Runs on phone and desktop (both projects) against the seeded CI copy.
 */

async function dismissConsent(page: Page) {
  await page
    .locator('.bt-consent .bt-consent-btn.primary')
    .last()
    .click({ timeout: 3000 })
    .catch(() => {})
}

async function openMap(page: Page, path = '/en/map') {
  await page.goto(path)
  await dismissConsent(page)
  await expect(page.locator('.mx3-head')).toBeVisible()
}

/** Tag the live MapLibre instance so a later check can tell if it was re-created. */
async function tagMap(page: Page) {
  await page.waitForSelector('[data-map-ready]', { timeout: 60_000 })
  await page.evaluate(() => {
    const el = document.querySelector('.mx-canvas') as HTMLElement & { __map?: { __tag?: string } }
    if (el.__map) el.__map.__tag = 'first'
  })
}

async function mapTag(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.mx-canvas') as HTMLElement & { __map?: { __tag?: string } }
    return el.__map?.__tag ?? null
  })
}

test.describe('map v3', () => {
  test('map-first landing: header, chips, cards, list toggle', async ({ page }) => {
    await openMap(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Bali' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
    await expect(page.locator('[data-chip=cats]')).toHaveText(/Categories/)
    const card = page.locator('.mx3-card').first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.mx3-card.is-on')).toHaveCount(1)
    await expect(card.locator('a[href*="/places/"]')).toBeVisible()

    // List view shows the same places; a row selects and returns to the map.
    await page.getByRole('button', { name: 'List view' }).click()
    const rows = page.locator('.mx3-row')
    await expect(rows.first()).toBeVisible()
    const row = rows.nth(Math.min(1, (await rows.count()) - 1))
    const name = (await row.locator('strong').textContent()) ?? ''
    await row.click()
    await expect(page.locator('.mx3-list')).toHaveCount(0)
    await expect(page.locator('.mx3-card.is-on')).toContainText(name.trim())
  })

  test('filters change data without re-creating the map', async ({ page }) => {
    await openMap(page)
    await expect(page.locator('.mx3-card').first()).toBeVisible({ timeout: 30_000 })
    await tagMap(page)

    await page.locator('[data-chip=cats]').click()
    const dialog = page.getByRole('dialog', { name: 'Categories' })
    await expect(dialog).toBeVisible()
    const free = dialog.locator('.mx-cat:not(.is-locked)')
    await expect(free.first()).toBeVisible()
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/map/places') && r.ok()),
      free.first().click(),
    ])
    await expect(free.first()).toHaveAttribute('aria-checked', 'true')
    await expect(page).toHaveURL(/cat=[a-z-]+/)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.locator('.mx3-card').first()).toBeVisible()
    expect(await mapTag(page)).toBe('first')

    // Traveler type / Duration chips exist only when some place has the data.
    for (const kind of ['traveler', 'dur'] as const) {
      const chip = page.locator(`[data-chip=${kind}]`)
      if ((await chip.count()) === 0) continue
      await chip.click()
      await page.getByRole('dialog').getByRole('checkbox').first().click()
      await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
      expect(await mapTag(page)).toBe('first')
    }
  })

  test('a locked VIP type opens the paywall for a visitor', async ({ page }) => {
    await openMap(page)
    await page.locator('[data-chip=cats]').click()
    const locked = page.locator('.mx-sheet .mx-cat.is-locked')
    test.skip((await locked.count()) === 0, 'no VIP type has places in the seed')
    await expect(locked.first().locator('.mx-badge')).toHaveText(/^VIP · \d+/)
    await locked.first().click()
    const paywall = page.locator('.mx-sheet.is-paywall')
    await expect(paywall).toBeVisible()
    await expect(paywall.locator('a[href*="/plans/buy/"]').first()).toBeVisible()
    await paywall.getByRole('button', { name: 'Not now' }).click()
    await expect(paywall).toHaveCount(0)
    // Nothing was selected.
    expect(new URL(page.url()).searchParams.get('cat')).toBeNull()
  })

  test('deep links: old category links and ?place=', async ({ page, request }) => {
    const api = await request.get('/api/map/places?locale=en')
    expect(api.ok()).toBe(true)
    const body = (await api.json()) as {
      places: { slug: string; name: string; categoryKey: string }[]
    }
    const first = body.places[0]
    test.skip(!first, 'no open place in the seed')

    await openMap(page, `/en/map?cat=${first!.categoryKey}`)
    await expect(page.locator('[data-chip=cats].is-on')).toBeVisible()
    await expect(page.locator('.mx3-card').first()).toBeVisible({ timeout: 30_000 })

    await openMap(page, `/en/map?place=${first!.slug}`)
    await expect(page.locator('.mx3-card.is-on')).toContainText(first!.name, { timeout: 30_000 })

    // The home page's hospitals card: plural key still resolves.
    const response = await page.goto('/ar/map?cat=hospitals')
    expect(response?.ok()).toBe(true)
  })

  test('locked places never leave the server', async ({ page, request }) => {
    await openMap(page)
    await page.locator('[data-chip=cats]').click()
    const locked = page.locator('.mx-sheet .mx-cat.is-locked')
    test.skip((await locked.count()) === 0, 'no VIP type has places in the seed')
    const key = await locked.first().getAttribute('data-cat')
    const api = await request.get(`/api/map/places?area=all&cat=${key}&locale=en`)
    expect(api.ok()).toBe(true)
    const body = (await api.json()) as { places: unknown[]; lockedCount: number }
    expect(body.places).toEqual([])
    expect(body.lockedCount).toBeGreaterThan(0)

    // «Everything» still redacts: no VIP-only category in the open results.
    const all = (await (await request.get('/api/map/places?locale=en')).json()) as {
      places: { categoryKey: string }[]
      lockedCount: number
    }
    expect(all.places.some((one) => one.categoryKey === key)).toBe(false)
    expect(all.lockedCount).toBeGreaterThanOrEqual(body.lockedCount)

    // The page itself carries counts only: no coordinates at all.
    const html = await (await request.get(`/en/map?cat=${key}`)).text()
    expect(html).not.toMatch(/-8\.\d{3,},\s*11[45]\.\d{3,}|"lat":-8\.\d/)
  })
})
