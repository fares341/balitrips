/**
 * My Trip — v3 screens 15 / 15b (prototype my-trip.html).
 *
 * The server-owned cart, laid out as the design's trip: a schedule-conflict
 * warning, the trip by day, items grouped by kind with an itemised price
 * ("Price details"), edit/remove on every item, and a summary whose total is
 * exactly what checkout charges.
 *
 * Every amount comes from `getCartWithTotals()`, priced by the same
 * `buildQuote` that checkout uses. The total shown here IS the amount charged:
 * no fee is added later, and a discount — when the quote carries one — is
 * shown here, before payment.
 *
 * Not in this page, on purpose:
 *  - the prototype's promo-code box (there is no promotion engine; a box that
 *    accepts "BALI10" would be an invented price);
 *  - "Share trip": sharing exists for saved places (/account/trip), not for
 *    a cart, which holds dates and prices of one visitor.
 *
 * Dynamic and unindexed: per-visitor, reads cookies.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs, formatPrice, LinkButton } from '@/components/bt'
import { HOME_HREF } from '@/components/layout/routes'
import { PriceBreakdown } from '@/components/trip/price-breakdown'
import { TRIP_KIND_ICON } from '@/components/trip'
import { Icon, Photo, type IconName } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { bookingsOpen } from '@/lib/bookings-open'
import { scheduleConflicts, tripDays } from '@/lib/booking/trip'
import { getCartWithTotals, type CartLineView } from '@/lib/cart'
import { pick } from '@/lib/content/localize'
import { FEATURES } from '@/lib/features'

import { toLocale } from '../_seo-hreflang'
import { ClearTripButton, QuantityControl, RemoveItemButton } from './trip-controls'

import '@/styles/bt-trip.css'

export const dynamic = 'force-dynamic'

const CHECKOUT_HREF = '/checkout'

type PageParams = Promise<{ locale: string }>

/** The design's groups, in its order. Each lists the cart kinds it holds. */
const GROUPS: readonly { id: string; kinds: readonly string[]; icon: IconName; label: string }[] = [
  {
    id: 'activity',
    kinds: ['activity', 'activity_tier'],
    icon: 'compass',
    label: 'trip_g_activity',
  },
  { id: 'driver', kinds: ['driver'], icon: 'car', label: 'trip_g_driver' },
  { id: 'package', kinds: ['package'], icon: 'box', label: 'trip_g_package' },
  { id: 'itinerary', kinds: ['itinerary', 'custom'], icon: 'doc', label: 'trip_g_itinerary' },
  { id: 'plan', kinds: ['plan'], icon: 'map', label: 'trip_g_map' },
  { id: 'place', kinds: ['place'], icon: 'pin', label: 'trip_g_place' },
]

/** Kinds a provider must confirm after payment (the design's info tag). */
const PROVIDER_KINDS = new Set(['activity', 'activity_tier', 'driver', 'package'])

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const t = await getTranslations({ locale: toLocale(raw) })
  return {
    title: t('ct2_title'),
    description: t('trip_sub'),
    robots: { index: false, follow: false },
  }
}

function lineTitle(line: CartLineView, locale: Locale, fallback: string): string {
  const name = pick(line.name, locale, '')
  return name === '' ? fallback : name
}

