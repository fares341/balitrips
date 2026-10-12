/**
 * The route table the accessibility suite sweeps.
 *
 * Deliberately separate from `e2e/` — that suite proves the booking funnel
 * works; this one proves the pages can be operated by somebody who cannot see
 * them or cannot use a mouse. They share nothing but the server.
 *
 * `localePrefix` is `'always'`, so every URL carries its locale segment and
 * `/` is a redirect. Nothing here may hardcode `/en/...`: a route only ever
 * scanned in English is a route whose Arabic mirror is untested, and the
 * Arabic mirror is the one that flips the whole layout to RTL.
 */

import type { Page } from '@playwright/test'

export const LOCALES = ['en', 'ar', 'id'] as const

export type A11yLocale = (typeof LOCALES)[number]

/** Reading direction, mirrored from `src/i18n/config.ts`. */
export const LOCALE_DIR: Record<A11yLocale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ar: 'rtl',
  id: 'ltr',
}

export interface RouteSpec {
  /** Stable id used in test titles and in the summary report. */
  id: string
  /** Human label for the report. */
  label: string
  /**
   * Locale-agnostic path with a leading slash, or `null` when the path is only
   * known at run time. The activity detail page is the one such route: its
   * slug comes from the seed, and hardcoding one here would turn a re-seed
   * into a suite-wide failure that looks like an accessibility regression.
   */
  path: string | null
}

/**
 * The nine surfaces under test.
 *
 * Between them they cover every interaction pattern on the customer side: a
 * marketing page, three index pages with cards and filters, a detail page with
 * a booking form and a dialog, a paywalled canvas, a pricing table, a mutable
 * list, and a form that posts.
 */
export const ROUTES: readonly RouteSpec[] = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'activities', label: 'Activities hub', path: '/activities' },
  { id: 'activity-detail', label: 'Activity detail', path: null },
  { id: 'itineraries', label: 'Itineraries', path: '/itineraries' },
  { id: 'packages', label: 'Packages', path: '/packages' },
  { id: 'map', label: 'Map', path: '/map' },
  { id: 'plans', label: 'Plans', path: '/plans' },
  { id: 'cart', label: 'Cart', path: '/cart' },
  { id: 'contact', label: 'Contact', path: '/contact' },
]

/** Prefix `path` with `locale`. `/` becomes `/en`, not `/en/`. */
export function localePath(locale: A11yLocale, path: string): string {
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

/* --------------------------------------------------------------------------
   Activity slug discovery
   -------------------------------------------------------------------------- */

/**
 * Cached per worker process.
 *
 * The slug is a property of the seed, not of the locale, so one discovery
 * serves all three languages and every spec that runs in this worker.
 */
let cachedSlug: string | null = null

const ACTIVITY_HREF = /\/(?:en|ar|id)\/activities\/([^/?#"']+)/

/**
 * The slug of whichever activity the hub lists first.
 *
 * Read out of the rendered hub rather than out of Postgres: the suite's job is
 * to test what a browser can reach, and a slug that exists in the database but
 * is not linked from anywhere is not a page anybody can find.
 */
export async function firstActivitySlug(page: Page): Promise<string> {
  if (cachedSlug !== null) return cachedSlug

  await page.goto(localePath('en', '/activities'), { waitUntil: 'domcontentloaded' })

  const hrefs = await page
    .locator('a[href*="/activities/"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''))

  for (const href of hrefs) {
    const match = ACTIVITY_HREF.exec(href)
    const slug = match?.[1]
    if (slug !== undefined && slug !== '') {
      cachedSlug = slug
      return slug
    }
  }

  throw new Error(
    'No activity detail link found on /en/activities. The hub rendered but linked ' +
      'nothing — check that the database is seeded (52 media rows, activities published).',
  )
}

/** The URL for `route` in `locale`, resolving the run-time slug when needed. */
export async function urlFor(page: Page, route: RouteSpec, locale: A11yLocale): Promise<string> {
  if (route.path !== null) return localePath(locale, route.path)
  return localePath(locale, `/activities/${await firstActivitySlug(page)}`)
}

/**
 * Refuse to scan a page whose stylesheets did not arrive.
 *
 * This is the single most important guard in the suite, and it exists because
 * the failure it catches produces *confident wrong answers* rather than an
 * error. `next build` empties `.next/static` before it writes, and the
 * standalone server does not ship those assets at all unless something copies
 * them in — so a page can return 200 with every stylesheet 404ing. Scan that
 * page and axe reports black-on-white everywhere (contrast: perfect) while
 * every control measures at its unstyled intrinsic size (a 44px icon button
 * reads as 20x17). Both numbers are garbage, and neither looks like it.
 *
 * `docs/known-issues.md` makes the same point in general terms: "A page
 * returning 200 tells you almost nothing." Assert the thing you care about.
 *
 * The probe is a design token — `--forest` is declared on `:root` in
 * `src/styles/tokens.css`, so it resolves if and only if the stylesheet
 * loaded.
 */
async function assertStyled(page: Page, url: string): Promise<void> {
  const token = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--forest').trim(),
  )

  if (token === '') {
    throw new Error(
      `${url} rendered without its stylesheets — the '--forest' design token does not ` +
        `resolve, so src/styles/tokens.css never loaded.\n` +
        `Every colour and every element size measured on this page would be wrong, so ` +
        `the scan is refused rather than reported.\n` +
        `Usual cause: the standalone bundle is missing '.next/static'. Rebuild and start ` +
        `the server with scripts/serve-standalone.mjs, which copies it in.`,
    )
  }
}

/**
 * Navigate to `route` and wait for the document to settle.
 *
 * `domcontentloaded` rather than `networkidle`: the map route holds an open
 * connection for its tiles and `networkidle` never fires there, and the header
 * polls nothing, so there is nothing else worth waiting on. Specs that need
 * hydration wait for the specific control they are about to press.
 */
export async function gotoRoute(page: Page, route: RouteSpec, locale: A11yLocale): Promise<string> {
  const url = await urlFor(page, route, locale)
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })

  const status = response?.status()
  if (status !== undefined && status >= 400) {
    throw new Error(`${url} answered ${status} — the page never rendered, so it cannot be scanned.`)
  }

  // Fonts and images shift layout, and layout is what the tap-target spec
  // measures. Wait for the load event, but do not let a slow placeholder
  // image fail an otherwise scannable page.
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {})

  await assertStyled(page, url)

  return url
}

/**
 * Navigate to a bare locale path, with the same stylesheet guard.
 *
 * Used by the specs that visit a route outside `ROUTES` — `/account` and
 * `/search` host the two dialogs, and neither is a content page worth a full
 * axe sweep.
 */
export async function gotoPath(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {})
  await assertStyled(page, path)
}
