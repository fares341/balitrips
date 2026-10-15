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

import { PackageCard } from '@/components/cards'
import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickList, pickOptional } from '@/lib/content/localize'
import { FEATURES } from '@/lib/features'
import { getPackageBySlug, listPackages } from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'
import { alternates } from '../_meta'
import { PackageBookingBox } from './booking-box'

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

  const others = (await listPackages()).filter((other) => other.id !== pkg.id).slice(0, 3)
  const facts = [
    { icon: 'cal' as const, label: t('pd_fact_duration'), value: t('c_days_n', { n: pkg.days }) },
    {
      icon: 'users' as const,
      label: t('pd_fact_group'),
      value: `${t('pd_fact_upto')} ${format.number(pkg.maxGuests)}`,
    },
    ...(pkg.activities.length > 0
      ? [
          {
            icon: 'compass' as const,
            label: t('pd4_fact_acts'),
            value: t('pd4_acts_n', { n: pkg.activities.length }),
          },
        ]
      : []),
    ...(pkg.regions.length > 0
      ? [
          {
            icon: 'pin' as const,
            label: t('pd_fact_areas'),
            value: pkg.regions.map((r) => pick(r.label, locale, r.key)).join(' · '),
          },
        ]
      : []),
  ]

  return (
    <main className="bt-detailwrap pd-page">
      {/* Banner (v3 package.html): the package photo, length tag, name, line */}
      <div className="bt-banner pd-banner">
        <Photo
          src={pkg.hero?.url}
          alt={pick(pkg.hero?.alt, locale)}
          priority
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div className="bt-banner-veil" aria-hidden="true" />
        <div className="wrap bt-banner-inner">
          <Breadcrumbs
            light
            trail={[
              { label: t('c_home'), href: HOME_HREF },
              { label: t('svc_pkg_t'), href: INDEX_HREF },
              { label: name },
            ]}
          />
          <span className="row" style={{ gap: 8 }}>
            <span
              className="tag"
              style={{ background: 'var(--orange)', color: 'var(--on-orange)' }}
            >
              {t('c_days_n', { n: pkg.days })}
            </span>
            {FEATURES.driver && pkg.driverIncluded && (
              <span className="tag tag-palm">
                <Icon name="car" size={13} /> {t('pd_driver_inc')}
              </span>
            )}
          </span>
          <h1 className="bt-banner-title">{name}</h1>
          {blurb !== null && <p className="bt-banner-sub">{blurb}</p>}
        </div>
      </div>

      <div className="wrap bt-detail-grid">
        <div className="bt-detail-main">
          <ul className="pd-facts" role="list">
            {facts.map((fact) => (
              <li key={fact.label}>
                <small className="muted">
                  <Icon name={fact.icon} size={14} /> {fact.label}
                </small>
                <b>{fact.value}</b>
              </li>
            ))}
          </ul>

          {pkg.activities.length > 0 && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('pd4_acts_t')}</h2>
              <ul className="sr-list pd-acts" role="list">
                {pkg.activities.map((activity) => {
                  const area = pickOptional(activity.area, locale)
                  const duration = pickOptional(activity.duration, locale)
                  return (
                    <li key={activity.id}>
                      <Link href={activity.href} className="sr-row">
                        {activity.hero?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- catalogue thumbnail
                          <img src={activity.hero.url} alt="" loading="lazy" />
                        ) : (
                          <span className="sr-ph" aria-hidden="true">
                            <Icon name="compass" size={22} />
                          </span>
                        )}
                        <span className="sr-b">
                          <b>{pick(activity.name, locale, activity.slug)}</b>
                          {(area !== null || duration !== null) && (
                            <small className="muted">
                              {[area, duration].filter((part) => part !== null).join(' · ')}
                            </small>
                          )}
                        </span>
                        <Icon name="chevronr" size={18} className="flip" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {(included.length > 0 || excluded.length > 0) && (
            <div className="ie">
              {included.length > 0 && (
                <div className="panel">
                  <b className="ie-h ok">
                    <Icon name="check" size={18} stroke={2.4} /> {t('pd_inc')}
                  </b>
                  <ul>
                    {included.map((entry) => (
                      <li key={entry}>
                        <Icon name="check" size={16} stroke={2.2} /> {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {excluded.length > 0 && (
                <div className="panel">
                  <b className="ie-h no">
                    <Icon name="cross" size={18} stroke={2.4} /> {t('pd_exc')}
                  </b>
                  <ul>
                    {excluded.map((entry) => (
                      <li key={entry} className="muted">
                        <Icon name="cross" size={16} stroke={2} /> {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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

      {others.length > 0 && (
        <section className="sec bg-ivory2" aria-labelledby="pd-others">
          <div className="wrap">
            <h2 className="h2" id="pd-others" style={{ marginBottom: 20 }}>
              {t('pd4_others')}
            </h2>
            <div className="grid pk-grid">
              {others.map((other) => (
                <PackageCard key={other.id} pkg={other} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
