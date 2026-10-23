/**
 * Activity detail — v3 screen 06, laid out after the client's reference
 * design (Oct 2026, docs/activity-page-gap.md): title, facts and gallery side
 * by side; four package cards across; the selected-package card; the four
 * boxes; add-ons; the booking form; information tabs; similar activities and
 * the map.
 *
 * Client design (phase 1): title, area, real-review rating and headline;
 * quick facts (location, group size, schedule, duration); gallery with
 * thumbnails and a click-to-load video; package cards ("choose the right
 * package") with the chosen package's detail panel, the four boxes
 * (includes / not included / suitable for / important notes) and the add-on
 * cards; description (safe markdown) + highlights + info tabs (important
 * information / cancellation / FAQ); meeting point with Google Maps; what to
 * bring; age & conditions; real reviews. Beside them the sticky booking box
 * (#book) — or a contact panel when the activity is unavailable — and below,
 * similar activities and the map card.
 *
 * A wrong slug is a 404 (never the first record), every number shown is from
 * the database, and sections without data are left out rather than filled
 * with sample copy.
 */

import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { pick, pickAlt, pickOptional } from '@/lib/content/localize'
import { markdownToPlain } from '@/lib/content/markdown'
import { getActivityBySlug, listActivityPageSlugs, mergedActivitySlug } from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import { ActivityView } from './view'

import '@/styles/bt-activity.css'

const HUB_PATH = ENTITY_PATHS.activity
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

type PageProps = { params: Promise<{ locale: string; slug: string }> }

export async function generateStaticParams() {
  // Listed and link-only (hidden) activities alike: every page that opens.
  const slugs = await listActivityPageSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  const lang: Locale = isLocale(locale) ? locale : defaultLocale
  const activity = await getActivityBySlug(slug)
  if (!activity) return {}

  const name = pick(activity.name, lang, activity.slug)
  const title = pickOptional(activity.seoTitle, lang) ?? name
  const description =
    pickOptional(activity.seoDescription, lang) ??
    pickOptional(activity.shortDescription, lang) ??
    pickOptional(activity.headline, lang) ??
    (() => {
      const full = pickOptional(activity.description, lang)
      return full ? markdownToPlain(full).slice(0, 300) : null
    })() ??
    pickOptional(activity.area, lang) ??
    name
  const url = (target: Locale) =>
    `${SITE_URL}${getPathname({ href: `${HUB_PATH}/${activity.slug}`, locale: target })}`

  const share = activity.ogImage ?? activity.hero
  return {
    title,
    description,
    // A hidden activity opens by its link only: kept out of search engines too.
    ...(activity.status === 'hidden' ? { robots: { index: false, follow: false } } : {}),
    alternates: {
      canonical: activity.canonicalUrl ?? url(lang),
      languages: {
        ...Object.fromEntries(locales.map((one) => [one, url(one)])),
        'x-default': url(defaultLocale),
      },
    },
    openGraph: {
      title,
      description,
      url: url(lang),
      images:
        share === null
          ? [DEFAULT_SHARE_IMAGE]
          : [
              {
                url: share.url,
                width: share.width,
                height: share.height,
                alt: pickAlt(share.alt, lang, name),
              },
            ],
    },
  }
}

export default async function ActivityDetailPage({ params }: PageProps) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const lang: Locale = isLocale(locale) ? locale : defaultLocale

  // An activity folded into another one as a package: its old link lands there.
  const mergedInto = await mergedActivitySlug(slug)
  if (mergedInto !== null) {
    permanentRedirect(getPathname({ href: `${HUB_PATH}/${mergedInto}`, locale: lang }))
  }

  const activity = await getActivityBySlug(slug)
  if (!activity) notFound()

  return <ActivityView activity={activity} lang={lang} />
}
