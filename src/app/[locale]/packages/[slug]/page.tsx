/**
 * Package detail.
 *
 * Ported from `PackageDetailPage` in
 * design/handoff/sections-bt/page-plans.jsx: hero with the day badge and the
 * driver flag, overview, included/excluded, the included-activities roadmap as
 * full activity cards, and the booking sidebar.
 *
 * Three things the handoff did that are not carried over.
 *
 * 1. **Hard-coded inclusions.** `inc` and `exc` were two arrays of *message
 *    keys* — `["pd_pinc1","pd_pinc2","pd_pinc3","pd_pinc4"]` — so every
 *    package on the site advertised the same four inclusions regardless of
 *    what it actually sold. A package with no breakfast still promised daily
 *    breakfast. Both lists come from the row now, and a side with no entries is
 *    omitted rather than backfilled with the design's placeholder copy.
 *
 * 2. **`findPackage(id) || PACKAGES[0]`.** Every unknown slug returned 200 with
 *    the first package's content and price. Unknown slugs are `notFound()`.
 *
 * 3. **The guest-blind total.** See `./booking-box.tsx` — that is where the
 *    pricing lives, and where the handoff's flat `${p.price}` is replaced by
 *    something that respects `pricingMode`.
 */

import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale, locales } from '@/i18n/config'
import { pick, pickAlt, pickOptional } from '@/lib/content/localize'
import { getPackageBySlug, listPackages } from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'
import { alternates } from '../_meta'
import { PackageDetailView } from './view'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import '@/styles/bt-activity.css'

const INDEX_HREF = ENTITY_PATHS.package

/**
 * `generateMetadata` and the page body both need the record. React's `cache`
 * collapses them into one query per request instead of two.
 */
const loadPackage = cache(getPackageBySlug)

export async function generateStaticParams() {
  const packages = await listPackages()
  return locales.flatMap((locale) => packages.map((pkg) => ({ locale, slug: pkg.slug })))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const pkg = await loadPackage(slug)
  if (!pkg) return {}

  const t = await getTranslations({ locale })
  const name = pick(pkg.name, locale, pkg.slug)
  const blurb = pickOptional(pkg.blurb, locale) ?? t('ph_sub')

  return {
    title: name,
    description: blurb,
    alternates: alternates(`${INDEX_HREF}/${slug}`, locale),
    openGraph: {
      type: 'article',
      title: name,
      description: blurb,
      images: pkg.hero
        ? [
            {
              url: pkg.hero.url,
              width: pkg.hero.width,
              height: pkg.hero.height,
              alt: pickAlt(pkg.hero.alt, locale, name),
            },
          ]
        : [DEFAULT_SHARE_IMAGE],
    },
  }
}

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const pkg = await loadPackage(slug)
  if (!pkg) notFound()

  return <PackageDetailView pkg={pkg} locale={locale} preview={false} />
}
