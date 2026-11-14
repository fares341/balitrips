import { devices, expect, test, type Page } from '@playwright/test'

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
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bali Interactive Map' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
    await expect(page.locator('[data-chip=cats]')).toHaveText(/Categories/)
    const card = page.locator('.mx3-card').first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.mx3-card.is-on')).toHaveCount(1)
    await expect(card.locator('button.mx3-card-link')).toBeVisible()

    // List view shows the same places; a row selects and returns to the map.
    await page.getByRole('button', { name: 'List view' }).click()
    const rows = page.locator('.mx3-row')
    await expect(rows.first()).toBeVisible()
    const row = rows.nth(Math.min(1, (await rows.count()) - 1))
    const name = (await row.locator('strong').textContent()) ?? ''
    await row.click()
    await expect(page.locator('.mx3-list')).toHaveCount(0)
    await expect(page.locator('.mx4-sheet .mx4-name')).toHaveText(name.trim())
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

    // ?place= opens the sheet on that place.
    await openMap(page, `/en/map?place=${first!.slug}`)
    await expect(page.locator('.mx4-sheet:not([data-stop=closed]) .mx4-name')).toHaveText(
      first!.name,
      { timeout: 30_000 },
    )

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

  test('a card opens the sheet on the map; Back closes it', async ({ page }) => {
    await openMap(page)
    const card = page.locator('.mx3-card.is-on')
    await expect(card).toBeVisible({ timeout: 30_000 })
    const name = ((await card.locator('.mx3-card-link').textContent()) ?? '').trim()
    await card.locator('.mx3-card-link').click()
    const sheet = page.locator('.mx4-sheet:not([data-stop=closed])')
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.mx4-name')).toHaveText(name)
    await expect(page).toHaveURL(/\/en\/map/)
    await expect(sheet.locator('a[href*="/places/"]')).toBeVisible()
    await expect(sheet.locator('a[href^="https://www.google.com/maps/dir/"]')).toBeVisible()

    await page.goBack()
    await expect(page.locator('.mx4-sheet[data-stop=closed]')).toHaveCount(1)
    await expect(page).toHaveURL(/\/en\/map/)

    // ✕ closes too.
    await page.locator('.mx3-card.is-on .mx3-card-link').click()
    await expect(sheet).toBeVisible()
    await page.locator('.mx4-x').click()
    await expect(page.locator('.mx4-sheet[data-stop=closed]')).toHaveCount(1)
    await expect(page).toHaveURL(/\/en\/map/)
  })

  test('a pin tap selects its card on phones (the panel on desktop), stays on /map', async ({
    page,
  }) => {
    await openMap(page)
    await expect(page.locator('.mx3-card').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('[data-map-ready]', { timeout: 60_000 })
    // Zoom onto the selected pin, then tap where MapLibre draws it.
    const point = await page.evaluate(async () => {
      type M = {
        getSource(id: string): { _data?: unknown } | undefined
        querySourceFeatures(id: string): { properties: { id: string } }[]
        jumpTo(o: unknown): void
        project(c: [number, number]): { x: number; y: number }
        once(t: string, f: () => void): void
        queryRenderedFeatures(o: { layers: string[] }): {
          geometry: { coordinates: [number, number] }
          properties: { id: string }
        }[]
      }
      const el = document.querySelector('.mx-canvas') as HTMLElement & { __map?: M }
      const map = el.__map!
      const wait = () => new Promise<void>((r) => map.once('idle', () => r()))
      const sel = map.queryRenderedFeatures({ layers: ['mx-pin-on'] })[0]
      if (!sel) return null
      map.jumpTo({ center: sel.geometry.coordinates, zoom: 17 })
      await wait()
      const hit = map.queryRenderedFeatures({ layers: ['mx-pin-on', 'mx-pins'] })[0]
      if (!hit) return null
      const p = map.project(hit.geometry.coordinates)
      const box = el.getBoundingClientRect()
      return { x: box.left + p.x, y: box.top + p.y - 14, id: hit.properties.id }
    })
    test.skip(point === null, 'no pin rendered')
    await page.mouse.click(point!.x, point!.y)
    const sheet = page.locator('.mx4-sheet:not([data-stop=closed])')
    const phone = (page.viewportSize()?.width ?? 1280) < 1024
    if (phone) {
      // One surface at a time: the tap selects the card, no sheet on top of it.
      await expect(page.locator('.mx3-card.is-on')).toHaveAttribute('data-id', point!.id)
      await expect(sheet).toHaveCount(0)
      await page.locator('.mx3-card.is-on button.mx3-card-link').click()
    }
    await expect(sheet).toBeVisible()
    await expect(page).toHaveURL(/\/en\/map/)
    await page.goBack()
    await expect(page.locator('.mx4-sheet[data-stop=closed]')).toHaveCount(1)
  })

  test('near me: distance only after the tap, from the mocked position', async ({
    page,
    context,
  }) => {
    await openMap(page)
    await expect(page.locator('.mx3-card').first()).toBeVisible({ timeout: 30_000 })
    // Nothing asked on load, no distance without an origin.
    await expect(page.locator('[data-distance]')).toHaveCount(0)

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: -8.718, longitude: 115.1686 })
    await page.locator('[data-chip=near]').click()
    await expect(page.locator('[data-chip=near]')).toHaveAttribute('aria-pressed', 'true')
    const dist = page.locator('.mx3-card.is-on [data-distance]')
    await expect(dist).toHaveText(/^[\d.,]+ (m|km) away$/)
  })
})

