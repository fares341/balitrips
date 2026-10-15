/**
 * Checkout — v3 screens 16 / 16b.
 *
 * The page has a URL, so signing in mid-flow is a round trip that ends here:
 * the sign-in detour records where it came from (`?next=` and an httpOnly
 * cookie) and `mergeAnonymousCartOnSignIn` folds the trip built while signed
 * out into the account. A traveller may also continue as a guest when the
 * trip holds nothing that must live in an account.
 *
 * Server-rendered parts — the review of the lines and the order summary — are
 * handed to the client flow as ready-made nodes; the flow only steps between
 * them and posts the form. The total shown is the server's, recomputed from
 * the catalogue by `buildQuote`.
 *
 * Deliberate differences from the prototype: no card fields (payment happens
 * on the provider's secure page — card data never touches this site), no
 * order number before payment (one is allocated when the order is created, so
 * a retry can reuse it), and no bank-transfer radio (see the payment step).
 */

import { randomUUID } from 'node:crypto'

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs, formatPrice, LinkButton } from '@/components/bt'
import { CART_HREF, HOME_HREF } from '@/components/layout/routes'
import { TRIP_KIND_ICON } from '@/components/trip'
import { PriceBreakdown } from '@/components/trip/price-breakdown'
import { Icon, Photo } from '@/components/ui'
import { db } from '@/db'
import { driverVehicles } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { isPlaceholderEmail } from '@/lib/auth/phone'
import type { VehicleClass } from '@/lib/booking-rules'
import { driverSuggestions } from '@/lib/booking/trip'
import { bookingsOpen } from '@/lib/bookings-open'
import {
  getCartWithTotals,
  getSessionUser,
  mergeAnonymousCartOnSignIn,
  type CartLineView,
} from '@/lib/cart'
import { pick } from '@/lib/content/localize'
import { splitPhone } from '@/lib/orders/contact'
import { FEATURES } from '@/lib/features'

import { toLocale } from '../_seo-hreflang'
import { beginSignInAction } from './actions'
import { CheckoutFlow, type DriverOffer } from './checkout-flow'
import { ACCOUNT_ONLY_KINDS } from './constants'

import '@/styles/bt-trip.css'

/** Per-visitor and money-bearing: never cached, never prerendered. */
export const dynamic = 'force-dynamic'

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const t = await getTranslations({ locale: toLocale(raw) })
  return {
    title: t('co_page_t'),
    description: t('chk_sub'),
    robots: { index: false, follow: false },
  }
}

/** The fleet's day rates, for the driver suggestion shown before payment. */
async function loadDriverRates() {
  return db
    .select({
      vehicleClass: driverVehicles.vehicleClass,
      dayRateMinor: driverVehicles.dayRateMinor,
      currency: driverVehicles.currency,
      label: driverVehicles.label,
    })
    .from(driverVehicles)
}

