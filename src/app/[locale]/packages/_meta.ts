/**
 * Canonical + hreflang for the `/packages` routes.
 *
 * Every page in this segment is published in three languages at three
 * different URLs. Without `alternates.languages` Google treats them as three
 * competing pages about the same package and picks one; with it they are one
 * page in three languages, and the Arabic result is served to Arabic searchers.
 *
 * `getPathname` — not string concatenation — is what turns `/packages/x` into
 * `/ar/packages/x`. The routing config is `as-needed`, so English has no prefix
 * and hand-built URLs would be wrong for exactly one of the three locales.
 *
 * Deliberately duplicated per route segment rather than hoisted into a shared
 * module: the segments are owned by different authors and a shared file under
 * `src/app/[locale]/` is a merge hazard for a helper this small.
 */

import { defaultLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'

type Href = Parameters<typeof getPathname>[0]['href']

/**
 * Origin for absolute URLs. Canonical and hreflang links must be absolute —
 * a relative canonical is ignored by some crawlers and is ambiguous across
 * the CDN and the origin.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

export function absoluteUrl(href: Href, locale: Locale): string {
  return `${SITE_URL}${getPathname({ href, locale })}`
}

export function alternates(href: Href, locale: Locale) {
  const languages: Record<string, string> = {}
  for (const other of locales) {
    languages[other] = absoluteUrl(href, other)
  }
  // x-default points at the authoring locale, so a searcher whose language
  // matches none of the three lands on English rather than on whichever
  // alternate the crawler saw last.
  languages['x-default'] = absoluteUrl(href, defaultLocale)

  return { canonical: absoluteUrl(href, locale), languages }
}
