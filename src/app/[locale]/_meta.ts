/**
 * Page metadata helper.
 *
 * Every page in this app needs the same four things: a title, a description, a
 * canonical URL, and an `hreflang` set covering all three locales. The
 * prototype had none of them — it had no URLs at all — so this is written once
 * here rather than copy-pasted into every `generateMetadata`.
 *
 * Absolute URLs are built from `NEXT_PUBLIC_SITE_URL` and next-intl's
 * `getPathname`, which is the only thing that knows how `localePrefix:
 * 'as-needed'` maps a route to a path (`/services`, `/ar/services`,
 * `/id/services`). Hand-writing `/${locale}${path}` would emit `/en/services`,
 * which redirects — and a canonical that redirects is a canonical Google
 * ignores.
 *
 * Server-only: `getPathname` resolves to the react-server build here.
 */

import type { Metadata } from 'next'

import { defaultLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

/**
 * Public origin, no trailing slash.
 *
 * Falls back to localhost so a developer without an env file still gets
 * well-formed absolute URLs rather than `undefined/services`.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Absolute, locale-correct URL for an internal path. */
export function absoluteUrl(path: string, locale: Locale): string {
  return `${SITE_URL}${getPathname({ href: path, locale })}`
}

export type PageMetaInput = {
  locale: Locale
  /** Locale-agnostic route, e.g. `/services`. Never include a locale prefix. */
  path: string
  title: string
  description: string
  /**
   * Skip the layout's `%s · Bali Trips` template. Used by the homepage, whose
   * title already carries the brand.
   */
  absoluteTitle?: boolean
}

export function pageMetadata({
  locale,
  path,
  title,
  description,
  absoluteTitle = false,
}: PageMetaInput): Metadata {
  const url = absoluteUrl(path, locale)

  // `x-default` points at the authoring locale: it is what a crawler serves a
  // user whose language matches none of the three.
  const languages: Record<string, string> = { 'x-default': absoluteUrl(path, defaultLocale) }
  for (const alternate of locales) {
    languages[alternate] = absoluteUrl(path, alternate)
  }

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Bali Trips',
      locale,
      type: 'website',
      images: [DEFAULT_SHARE_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [DEFAULT_SHARE_IMAGE.url] },
  }
}
