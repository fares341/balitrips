/**
 * Canonical + hreflang construction.
 *
 * Every page in the port has to declare the same three things: an absolute
 * canonical URL, one `alternates.languages` entry per locale, and an
 * `x-default`. Getting those subtly different per page is how a trilingual
 * site ends up competing with itself in search, so the rule lives in one
 * place.
 *
 * `getPathname` is used rather than string concatenation because the routing
 * strategy is `as-needed`: English is served at `/blog`, Arabic at `/ar/blog`.
 * Hand-building `/${locale}${path}` would emit `/en/blog`, which is a 404 —
 * and would emit it into the canonical tag, which is the worst place for it.
 *
 * `NEXT_PUBLIC_SITE_URL` is expected to be set in every deployed environment.
 * When it is absent (a bare `next dev` with no env file) the helper degrades
 * to root-relative URLs rather than inventing a hostname: a relative canonical
 * is merely weak, a wrong absolute one is actively harmful.
 *
 * Not a route — Next only treats `page`/`route`/`layout`/`template`/`default`
 * and the error files as routable, so a plain module can sit here beside them.
 */

import type { Metadata } from 'next'

import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

/** Absolute (or root-relative) URL for `href` under one locale. */
export function localeUrl(href: string, locale: Locale): string {
  const path = getPathname({ href, locale })
  return SITE_URL === '' ? path : `${SITE_URL}${path}`
}

/**
 * `alternates` for a page that exists in all three locales.
 *
 * `x-default` points at English, the authoring locale — it is the page a
 * search engine should serve when it cannot infer the visitor's language.
 */
export function alternatesFor(href: string, locale: Locale): Metadata['alternates'] {
  const languages: Record<string, string> = {}
  for (const candidate of locales) languages[candidate] = localeUrl(href, candidate)
  languages['x-default'] = localeUrl(href, defaultLocale)

  return { canonical: localeUrl(href, locale), languages }
}

/**
 * Narrow the raw `params.locale` string.
 *
 * The layout already rejects unknown locales, but `params` is typed as
 * `string` and every page needs a `Locale` to hand to `pick()` and the
 * queries. Falling back to English here rather than throwing keeps
 * `generateMetadata` — which runs before the layout's own guard — from
 * crashing the render of a URL that is about to 404 anyway.
 */
export function toLocale(value: string): Locale {
  return isLocale(value) ? value : defaultLocale
}
