import { expect, test } from './support/fixtures'

import { ResponseRecorder, type CapturedResponse } from './support/network'
import { FREE_PLACES, gatedNeedles, GATED_PLACES } from './support/places'

/**
 * The paywall.
 *
 * This is the regression the prototype actually shipped. `page-map.jsx`
 * serialised every place — name, category, rating, coordinates, opening hours,
 * hero photograph and linked activity — into the browser for every visitor,
 * then rendered the gated ones as `•••••` under `filter: blur(4px)`. The
 * product was sold on access to that data. It was one devtools panel away from
 * being free, and `mapUnlocked` was a localStorage boolean that either plan
 * tier set with no payment involved.
 *
 * So the assertion here is deliberately not "the locked pins look locked". It
 * is that the bytes never leave the server. Two surfaces are checked:
 *
 *  1. **The page source**, after hydration — the DOM as the browser holds it,
 *     including anything React wrote in.
 *  2. **Every network response body**, which is where the prototype's leak
 *     actually lived. An RSC flight payload is not in `page.content()`; it
 *     arrives as a stream of script chunks and is consumed by React. A test
 *     that only reads the DOM would have passed against the prototype.
 *
 * The free places are asserted present in the same test. A paywall that works
 * by shipping nothing is not a paywall, it is an outage, and "no gated data"
 * is trivially satisfiable by a 500.
 */

const MAP_PATH = '/en/map'

/** Where a needle was found, for a failure message worth reading. */
interface Hit {
  needle: string
  value: string
  where: string
}

function excerpt(body: string, pattern: RegExp): string {
  const match = pattern.exec(body)
  if (match === null) return ''
  const start = Math.max(0, match.index - 60)
  return body.slice(start, match.index + match[0].length + 60).replace(/\s+/g, ' ')
}

/**
 * Does this response belong to the map route?
 *
 * Everything the map needs is in scope: its document, its own RSC payload, the
 * scripts and styles it loads, and any endpoint it calls. Out of scope is one
 * thing only — an RSC *prefetch of a different page*. Next speculatively
 * fetches the routes behind the header links, so a browser parked on /en/map
 * downloads the home page's payload unprompted. Those bytes are the home
 * page's, not the map's, and the home page legitimately advertises public
 * activities named after the same landmarks.
 *
 * Only the name needles are narrowed by this. Coordinates, the map hero key
 * and the `?place=` deep link are checked against every captured byte,
 * prefetches included — nothing on the site has any business carrying those.
 */
function belongsToMapRoute(url: string): boolean {
  const parsed = new URL(url)
  const isRscPayload = parsed.searchParams.has('_rsc')
  if (!isRscPayload) return true
  return /\/[a-z]{2}\/map\/?$/.test(parsed.pathname)
}