export default async function MyTripPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const cart = await getCartWithTotals()

  const lines = cart?.groups.flatMap((group) => group.lines) ?? []
  const isEmpty = lines.length === 0
  const open = bookingsOpen()

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
  const money = (minor: number, currency: string) => formatPrice(minor, currency, locale)
  const titleOf = (line: CartLineView) => lineTitle(line, locale, t(`ct2_grp_${line.kind}`))

  const head = (
    <>
      <Breadcrumbs
        label={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: HOME_HREF }, { label: t('ct2_title') }]}
      />
      <div className="trip-head">
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="h1 trip-h1">{t('ct2_title')}</h1>
          <p className="muted">{t('trip_sub')}</p>
        </div>
        {!isEmpty && (
          <div className="row">
            <ClearTripButton />
          </div>
        )}
      </div>
    </>
  )

  if (cart === null || isEmpty) {
    return (
      <main className="trip-page">
        <div className="wrap">
          {head}
          <section className="panel empty trip-empty" aria-labelledby="trip-empty-t">
            <span className="ill" aria-hidden="true">
              <Icon name="suitcase" size={40} />
            </span>
            <h2 className="h3" id="trip-empty-t">
              {t('trip_empty_t')}
            </h2>
            <p className="muted" style={{ maxWidth: '46ch' }}>
              {t('trip_empty_b')}
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <LinkButton href="/map" variant="primary">
                {t('trip_explore_map')}
              </LinkButton>
              <LinkButton href="/activities" variant="ghost">
                {t('trip_browse_act')}
              </LinkButton>
              <LinkButton href="/itineraries" variant="ghost">
                {t('trip_ready_itin')}
              </LinkButton>
            </div>
          </section>
        </div>
      </main>
    )
  }

  const conflicts = scheduleConflicts(lines)
  const days = tripDays(lines)
  const payable = lines.filter((line) => line.lineTotalMinor !== null && line.lineTotalMinor > 0)
  const discountMinor = Math.max(0, cart.subtotalMinor - cart.totalMinor)
  const blocked = !cart.ok || conflicts.length > 0 || payable.length === 0 || !open

  return (
    <main className="trip-page">
      <div className="wrap">
        {head}

        <div className="trip-grid">
          <div className="stack trip-main">
            {conflicts.length > 0 && (
              <div className="alert alert-warn" role="alert">
                <Icon name="alert" size={20} />
                <span>
                  <b>{t('trip_conflict_t')}</b>
                  {conflicts.map(([a, b]) => (
                    <span key={`${a.id}-${b.id}`} style={{ display: 'block' }}>
                      {t('trip_conflict_b', {
                        a: titleOf(a),
                        b: titleOf(b),
                        date: a.travelDate === null ? '' : day(a.travelDate),
                      })}
                    </span>
                  ))}
                  {t('trip_conflict_fix')}
                </span>
              </div>
            )}

            {!cart.ok && (
              <div className="alert alert-err" role="alert">
                <Icon name="alert" size={20} />
                <span>{t('ct2_blocked')}</span>
              </div>
            )}

            {days.length > 0 && (
              <section className="stack" style={{ gap: 10 }} aria-labelledby="trip-days-t">
                <h2 className="trip-days-t" id="trip-days-t">
                  {t('trip_by_day')}
                </h2>
                <div className="daybar">
                  {days.map((d) => (
                    <div key={d.date}>
                      <b>{day(d.date)}</b>
                      {d.lines.map((line) => (
                        <span key={line.id} className="daybar-item">
                          {line.travelTime !== null && (
                            <span className="num" dir="ltr">
                              {line.travelTime.slice(0, 5)}
                            </span>
                          )}{' '}
                          {titleOf(line)}
                        </span>
                      ))}
                      <span className="dots" aria-hidden="true">
                        {d.lines.map((line) => (
                          <i key={line.id} className={line.kind === 'driver' ? 'd' : undefined} />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {GROUPS.map((group) => {
              const items = lines.filter((line) => group.kinds.includes(line.kind))
              if (items.length === 0) return null
              const headingId = `trip-g-${group.id}`
              return (
                <section key={group.id} className="grp" aria-labelledby={headingId}>
                  <h2 id={headingId}>
                    <Icon name={group.icon} size={20} /> {t(group.label)}{' '}
                    <span className="ct num">{format.number(items.length)}</span>
                  </h2>
                  {items.map((line) => (
                    <TripItem
                      key={line.id}
                      line={line}
                      locale={locale}
                      title={titleOf(line)}
                      day={day}
                      providerConfirms={PROVIDER_KINDS.has(line.kind)}
                    />
                  ))}
                </section>
              )
            })}

            <div className="panel panel-ivory trip-more">
              <span>
                <b>{t('trip_more_t')}</b>
                <small className="muted">{t('trip_more_b')}</small>
              </span>
              <div className="row">
                <LinkButton href="/activities" variant="ghost" size="sm">
                  {t('trip_more_act')}
                </LinkButton>
                {FEATURES.driver && (
                  <LinkButton href="/driver" variant="ghost" size="sm">
                    {t('trip_g_driver')}
                  </LinkButton>
                )}
                <LinkButton href="/itineraries" variant="ghost" size="sm">
                  {t('trip_more_itin')}
                </LinkButton>
              </div>
            </div>
          </div>

          <aside className="side-sum" aria-labelledby="trip-sum-t">
            <div className="panel stack" style={{ gap: 12 }}>
              <h2 className="h3" id="trip-sum-t">
                {t('trip_sum_t')}
              </h2>
              {payable.map((line) => (
                <div key={line.id} className="sum-row">
                  <span className="minw0 trip-sum-name">{titleOf(line)}</span>
                  <span className="price" dir="ltr">
                    {money(line.lineTotalMinor ?? 0, line.currency ?? cart.currency)}
                  </span>
                </div>
              ))}
              {discountMinor > 0 && (
                <div className="sum-row trip-discount">
                  <span>{t('trip_discount')}</span>
                  <span className="price" dir="ltr">
                    −{money(discountMinor, cart.currency)}
                  </span>
                </div>
              )}
              <div className="sum-total">
                <span>{t('c_total')}</span>
                <b className="price" dir="ltr">
                  {money(cart.totalMinor, cart.currency)}
                </b>
              </div>
              <small className="muted">{t('trip_final_note')}</small>
              {blocked ? (
                <button type="button" className="btn btn-primary btn-lg btn-block" disabled>
                  {t('ct2_complete')}
                </button>
              ) : (
                <LinkButton href={CHECKOUT_HREF} variant="primary" size="lg" block>
                  {t('ct2_complete')}
                </LinkButton>
              )}
              {!open ? (
                <small className="trip-why">{t('bk_closed_b')}</small>
              ) : conflicts.length > 0 ? (
                <small className="trip-why">{t('trip_conflict_first')}</small>
              ) : payable.length === 0 ? (
                <small className="muted">{t('trip_nothing_payable')}</small>
              ) : null}
            </div>
            <div className="panel panel-ivory stack trip-after">
              <b>
                <Icon name="shield" size={16} /> {t('trip_after_t')}
              </b>
              <span className="muted">{t('trip_after_b')}</span>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

async function TripItem({
  line,
  locale,
  title,
  day,
  providerConfirms,
}: {
  line: CartLineView
  locale: Locale
  title: string
  day: (value: string) => string
  providerConfirms: boolean
}) {
  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const money = (minor: number, currency: string) => formatPrice(minor, currency, locale)

  const priced = line.lineTotalMinor !== null && line.currency !== null
  const free = priced && line.lineTotalMinor === 0
  const guests = line.kind === 'activity' ? line.quantity : line.guests
  const isView =
    line.kind === 'place' ||
    line.kind === 'itinerary' ||
    line.kind === 'plan' ||
    line.kind === 'custom'
  // A driver sold with an activity is changed from that activity.
  const editable = line.kind !== 'driver' || line.parentItemId === null
  // An activity booking reopens in its booking box, loaded with this line.
  const editHref =
    line.href !== null && (line.kind === 'activity' || line.kind === 'activity_tier')
      ? `${line.href}?edit=${line.id}#book`
      : line.href

  return (
    <article className="ti">
      {line.imageUrl === null ? (
        <span className="ti-ill" aria-hidden="true">
          <Icon name={TRIP_KIND_ICON[line.kind]} size={34} />
        </span>
      ) : (
        <span className="ti-media">
          <Photo src={line.imageUrl} alt={pick(line.imageAlt, locale, '')} />
        </span>
      )}
      <div className="tbody">
        <div className="ttop">
          <div className="minw0">
            <div className="tname">
              {line.href === null ? title : <Link href={line.href}>{title}</Link>}
            </div>
            <div className="card-meta" style={{ marginTop: 4 }}>
              {line.travelDate !== null && (
                <span>
                  <Icon name="cal" size={14} /> {day(line.travelDate)}
                  {line.endDate !== null && line.endDate !== line.travelDate
                    ? ` – ${day(line.endDate)}`
                    : ''}
                </span>
              )}
              {line.travelTime !== null && (
                <span className="num" dir="ltr">
                  <Icon name="clock" size={14} /> {line.travelTime.slice(0, 5)}
                </span>
              )}
              {guests !== null && guests > 0 && (
                <span>
                  <Icon name="users" size={14} /> {t('trip_people_n', { n: guests })}
                </span>
              )}
              {line.kind === 'driver' && line.pricedQuantity !== null && (
                <span>
                  <Icon name="car" size={14} /> {t('c_days_n', { n: line.pricedQuantity })}
                </span>
              )}
            </div>
          </div>
          <div className="tprice">
            {!priced ? (
              <span aria-label={t('ct2_line_off')}>—</span>
            ) : free ? (
              <span className="tag tag-palm">{t('trip_no_cost')}</span>
            ) : (
              <span dir="ltr">{money(line.lineTotalMinor ?? 0, line.currency ?? 'USD')}</span>
            )}
          </div>
        </div>

        {priced && line.breakdown !== null && line.breakdown.length > 0 && (
          <details>
            <summary>
              {t('trip_price_details')} <span aria-hidden="true">▾</span>
            </summary>
            <PriceBreakdown
              parts={line.breakdown}
              currency={line.currency ?? 'USD'}
              locale={locale}
            />
          </details>
        )}
        {priced &&
          line.breakdown === null &&
          !free &&
          line.unitPriceMinor !== null &&
          (line.pricedQuantity ?? 1) > 1 && (
            <details>
              <summary>
                {t('trip_price_details')} <span aria-hidden="true">▾</span>
              </summary>
              <div className="sum-row trip-unit">
                <span>
                  <span dir="ltr">{money(line.unitPriceMinor, line.currency ?? 'USD')}</span> ×{' '}
                  {format.number(line.pricedQuantity ?? 1)}
                </span>
                <span className="price" dir="ltr">
                  {money(line.lineTotalMinor ?? 0, line.currency ?? 'USD')}
                </span>
              </div>
            </details>
          )}

        {!priced && (
          <p className="trip-why">
            <Icon name="alert" size={14} /> {t('ct2_line_off')}
          </p>
        )}
        {priced && providerConfirms && (
          <span className="tag tag-info" style={{ alignSelf: 'flex-start' }}>
            <Icon name="info" size={13} /> {t('trip_needs_provider')}
          </span>
        )}
        {line.kind === 'place' && <small className="muted">{t('trip_place_note')}</small>}

        <div className="acts">
          {line.kind === 'activity' && line.maxQuantity !== null && (
            <QuantityControl itemId={line.id} quantity={line.quantity} max={line.maxQuantity} />
          )}
          {editable && editHref !== null && (
            <Link className="btn btn-ghost btn-sm" href={editHref}>
              <Icon name={isView ? 'eye' : 'edit'} size={15} />{' '}
              {isView ? t('trip_view') : t('trip_edit')}
            </Link>
          )}
          <RemoveItemButton itemId={line.id} name={title} />
        </div>
      </div>
    </article>
  )
}
