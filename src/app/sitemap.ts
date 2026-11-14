/**
 * /sitemap.xml — every indexable public page in all three locales, with
 * hreflang alternates. Rendered per request (it reads the catalogue); a
 * database error leaves the static pages in rather than failing the file.
 *
 * Listed (site audit, Nov 2026): the static pages, activities, itineraries,
 * packages, articles, the free place pages, the broad explore regions and
 * the two usage policies. Left out: pages that are `noindex` (/credits,
 * locked place pages, account and checkout) and section pages that have
 * nothing in them yet (/blog, /packages and /reviews appear once they have
 * an article, a package or a review).
 */
import { inArray } from 'drizzle-orm'
import type { MetadataRoute } from 'next'

import { canonicalPolicyHref } from '@/components/layout/routes'
import { db } from '@/db'
import {
  activities as activitiesTable,
  itineraries as itinerariesTable,
  mapPlaces,
} from '@/db/schema'
import { defaultLocale, fallbackLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import {
  listActivities,
  listArticles,
  listItineraries,
  listPackages,
  listRegions,
  regionParentKeys,
} from '@/lib/content/queries'
import { FEATURES } from '@/lib/features'
import { listMapCategoriesCached, listMapPlacesCached } from '@/lib/map/cached'
import { SHARE_ORIGIN } from '@/lib/seo/site-origin'

export const dynamic = 'force-dynamic'

const STATIC_PATHS = [
  '/',
  '/services',
  '/map',
  '/activities',
  '/events',
  '/itineraries',
  ...(FEATURES.driver ? ['/driver'] : []),
  '/custom',
  '/explore',
  ...(FEATURES.shopping ? ['/shopping'] : []),
  '/plans',
  '/about',
  '/contact',
  '/faq',
  '/help',
  '/policies',
  '/privacy',
  '/terms',
  '/refund',
  '/payment-policy',
  '/cookies',
  '/platform-use',
  '/map-use',
  '/payment-methods',
]

function url(href: string, locale: Locale): string {
  return `${SHARE_ORIGIN}${getPathname({ href, locale })}`
}

function entries(href: string, lastModified?: Date | null): MetadataRoute.Sitemap {
  // Same set as each page's <head> (_seo-hreflang.ts), x-default included.
  // Arabic per-policy URLs only redirect to /ar/policies (listed on its own),
  // so those pages list their two real languages.
  const listed = locales.filter((one) => canonicalPolicyHref(href, one) === href)
  const languages: Record<string, string> = Object.fromEntries(
    listed.map((one) => [one, url(href, one)]),
  )
  languages['x-default'] = url(
    href,
    listed.includes(defaultLocale) ? defaultLocale : fallbackLocale,
  )
  return listed.map((locale) => ({
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

/** slug → last change, for `lastmod`. Only slugs the catalogue already listed are looked up. */
async function lastChanged(
  table: typeof activitiesTable | typeof itinerariesTable | typeof mapPlaces,
  slugs: readonly string[],
): Promise<Map<string, Date>> {
  if (slugs.length === 0) return new Map()
  try {
    const rows = await db
      .select({ slug: table.slug, updatedAt: table.updatedAt })
      .from(table)
      .where(inArray(table.slug, [...slugs]))
    return new Map(rows.map((row) => [row.slug, row.updatedAt]))
  } catch (error) {
    console.warn('[sitemap] lastmod read failed', error)
    return new Map()
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [activities, itineraries, packages, articles, places, categories, regions, parents] =
    await Promise.all([
      safe(() => listActivities({ limit: 200 })),
      safe(() => listItineraries()),
      safe(() => listPackages()),
      safe(() => listArticles({ limit: 200 })),
      safe(() => listMapPlacesCached()),
      safe(() => listMapCategoriesCached()),
      safe(() => listRegions()),
      regionParentKeys().catch(() => new Map<string, string>()),
    ])

  // Place pages that are indexable: free (a locked place page is noindex and
  // names nothing), in a category the map shows, and not an activity's own
  // marker (that content is the activity page, listed above).
  const mapKeys = new Set(categories.map((one) => one.key))
  const placeSlugs = places
    .filter(
      (place) =>
        place.isFree &&
        place.categoryKey !== null &&
        place.categoryKey !== 'activities' &&
        mapKeys.has(place.categoryKey),
    )
    .map((place) => place.slug)
  // The broad regions (/explore links exactly these); areas live inside them.
  const regionKeys = regions.map((one) => one.key).filter((key) => parents.get(key) === key)

  const [activityDates, itineraryDates, placeDates] = await Promise.all([
    lastChanged(
      activitiesTable,
      activities.map((one) => one.slug),
    ),
    lastChanged(
      itinerariesTable,
      itineraries.map((one) => one.slug),
    ),
    lastChanged(mapPlaces, placeSlugs),
  ])
  const hasReviews = activities.some((one) => (one.reviewCount ?? 0) > 0)

  return [
    ...STATIC_PATHS.flatMap((path) => entries(path)),
    ...(packages.length > 0 ? entries('/packages') : []),
    ...(articles.length > 0 ? entries('/blog') : []),
    ...(hasReviews ? entries('/reviews') : []),
    ...regionKeys.flatMap((key) => entries(`/explore/${encodeURIComponent(key)}`)),
    ...activities.flatMap((one) => entries(`/activities/${one.slug}`, activityDates.get(one.slug))),
    ...itineraries.flatMap((one) =>
      entries(`/itineraries/${one.slug}`, itineraryDates.get(one.slug)),
    ),
    ...packages.flatMap((one) => entries(`/packages/${one.slug}`)),
    ...articles.flatMap((one) => entries(`/blog/${one.slug}`)),
    ...placeSlugs.flatMap((slug) => entries(`/places/${slug}`, placeDates.get(slug))),
  ]
}
