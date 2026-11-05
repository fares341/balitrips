import { expect, test } from '@playwright/test'

/**
 * Google place photos (migration 0040) against a MOCKED Places API
 * (scripts/mock-google-places.mjs, wired in full-test.yml): one free place is
 * linked to a mock Google place. Its page shows Google photos that load, each
 * with «Photo: <author> · Google Maps»; our own photos everywhere else still
 * render. Skipped when the mock is not wired (E2E_GOOGLE_SLUG unset).
 */

const slug = process.env.E2E_GOOGLE_SLUG?.trim() ?? ''

test.describe('google place photos (mocked)', () => {
  test.skip(slug === '', 'Google mock not wired for this run')

  test('the place page shows loaded Google photos with attribution', async ({ page }) => {
    await page.goto(`/en/places/${slug}`)
    const gimg = page.locator(`img[src*="/api/places/${slug}/gphoto/"]`).first()
    await expect(gimg).toBeVisible()
    await expect
      .poll(() => gimg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    const credit = page.getByTestId('gphoto-credit').first()
    await expect(credit).toContainText('Photo:')
    await expect(credit).toContainText('Mock Author')
    await expect(credit.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      /^https:\/\/www\.google\.com\/maps\//,
    )
    // Slots beyond the place's 3 Google photos are trimmed server-side.
    expect(await page.locator(`img[src*="/gphoto/3"]`).count()).toBe(0)
  })

  test('the photo route redirects, sets private cache headers and keeps the lock', async ({
    request,
  }) => {
    const ok = await request.get(`/api/places/${slug}/gphoto/0?w=400`, { maxRedirects: 0 })
    expect(ok.status()).toBe(302)
    expect(ok.headers()['cache-control']).toMatch(/^private/)
    expect((await request.get(`/api/places/${slug}/gphoto/7`, { maxRedirects: 0 })).status()).toBe(
      404,
    )
    expect(
      (await request.get('/api/places/no-such-place-xyz/gphoto/0', { maxRedirects: 0 })).status(),
    ).toBe(404)
  })

  test('the photo credit API answers live attributions', async ({ request }) => {
    const res = await request.get(`/api/places/${slug}/gphotos`)
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toContain('no-store')
    const body = (await res.json()) as { photos: { authors: { name: string }[] }[] }
    expect(body.photos).toHaveLength(3)
    expect(body.photos[0]!.authors[0]!.name).toBe('Mock Author 1')
  })

  test('a locked (VIP) place answers 404 to a visitor, like the map APIs', async ({ request }) => {
    const locked = process.env.E2E_GOOGLE_LOCKED_SLUG?.trim() ?? ''
    test.skip(locked === '', 'no locked place in the seed')
    expect(
      (await request.get(`/api/places/${locked}/gphoto/0`, { maxRedirects: 0 })).status(),
    ).toBe(404)
    expect((await request.get(`/api/places/${locked}/gphotos`)).status()).toBe(404)
  })
})
