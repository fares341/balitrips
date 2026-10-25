/**
 * /sitemap.xml — every public page in all three locales, with hreflang
 * alternates. Rendered per request (it reads the catalogue); a database
 * error leaves the static pages in rather than failing the file.
 */
import type { MetadataRoute } from 'next'

import { locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { listActivities, listArticles, listItineraries, listPackages } from '@/lib/content/queries'
import { FEATURES } from '@/lib/features'
import { SHARE_ORIGIN } from '@/lib/seo/site-origin'

export const dynamic = 'force-dynamic'

const STATIC_PATHS = [
  '/',
  '/services',
  '/map',
  '/activities',
  '/events',
  '/itineraries',
  '/packages',
  ...(FEATURES.driver ? ['/driver'] : []),
  '/custom',
  '/explore',
  '/shopping',
  '/plans',
  '/reviews',
  '/about',
  '/blog',
  '/contact',
  '/faq',
  '/help',
  '/credits',
  '/privacy',
  '/terms',
  '/refund',
  '/payment-policy',
  '/cookies',
  '/payment-methods',
]

function url(href: string, locale: Locale): string {
  return `${SHARE_ORIGIN}${getPathname({ href, locale })}`
}

function entries(href: string, lastModified?: Date): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(locales.map((one) => [one, url(href, one)]))
  return locales.map((locale) => ({
    url: url(href, locale),
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }))
}

async function safe<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load()
  } catch (error) {
    console.warn('[sitemap] catalogue read failed', error)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [activities, itineraries, packages, articles] = await Promise.all([
    safe(() => listActivities({ limit: 200 })),
    safe(() => listItineraries()),
    safe(() => listPackages()),
    safe(() => listArticles({ limit: 200 })),
  ])

  return [
    ...STATIC_PATHS.flatMap((path) => entries(path)),
    ...activities.flatMap((one) => entries(`/activities/${one.slug}`)),
    ...itineraries.flatMap((one) => entries(`/itineraries/${one.slug}`)),
    ...packages.flatMap((one) => entries(`/packages/${one.slug}`)),
    ...articles.flatMap((one) => entries(`/blog/${one.slug}`)),
  ]
}
