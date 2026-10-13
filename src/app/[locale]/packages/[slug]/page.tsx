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
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { ActivityCard } from '@/components/cards'
import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { pick, pickList, pickOptional } from '@/lib/content/localize'
import { getPackageBySlug, listPackages } from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'
import { alternates } from '../_meta'
import { PackageBookingBox } from './booking-box'

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
              alt: pick(pkg.hero.alt, locale, name),
            },
          ]
        : undefined,
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

  const [t, format] = await Promise.all([getTranslations({ locale }), getFormatter({ locale })])

  const name = pick(pkg.name, locale, pkg.slug)
  const blurb = pickOptional(pkg.blurb, locale)
  const included = pickList(pkg.included, locale)
  const excluded = pickList(pkg.excluded, locale)

  return (
    <main className="bt-detailwrap">
      <div className="wrap">
        <Breadcrumbs
          trail={[
            { label: t('c_home'), href: HOME_HREF },
            { label: t('svc_pkg_t'), href: INDEX_HREF },
            { label: name },
          ]}
        />
      </div>

      <div className="wrap bt-detail-grid">
        <div className="bt-detail-main">
          <div className="bt-slider" style={{ borderRadius: 'var(--r-lg)' }}>
            <Photo
              src={pkg.hero?.url}
              alt={pick(pkg.hero?.alt, locale)}
              priority
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
            <div className="bt-dt-hero-veil" />
            <div style={{ position: 'absolute', insetInline: 0, bottom: 0, padding: 28 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="tag" style={{ background: 'var(--orange)', color: '#fff' }}>
                  {t('c_days_n', { n: pkg.days })}
                </span>
                {pkg.driverIncluded && (
                  <span className="tag tag-palm">
                    <Icon name="car" size={13} /> {t('pd_driver_inc')}
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 'clamp(26px,4.5vw,40px)', color: '#fff', marginTop: 10 }}>
                {name}
              </h1>
            </div>
          </div>

          <div className="bt-detail-block">
            <h2 className="bt-detail-h">{t('id_overview')}</h2>
            {blurb !== null && (
              <p className="lede" style={{ fontSize: 16 }}>
                {blurb}
              </p>
            )}
            {/*
              The facts a traveller checks before anything else: how long, how
              many people, where, and whether a driver comes with it. These
              were three loose tags and regions were not shown at all, even
              though every package has them.
            */}
            <dl className="bt-pkgfacts">
              <div className="bt-pkgfact">
                <Icon name="cal" size={18} color="var(--forest)" />
                <div>
                  <dt>{t('pd_fact_duration')}</dt>
                  <dd>{t('c_days_n', { n: pkg.days })}</dd>
                </div>
              </div>

              <div className="bt-pkgfact">
                <Icon name="users" size={18} color="var(--forest)" />
                <div>
                  <dt>{t('pd_fact_group')}</dt>
                  <dd>
                    {t('pd_fact_upto')} {format.number(pkg.maxGuests)} {t('ph_guests')}
                  </dd>
                </div>
              </div>

              {pkg.regions.length > 0 && (
                <div className="bt-pkgfact">
                  <Icon name="pin" size={18} color="var(--forest)" />
                  <div>
                    <dt>{t('pd_fact_areas')}</dt>
                    <dd>{pkg.regions.map((r) => pick(r.label, locale, r.key)).join(' · ')}</dd>
                  </div>
                </div>
              )}

              <div className="bt-pkgfact">
                <Icon name="car" size={18} color="var(--forest)" />
                <div>
                  <dt>{t('pd_fact_driver')}</dt>
                  <dd>{pkg.driverIncluded ? t('pd_fact_yes') : t('pd_fact_no')}</dd>
                </div>
              </div>
            </dl>
          </div>

          {(included.length > 0 || excluded.length > 0) && (
            <div className="bt-incexc">
              {included.length > 0 && (
                <div>
                  <h2 className="bt-detail-h">{t('pd_inc')}</h2>
                  <ul className="bt-checklist">
                    {included.map((entry) => (
                      <li key={entry}>
                        <span className="bt-check yes">
                          <Icon name="check" size={14} color="var(--forest)" />
                        </span>
                        {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {excluded.length > 0 && (
                <div>
                  <h2 className="bt-detail-h">{t('pd_exc')}</h2>
                  <ul className="bt-checklist">
                    {excluded.map((entry) => (
                      <li key={entry}>
                        <span className="bt-check no">
                          <Icon name="cross" size={13} color="var(--orange-deep)" />
                        </span>
                        {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {pkg.activities.length > 0 && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('pd_roadmap')}</h2>
              <div className="grid bt-grid-3auto">
                {pkg.activities.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} />
                ))}
              </div>
            </div>
          )}
        </div>

        <PackageBookingBox
          packageId={pkg.id}
          priceMinor={pkg.priceMinor}
          currency={pkg.currency}
          pricingMode={pkg.pricingMode}
          maxGuests={pkg.maxGuests}
        />
      </div>
    </main>
  )
}