/** What MapLibre draws right now: single pins, clusters and the places inside them. */
async function mapCounts(page: Page) {
  return page.evaluate(async () => {
    type F = { layer: { id: string }; properties: { point_count?: number } }
    type M = {
      queryRenderedFeatures(o: { layers: string[] }): F[]
      getZoom(): number
      getCenter(): { lng: number; lat: number }
      loaded(): boolean
      once(t: string, f: () => void): void
      isMoving(): boolean
    }
    const map = (document.querySelector('.mx-canvas') as HTMLElement & { __map?: M }).__map!
    if (map.isMoving() || !map.loaded()) await new Promise<void>((r) => map.once('idle', () => r()))
    const all = map.queryRenderedFeatures({ layers: ['mx-pins', 'mx-pin-on', 'mx-clusters'] })
    const clusters = all.filter((one) => one.layer.id === 'mx-clusters')
    type P = { layer: { id: string }; geometry: { coordinates: [number, number] } }
    const project = (map as unknown as { project(c: [number, number]): { x: number; y: number } })
      .project
    const singles = (all as unknown as P[])
      .filter((one) => one.layer.id === 'mx-pins')
      .map((one) => project.call(map, one.geometry.coordinates))
    const piled = singles.filter(
      (a) => singles.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < 8).length >= 2,
    ).length
    return {
      piled,
      // The selected pin is drawn on its own layer (and may also sit in a cluster).
      selected: all.filter((one) => one.layer.id === 'mx-pin-on').length,
      pins: all.length - clusters.length,
      clusters: clusters.length,
      inClusters: clusters.reduce((n, one) => n + (one.properties.point_count ?? 0), 0),
      zoom: map.getZoom(),
    }
  })
}