export default async function CheckoutPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const user = await getSessionUser()
  // Arriving straight after signing in is the normal path. Idempotent.
  if (user) await mergeAnonymousCartOnSignIn(user.id)
  const cart = await getCartWithTotals()

  const shell = (children: React.ReactNode) => (
    <main className="trip-page ck-page">
      <div className="wrap">
        <Breadcrumbs
          label={t('c_breadcrumb')}
          trail={[
            { label: t('c_home'), href: HOME_HREF },
            { label: t('ct2_title'), href: CART_HREF },
            { label: t('co_page_t') },
          ]}
        />
        <h1 className="h1 trip-h1 ck-h1">{t('co_page_t')}</h1>
        {children}
      </div>
    </main>
  )

  const notice = (
    icon: 'cal' | 'suitcase' | 'alert',
    title: string,
    text: string,
    action: React.ReactNode,
  ) =>
    shell(
      <section className="panel empty trip-empty">
        <span className="ill" aria-hidden="true">
          <Icon name={icon} size={36} />
        </span>
        <h2 className="h3">{title}</h2>
        <p className="muted" style={{ maxWidth: '46ch' }}>
          {text}
        </p>
        {action}
      </section>,
    )

  // Bookings closed: no flow, no idempotency key minted. Safe to read the
  // flag here — the route is force-dynamic.
  if (!bookingsOpen()) {
    return notice(
      'cal',
      t('bk_closed_t'),
      t('bk_closed_b'),
      <LinkButton href="/custom" variant="primary">
        {t('bk_closed_cta')}
      </LinkButton>,
    )
  }

  const lines = cart?.groups.flatMap((group) => group.lines) ?? []
  const payable = lines.filter((line) => line.lineTotalMinor !== null && line.lineTotalMinor > 0)
  if (cart === null || payable.length === 0) {
    return notice(
      'suitcase',
      t('co_nothing_t'),
      t('co_nothing_b'),
      <LinkButton href={CART_HREF} variant="forest">
        {t('co_back_trip')}
      </LinkButton>,
    )
  }
  if (!cart.ok) {
    return notice(
      'alert',
      t('co_blocked_t'),
      t('ct2_blocked'),
      <LinkButton href={CART_HREF} variant="forest">
        {t('co_back_trip')}
      </LinkButton>,
    )
  }

  const money = (minor: number, currency: string) => formatPrice(minor, currency, locale)
  const titleOf = (line: CartLineView) => {
    const name = pick(line.name, locale, '')
    return name === '' ? t(`ct2_grp_${line.kind}`) : name
  }
  const day = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`))
  const when = (line: CartLineView): string => {
    if (line.travelDate === null) return t('co_digital')
    const end =
      line.endDate !== null && line.endDate !== line.travelDate ? ` – ${day(line.endDate)}` : ''
    return `${day(line.travelDate)}${end}`
  }

  // ---- Driver suggestion (activities but no driver) ----
  // None while the driver service is off (lib/features.ts).
  const rates: Awaited<ReturnType<typeof loadDriverRates>> = FEATURES.driver
    ? await loadDriverRates()
    : []
  const sameCurrency = rates.filter((rate) => rate.currency === cart.currency)
  const driverOffers: DriverOffer[] = driverSuggestions(
    lines,
    sameCurrency.map((rate) => ({ ...rate, vehicleClass: rate.vehicleClass as VehicleClass })),
  ).map((offer) => {
    const line = lines.find((l) => l.id === offer.itemId)
    const rate = sameCurrency.find((r) => r.vehicleClass === offer.vehicleClass)
    return {
      itemId: offer.itemId,
      activity: line ? titleOf(line) : '',
      vehicle: pick(rate?.label ?? null, locale, offer.vehicleClass),
      days: offer.days,
      price: money(offer.totalMinor, offer.currency),
    }
  })

  // ---- Contact defaults ----
  const phone = splitPhone(user?.phone ?? null)
  const defaults = {
    name: user?.name ?? '',
    email: user === null || isPlaceholderEmail(user.email) ? '' : user.email,
    dialCode: phone.dialCode,
    phone: phone.phone,
  }
  const guestAllowed = !lines.some((line) => ACCOUNT_ONLY_KINDS.includes(line.kind))
  const discountMinor = Math.max(0, cart.subtotalMinor - cart.totalMinor)

  const signIn = (
    <form action={beginSignInAction} className="ck-signin">
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className="link">
        {t('co_log_in')}
      </button>
    </form>
  )

  const review = (
    <div className="stack ck-review">
      {lines.map((line) => (
        <div key={line.id} className="ck-line">
          <LineThumb line={line} locale={locale} />
          <div className="minw0" style={{ flex: 1 }}>
            <div className="ck-line-top">
              <b className="ck-line-name">{titleOf(line)}</b>
              <b className="price" dir="ltr">
                {line.lineTotalMinor === 0
                  ? t('trip_no_cost')
                  : money(line.lineTotalMinor ?? 0, line.currency ?? cart.currency)}
              </b>
            </div>
            <div className="card-meta">
              <span>{when(line)}</span>
              {line.travelTime !== null && (
                <span className="num" dir="ltr">
                  {line.travelTime.slice(0, 5)}
                </span>
              )}
              {(line.kind === 'activity' ? line.quantity : line.guests) !== null && (
                <span>
                  {t('trip_people_n', {
                    n: line.kind === 'activity' ? line.quantity : (line.guests ?? 1),
                  })}
                </span>
              )}
            </div>
            {line.breakdown !== null && line.breakdown.length > 0 && (
              <PriceBreakdown
                parts={line.breakdown}
                currency={line.currency ?? cart.currency}
                locale={locale}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )

  const summary = (
    <aside className="panel stack ck-sum" aria-labelledby="ck-sum-t">
      <h2 className="h3" id="ck-sum-t">
        {t('co_sum_t')}
      </h2>
      <div className="mini-items">
        {payable.map((line) => (
          <div key={line.id}>
            <LineThumb line={line} locale={locale} size={52} />
            <span className="minw0" style={{ flex: 1 }}>
              <b>{titleOf(line)}</b>
              <small className="muted">{when(line)}</small>
            </span>
            <b className="price" dir="ltr">
              {money(line.lineTotalMinor ?? 0, line.currency ?? cart.currency)}
            </b>
          </div>
        ))}
      </div>
      <div className="sum-row">
        <span>{t('co_subtotal')}</span>
        <span className="price" dir="ltr">
          {money(cart.subtotalMinor, cart.currency)}
        </span>
      </div>
      {discountMinor > 0 && (
        <div className="sum-row trip-discount">
          <span>{t('trip_discount')}</span>
          <span className="price" dir="ltr">
            −{money(discountMinor, cart.currency)}
          </span>
        </div>
      )}
      <div className="sum-row">
        <span>{t('co_fees')}</span>
        <span className="price" dir="ltr">
          {money(0, cart.currency)}
        </span>
      </div>
      <div className="sum-total">
        <span>{t('co_final_total')}</span>
        <b className="price" dir="ltr">
          {money(cart.totalMinor, cart.currency)}
        </b>
      </div>
      <small className="muted">{t('co_charged_note', { currency: cart.currency })}</small>
    </aside>
  )

  return shell(
    <CheckoutFlow
      signedInAs={user === null ? null : (user.name ?? defaults.email ?? '')}
      guestAllowed={guestAllowed}
      defaults={defaults}
      expectedTotalMinor={cart.totalMinor}
      totalLabel={money(cart.totalMinor, cart.currency)}
      // New per render, so a double-click submits the same key and cannot
      // buy the trip twice, while a fresh visit gets a fresh one.
      idempotencyKey={randomUUID()}
      review={review}
      summary={summary}
      driverOffers={driverOffers}
      signIn={signIn}
    />,
  )
}

function LineThumb({
  line,
  locale,
  size = 72,
}: {
  line: CartLineView
  locale: Locale
  size?: number
}) {
  if (line.imageUrl === null) {
    return (
      <span className="ck-thumb" style={{ width: size, height: size }} aria-hidden="true">
        <Icon name={TRIP_KIND_ICON[line.kind]} size={Math.round(size / 2.6)} />
      </span>
    )
  }
  return (
    <Photo
      src={line.imageUrl}
      alt={pick(line.imageAlt, locale, '')}
      width={size}
      height={size}
      radius={12}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  )
}
