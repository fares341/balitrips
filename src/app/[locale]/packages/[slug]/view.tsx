/**
 * The package page body, shared by the public page and the staff preview of a
 * draft (`./preview/page.tsx`). Phase 3 adds: the day each activity happens
 * on, what else comes with the package (an itinerary, VIP map access), and
 * itineraries offered next to it at their own price.
 */

import { getFormatter, getTranslations } from 'next-intl/server'

import { PackageCard } from '@/components/cards'
import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickList, pickOptional } from '@/lib/content/localize'
import { FEATURES } from '@/lib/features'
import { itinerariesForPackage, listPackages } from '@/lib/content/queries'
import { ENTITY_PATHS, type PackageDetail } from '@/lib/content/types'

import { formatPrice } from '../../_ui/price'
import { BuyItineraryButton } from '../../itineraries/[slug]/buy-button'
import { PackageBookingBox } from './booking-box'

const INDEX_HREF = ENTITY_PATHS.package

export async function PackageDetailView({
  pkg,
  locale,
  preview,
}: {
  pkg: PackageDetail
  locale: Locale
  /** Staff preview of a draft: a banner, and no "other packages" strip. */
  preview: boolean
}) {
  const [t, format] = await Promise.all([getTranslations({ locale }), getFormatter({ locale })])

  const name = pick(pkg.name, locale, pkg.slug)
  const blurb = pickOptional(pkg.blurb, locale)
  const included = pickList(pkg.included, locale)
  const excluded = pickList(pkg.excluded, locale)

  const others = preview
    ? []
    : (await listPackages()).filter((other) => other.id !== pkg.id).slice(0, 3)
  // Phase 3: itineraries sold next to the package at their own price.
  const extras = (await itinerariesForPackage(pkg.id)).filter(
    (entry) => entry.priceRule === 'extra' && entry.itinerary.id !== pkg.itinerary?.id,
  )
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

  // The day-by-day programme. Days fixed in Studio first; the rest in the
  // package's own order onto the days still free, one activity a day.
  const fixedDay = (id: string): number | undefined => {
    const offset = pkg.activityDays[id]
    return offset !== undefined && offset >= 0 && offset < pkg.days ? offset : undefined
  }
  const dayActs: (typeof pkg.activities)[] = Array.from({ length: pkg.days }, () => [])
  const unplaced: typeof pkg.activities = []
  for (const activity of pkg.activities) {
    const offset = fixedDay(activity.id)
    if (offset !== undefined) dayActs[offset]?.push(activity)
    else unplaced.push(activity)
  }
  const anyFixed = pkg.activities.some((activity) => fixedDay(activity.id) !== undefined)
  const flexible: typeof pkg.activities = []
  for (const activity of unplaced) {
    const free = anyFixed ? -1 : dayActs.findIndex((list) => list.length === 0)
    if (free === -1) flexible.push(activity)
    else dayActs[free]?.push(activity)
  }
  const program =
    pkg.activities.length === 0
      ? []
      : dayActs.map((list, index) => ({ number: index + 1, activities: list }))

  const activityRow = (activity: (typeof pkg.activities)[number]) => {
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
  }

  /**
   * What is and is not included. The editor's lists when written; otherwise
   * what the package record itself proves is included, and the items no
   * package here covers.
   */
  const includedList =
    included.length > 0
      ? included
      : [
          ...(pkg.activities.length > 0 ? [t('pk_inc_acts', { n: pkg.activities.length })] : []),
          ...(FEATURES.driver && pkg.driverIncluded ? [t('pd_driver_inc')] : []),
          ...(pkg.itinerary !== null ? [t('pk_inc_itinerary')] : []),
          ...(pkg.includesVip ? [t('p3_vip_map')] : []),
        ]
  const excludedList =
    excluded.length > 0
      ? excluded
      : [
          t('pk_exc_flights'),
          ...(FEATURES.driver && pkg.driverIncluded ? [] : [t('pk_exc_transport')]),
          t('pk_exc_personal'),
        ]

  return (
    <main className="bt-detailwrap pd-page">
      {preview && (
        <div className="pd-preview" role="note">
          <Icon name="info" size={16} />{' '}
          {pkg.status === 'published' ? t('p3_preview_live') : t('p3_preview_draft')}
        </div>
      )}
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

          {/* Day by day (H6): every day of the package, each with its
              activities. A day an editor fixed wins; otherwise activities
              follow the package's own order, one a day. A day with nothing
              booked says so instead of being skipped. */}
          {program.length > 0 && (
            <div className="bt-detail-block" id="pd-program">
              <h2 className="bt-detail-h">{t('pk_program_t')}</h2>
              <ol className="pd-program" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {program.map((day) => (
                  <li key={day.number} className="pd-day-item" style={{ marginBottom: 12 }}>
                    <b className="pd-day" style={{ display: 'block', marginBottom: 6 }}>
                      {t('dt_day_n')} {format.number(day.number)}
                    </b>
                    {day.activities.length === 0 ? (
                      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                        {t(
                          FEATURES.driver && pkg.driverIncluded
                            ? 'pk_day_free_driver'
                            : 'pk_day_free',
                        )}
                      </p>
                    ) : (
                      <ul className="sr-list pd-acts" role="list">
                        {day.activities.map((activity) => activityRow(activity))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
              {flexible.length > 0 && (
                <>
                  <p className="muted" style={{ margin: '8px 0' }}>
                    {t('pk_program_flexible')}
                  </p>
                  <ul className="sr-list pd-acts" role="list">
                    {flexible.map((activity) => activityRow(activity))}
                  </ul>
                </>
              )}
            </div>
          )}

          {(pkg.itinerary !== null || pkg.includesVip) && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('p3_pkg_comes_with')}</h2>
              <ul className="sr-list pd-acts" role="list">
                {pkg.itinerary !== null && (
                  <li>
                    <Link href={pkg.itinerary.href} className="sr-row">
                      <span className="sr-ph" aria-hidden="true">
                        <Icon name="pdf" size={22} />
                      </span>
                      <span className="sr-b">
                        <b>{pick(pkg.itinerary.name, locale, pkg.itinerary.slug)}</b>
                        <small className="muted">
                          {t('p3_pkg_itinerary_line', { n: pkg.itinerary.days })}
                        </small>
                      </span>
                      <Icon name="chevronr" size={18} className="flip" />
                    </Link>
                  </li>
                )}
                {pkg.includesVip && (
                  <li>
                    <span className="sr-row">
                      <span className="sr-ph" aria-hidden="true">
                        <Icon name="star" size={22} />
                      </span>
                      <span className="sr-b">
                        <b>{t('p3_vip_map')}</b>
                        <small className="muted">{t('p3_pkg_vip_line')}</small>
                      </span>
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {extras.length > 0 && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('p3_pkg_extras')}</h2>
              <ul className="sr-list pd-acts" role="list">
                {extras.map((entry) => (
                  <li key={entry.itinerary.id} className="pd-extra">
                    <Link href={entry.itinerary.href} className="sr-row">
                      <span className="sr-ph" aria-hidden="true">
                        <Icon name="pdf" size={22} />
                      </span>
                      <span className="sr-b">
                        <b>{pick(entry.itinerary.name, locale, entry.itinerary.slug)}</b>
                        <small className="muted">
                          +
                          {formatPrice(
                            entry.itinerary.priceMinor,
                            entry.itinerary.currency,
                            locale,
                          )}
                        </small>
                      </span>
                    </Link>
                    {!preview && (
                      <BuyItineraryButton
                        itineraryId={entry.itinerary.id}
                        className="btn btn-ghost btn-sm"
                      >
                        {t('p3_add_plan')}
                      </BuyItineraryButton>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(includedList.length > 0 || excludedList.length > 0) && (
            <div className="ie" id="pd-includes">
              {includedList.length > 0 && (
                <div className="panel">
                  <b className="ie-h ok">
                    <Icon name="check" size={18} stroke={2.4} /> {t('pd_inc')}
                  </b>
                  <ul>
                    {includedList.map((entry) => (
                      <li key={entry}>
                        <Icon name="check" size={16} stroke={2.2} /> {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {excludedList.length > 0 && (
                <div className="panel">
                  <b className="ie-h no">
                    <Icon name="cross" size={18} stroke={2.4} /> {t('pd_exc')}
                  </b>
                  <ul>
                    {excludedList.map((entry) => (
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