test.describe('map paywall', () => {
  test('an anonymous visitor never receives gated place data', async ({ page }) => {
    const recorder = ResponseRecorder.attach(page)

    await page.goto(MAP_PATH, { waitUntil: 'networkidle' })

    // The map explorer is a Client Component; give hydration the chance to
    // request anything it wants before we stop listening. A leak that arrives
    // one tick after load is still a leak.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(1500)

    const responses = await recorder.collect()
    expect(
      responses.length,
      'no responses were captured — the recorder is not wired up',
    ).toBeGreaterThan(0)

    const dom = await page.content()
    const needles = gatedNeedles()
    const hits: Hit[] = []

    for (const needle of needles) {
      if (needle.pattern.test(dom)) {
        hits.push({
          needle: needle.label,
          value: needle.value,
          where: `rendered DOM :: …${excerpt(dom, needle.pattern)}…`,
        })
      }

      for (const response of responses) {
        if (needle.scope === 'map-route' && !belongsToMapRoute(response.url)) continue
        if (!needle.pattern.test(response.body)) continue
        hits.push({
          needle: needle.label,
          value: needle.value,
          where: `${response.status} ${response.url} (${response.contentType}) :: …${excerpt(
            response.body,
            needle.pattern,
          )}…`,
        })
      }
    }

    expect(
      hits,
      `Gated place data reached an anonymous browser:\n${hits
        .map((hit) => `  • ${hit.needle} = ${JSON.stringify(hit.value)}\n      in ${hit.where}`)
        .join('\n')}`,
    ).toEqual([])
  })

  test('the free places are still rendered', async ({ page }) => {
    await page.goto(MAP_PATH, { waitUntil: 'domcontentloaded' })

    for (const place of FREE_PLACES) {
      const name = place.names[0]
      expect(name, 'every seeded place has at least one name').toBeDefined()
      await expect(
        page.getByText(name ?? '', { exact: false }).first(),
        `free place "${name}" must be visible to everyone`,
      ).toBeVisible()
    }
  })

  test('the locked count is disclosed without disclosing what is locked', async ({ page }) => {
    await page.goto(MAP_PATH, { waitUntil: 'domcontentloaded' })

    // The banner advertises how many places are behind the paywall — that is
    // the upsell, and it is safe. The count must match the seed, or the
    // redaction is applying to the wrong rows.
    const body = await page.textContent('body')
    expect(body, 'the page rendered no text').not.toBeNull()
    expect(body ?? '', `the map must advertise ${GATED_PLACES.length} locked places`).toMatch(
      new RegExp(`\\b${GATED_PLACES.length}\\b`),
    )
  })

  test('the gated data is absent from the server-rendered HTML itself', async ({ request }) => {
    // A second, JavaScript-free look at the same question. If the redaction
    // were done client-side, this would catch it even if hydration later
    // removed the evidence from the DOM.
    const response = await request.get(MAP_PATH)
    expect(response.ok(), `GET ${MAP_PATH} returned ${response.status()}`).toBe(true)

    const html = await response.text()
    const leaked = gatedNeedles().filter((needle) => needle.pattern.test(html))

    expect(
      leaked.map((needle) => `${needle.label} = ${JSON.stringify(needle.value)}`),
      'gated data present in the server-rendered HTML',
    ).toEqual([])
  })
})

/**
 * Sanity check on the needles themselves.
 *
 * A typo in a literal would turn every assertion above into a tautology. This
 * proves the same search finds the free places' data on the same page — so if
 * the gated searches come back empty, it is because the data is not there, not
 * because the search is broken.
 */
test('the leak detector can actually detect data on this page', async ({ request }) => {
  const response = await request.get(MAP_PATH)
  const html = await response.text()

  const found: string[] = []
  for (const place of FREE_PLACES) {
    const name = place.names[0] ?? ''
    if (html.includes(name)) found.push(`name:${name}`)
    if (html.includes(String(place.lon))) found.push(`lon:${place.lon}`)
    if (html.includes(place.objectKey)) found.push(`img:${place.objectKey}`)
  }

  // Names, coordinates and image URLs of *unlocked* places are all expected in
  // the payload — that is what an entitled field looks like.
  expect(found, 'the free places carry no data at all; the search is not working').not.toEqual([])
})

/**
 * Capture the shape of what a locked entry is allowed to contain.
 *
 * Not a duplicate of the leak test: this one asserts the positive contract, so
 * a future change that redacts by *omitting the places entirely* — which would
 * also pass the leak test — is caught as the different bug it is.
 */
test('locked places are represented, not omitted', async ({ page }) => {
  const responses: CapturedResponse[] = []
  const recorder = ResponseRecorder.attach(page)

  await page.goto(MAP_PATH, { waitUntil: 'networkidle' })
  responses.push(...(await recorder.collect()))

  const combined = responses.map((one) => one.body).join('\n')
  expect(
    combined,
    'the payload carries no locked marker at all — the upsell has nothing to point at',
  ).toContain('map_access')
})