test.describe('map v3 — Tiqets feel', () => {
  test('opens on the whole island: every place framed, no piles of pins', async ({ page }) => {
    await openMap(page)
    await expect(page.locator('.mx3-card').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('[data-map-ready]', { timeout: 60_000 })
    const total = await page.evaluate(async () => {
      const r = await fetch('/api/map/places?locale=en')
      return ((await r.json()) as { places: unknown[] }).places.length
    })
    const c = await mapCounts(page)
    // fitBounds on all pins: every place is drawn, as a pin or inside a cluster.
    expect(c.pins + c.inClusters).toBeGreaterThanOrEqual(total)
    expect(c.pins + c.inClusters).toBeLessThanOrEqual(total + c.selected)
    // Owner, Nov 2026: no piles of pins. Three pins on one spot merge into a
    // numbered bubble, so no single pin has two others right on top of it.
    expect(c.piled).toBe(0)
    expect(c.clusters).toBeLessThanOrEqual(Math.max(1, Math.ceil(total / 4)))
  })

  test.describe('phone', () => {
    // Chromium with the iPhone 13 metrics (WebKit is not installed in CI).
    const { defaultBrowserType: _b, ...iphone } = devices['iPhone 13']
    test.use(iphone)

    // 844: iPhone 13/14; 664: the same phone with Safari's bottom bar showing.
    for (const height of [844, 664]) {
      test(`cards are always visible above the tab bar (${height}px tall)`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height })
        await openMap(page)
        const card = page.locator('.mx3-card.is-on')
        await expect(card).toBeVisible({ timeout: 30_000 })
        const box = await card.boundingBox()
        const tab = await page.locator('nav.tabbar').first().boundingBox()
        expect(box).not.toBeNull()
        expect(box!.y + box!.height).toBeLessThanOrEqual(tab ? tab.y + 1 : height)
        // The first place is preselected: its pin is the selected (larger) one.
        await page.waitForSelector('[data-map-ready]', { timeout: 60_000 })
        await expect
          .poll(() =>
            page.evaluate(() => {
              type M = { queryRenderedFeatures(o: { layers: string[] }): unknown[] }
              const m = (document.querySelector('.mx-canvas') as HTMLElement & { __map?: M }).__map
              return m?.queryRenderedFeatures({ layers: ['mx-pin-on'] }).length ?? 0
            }),
          )
          .toBe(1)
      })
    }

    test('swiping the cards selects the next place; its pin is in view', async ({ page }) => {
      await openMap(page)
      await expect(page.locator('.mx3-card.is-on')).toBeVisible({ timeout: 30_000 })
      test.skip((await page.locator('.mx3-card').count()) < 2, 'one place only')
      await page.waitForSelector('[data-map-ready]', { timeout: 60_000 })
      await mapCounts(page)
      const first = await page.locator('.mx3-card.is-on').getAttribute('data-id')
      await page.locator('.mx3-carousel').evaluate((el) => {
        const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1
        el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'instant' })
      })
      await expect(page.locator('.mx3-card.is-on')).not.toHaveAttribute('data-id', first ?? '')
      // The map stays still while the next pin is already in view, else it
      // pans to it; either way the selected pin ends up on screen, and a
      // swipe never zooms in.
      const zoom = (await mapCounts(page)).zoom
      await expect
        .poll(() =>
          page.evaluate(() => {
            type M = {
              queryRenderedFeatures(o: { layers: string[] }): {
                geometry: { coordinates: [number, number] }
              }[]
              project(c: [number, number]): { x: number; y: number }
              getCanvas(): HTMLCanvasElement
            }
            const m = (document.querySelector('.mx-canvas') as HTMLElement & { __map?: M }).__map!
            const on = m.queryRenderedFeatures({ layers: ['mx-pin-on'] })[0]
            if (!on) return false
            const p = m.project(on.geometry.coordinates)
            const c = m.getCanvas()
            return p.x >= 0 && p.y >= 0 && p.x <= c.clientWidth && p.y <= c.clientHeight
          }),
        )
        .toBe(true)
      expect((await mapCounts(page)).zoom).toBeLessThanOrEqual(zoom + 0.01)
    })

    test('a filter change never leaves the cards hidden', async ({ page }) => {
      await openMap(page)
      await expect(page.locator('.mx3-card.is-on')).toBeVisible({ timeout: 30_000 })
      // Open the sheet on a place, then pick another category without it.
      const id = await page.locator('.mx3-card.is-on').getAttribute('data-id')
      const own = await page.evaluate(async (placeId) => {
        const r = await fetch('/api/map/places?locale=en')
        const data = (await r.json()) as { places: { id: string; categoryKey: string }[] }
        return data.places.find((one) => one.id === placeId)?.categoryKey ?? ''
      }, id)
      await page.locator('.mx3-card.is-on button.mx3-card-link').click()
      await expect(page.locator('.mx4-sheet:not([data-stop=closed])')).toBeVisible()
      await page.locator('[data-chip=cats]').click()
      const dialog = page.getByRole('dialog', { name: 'Categories' })
      const other = dialog.locator(`.mx-cat:not(.is-locked):not([data-cat="${own}"])`)
      test.skip((await other.count()) === 0, 'one free category only')
      await other.first().click()
      const done = dialog.getByRole('button', { name: 'Done' })
      // Closing the sheet goes through history, which may close the dialog too.
      await done.click({ timeout: 2000 }).catch(() => undefined)
      await expect(page.locator('.mx3-bottom')).not.toHaveAttribute('data-hidden', /.*/)
      await expect(page.locator('.mx3-card.is-on')).toBeVisible()
    })
  })
})
