/**
 * Order page — v3 screens 17, 17b, 17c, 17d (prototype confirmation.html).
 *
 * One URL per order, four payment states:
 *  - success    ✓ drawn + confetti in the brand colours (reduced motion: the
 *               mark only), items with their booking status, "What's next";
 *  - failed     nothing charged; "Try again" pays the SAME order again
 *               (`retryPaymentAction`) — no second order is ever created;
 *  - processing waiting for the provider's verdict; the page polls;
 *  - transfer   a bank transfer chosen at the provider is on its way.
 * plus cancelled/expired and refunded.
 *
 * Every item shows its own booking status. "Confirmed" appears only when the
 * provider confirmed (never because the payment succeeded); digital products
 * read "Ready to download" / "Unlocked" once paid. Status changes recorded by
 * staff are listed as the order's timeline (from `audit_log`).
 *
 * Visible to the account that placed the order, or — for a guest checkout —
 * to the browser that placed it (`bt_guest` cookie). Everyone else gets 404.
 * Amounts are the immutable order snapshot, never a live recomputation.
 */

import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { formatPrice, LinkButton } from '@/components/bt'
import { HOME_HREF } from '@/components/layout/routes'
import { TRIP_KIND_ICON } from '@/components/trip'
import { PriceBreakdown } from '@/components/trip/price-breakdown'
import { Icon, Photo } from '@/components/ui'
import { db } from '@/db'
import { auditLog, orderItems, orders, payments } from '@/db/schema'
import { Link } from '@/i18n/routing'
import { getSessionUser } from '@/lib/cart'
import { displayKey, loadCartCatalog } from '@/lib/cart/catalog'
import { pick } from '@/lib/content/localize'
import { loadEntitlements } from '@/lib/entitlements'
import {
  isBookingStatus,
  itemTag,
  isDigitalKind,
  paymentState,
  type PaymentState,
} from '@/lib/orders/booking-status'
import { canViewOrder, readGuestTokenHash } from '@/lib/orders/guest'
import type { CartItemKind, QuoteRequestItem } from '@/lib/pricing/quote'

import { toLocale } from '../../../_seo-hreflang'
import { retryPaymentAction } from '../../actions'
import { OrderStatusWatcher } from './order-status-watcher'
import { PurchaseTracker } from '@/components/analytics/purchase-tracker'
import { serverEventId } from '@/lib/analytics/event-id'

import '@/styles/bt-trip.css'

/** Status changes underneath this page; there is nothing to cache. */
export const dynamic = 'force-dynamic'

type PageParams = Promise<{ locale: string; orderNumber: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

const RETRY_REASONS = new Set([
  'expired',
  'in_progress',
  'not_retryable',
  'payment',
  'closed',
  'error',
  'not_found',
])

/** Twelve brand-coloured pieces per row, positions fixed so SSR and the browser agree. */
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  start: (i * 37 + 11) % 100,
  delay: ((i * 7) % 12) / 20,
  colour: ['#71FF85', '#FF9000', '#FFFBF8'][i % 3] as string,
}))

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw, orderNumber } = await params
  const t = await getTranslations({ locale: toLocale(raw) })
  return {
    title: `${t('cf_order')} ${orderNumber}`,
    // Someone's order is the last thing that belongs in a search index.
    robots: { index: false, follow: false },
  }
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}) {
  const { locale: raw, orderNumber } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const retryRaw = (await searchParams).retry
  const retryReason = typeof retryRaw === 'string' && RETRY_REASONS.has(retryRaw) ? retryRaw : null

  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1)
  const user = await getSessionUser()
  const viewer = { userId: user?.id ?? null, guestTokenHash: await readGuestTokenHash() }
  // Unknown, or someone else's: both are a 404, never a hint that it exists.
  if (!order || !canViewOrder(order, viewer)) notFound()

  const [lines, attempts] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
    db
      .select({ status: payments.status, method: payments.method, createdAt: payments.createdAt })
      .from(payments)
      .where(eq(payments.orderId, order.id)),
  ])

  const state: PaymentState = paymentState(order.status, attempts)
  const currency = order.presentmentCurrency
  const money = (minor: number) => formatPrice(minor, currency, locale)
  const email = order.customerSnapshot?.email ?? ''

  // Photos for the lines, from the live catalogue (names stay the snapshot).
  const catalog = await loadCartCatalog(
    lines.map(
      (line): QuoteRequestItem => ({
        id: line.id,
        kind: line.kind as CartItemKind,
        refId: line.refId,
        quantity: line.quantity,
        travelDate: line.travelDate,
        travelTime: line.travelTime,
        guests: line.guests,
        endDate: line.endDate,
        parentItemId: line.parentItemId,
      }),
    ),
    await loadEntitlements(order.userId),
    order.userId,
  ).catch(() => null)

  // Booking-status history (staff changes and payment-time completions).
  const history =
    lines.length === 0
      ? []
      : await db
          .select({
            entityId: auditLog.entityId,
            after: auditLog.after,
            createdAt: auditLog.createdAt,
          })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.entityType, 'order_item'),
              eq(auditLog.action, 'order_item.booking_status'),
              inArray(
                auditLog.entityId,
                lines.map((line) => line.id),
              ),
            ),
          )
          .orderBy(asc(auditLog.createdAt))

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
  const nameOf = (line: (typeof lines)[number]) =>
    pick(line.nameSnapshot, locale, t(`ct2_grp_${line.kind}`))
  const providerItems = lines.filter((line) => !isDigitalKind(line.kind))

  const hero = {
    success: {
      icon: (
        <svg
          className="draw"
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ),
      title: t('trip_ok_t'),
      body:
        email === ''
          ? t('trip_ok_b_noemail', { order: order.orderNumber })
          : t('trip_ok_b', { order: order.orderNumber, email }),
    },
    failed: {
      icon: <Icon name="cross" size={40} stroke={2.6} />,
      title: t('trip_fail_t'),
      body: t('trip_fail_b'),
    },
    processing: {
      icon: (
        <span className="spin" style={{ display: 'grid' }}>
          <Icon name="refresh" size={38} stroke={2.2} />
        </span>
      ),
      title: t('trip_proc_t'),
      body: t('trip_proc_b'),
    },
    transfer: {
      icon: <Icon name="doc" size={38} />,
      title: t('trip_tr_t'),
      body: t('trip_tr_b'),
    },
    cancelled: {
      icon: <Icon name="cal" size={38} />,
      title: t('trip_cx_t'),
      body: t('trip_cx_b'),
    },
    refunded: {
      icon: <Icon name="check" size={38} />,
      title: t('trip_rf_t'),
      body: t('trip_rf_b'),
    },
  }[state]

  const amountLabel =
    state === 'success' || state === 'refunded' ? t('trip_amount_paid') : t('trip_amount_due')

  return (
    <main className="trip-page">
      <div className="wrap">
        <div className="cf">
          {state === 'success' ? (
            <PurchaseTracker
              eventId={serverEventId('purchase', order.id)}
              orderNumber={order.orderNumber}
              valueMinor={order.totalMinor}
              currency={currency}
            />
          ) : null}
          <section className={`hero-st ${state}`} aria-live="polite">
            {state === 'success' && (
              <div className="confetti" aria-hidden="true">
                {CONFETTI.map((piece, index) => (
                  <i
                    key={index}
                    style={{
                      insetInlineStart: `${piece.start}%`,
                      background: piece.colour,
                      animationDelay: `${piece.delay}s`,
                    }}
                  />
                ))}
              </div>
            )}
            <span className="st-ic pop">{hero.icon}</span>
            <h1 className="h2">{hero.title}</h1>
            <p style={{ maxWidth: '52ch' }}>{hero.body}</p>
            {state === 'processing' && <OrderStatusWatcher state={state} />}
            {state === 'success' && <OrderStatusWatcher state={state} />}

            {state === 'failed' && retryReason !== null && (
              <p className="alert alert-err" role="alert">
                <Icon name="alert" size={18} />
                <span>{t(`trip_retry_${retryReason}`)}</span>
              </p>
            )}

            <div className="row" style={{ justifyContent: 'center' }}>
              {state === 'failed' && (
                <form action={retryPaymentAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="orderNumber" value={order.orderNumber} />
                  <button type="submit" className="btn btn-primary btn-lg">
                    {t('trip_retry')}
                  </button>
                </form>
              )}
              {state === 'failed' && (
                <LinkButton href="/contact" variant="ghost">
                  {t('trip_support')}
                </LinkButton>
              )}
              {state === 'success' && order.userId !== null && (
                <LinkButton href="/account/invoices" variant="primary">
                  {t('trip_view_bookings')}
                </LinkButton>
              )}
              {state === 'success' && (
                <LinkButton href={HOME_HREF} variant="glass">
                  {t('trip_back_home')}
                </LinkButton>
              )}
              {(state === 'processing' || state === 'transfer') && order.userId !== null && (
                <LinkButton href="/account/invoices" variant="forest">
                  {t('trip_track')}
                </LinkButton>
              )}
              {state === 'cancelled' && (
                <LinkButton href="/my-trip" variant="forest">
                  {t('co_back_trip')}
                </LinkButton>
              )}
            </div>
          </section>

          {state === 'transfer' && (
            <section className="panel stack" aria-labelledby="cf-bank-t">
              <h2 className="h3" id="cf-bank-t">
                {t('trip_tr_details')}
              </h2>
              <div className="bank">
                <div>
                  <span>{t('trip_tr_amount')}</span>
                  <b dir="ltr">{money(order.totalMinor)}</b>
                </div>
                <div>
                  <span>{t('trip_tr_ref')}</span>
                  <b dir="ltr">{order.orderNumber}</b>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 14 }}>
                {t('trip_tr_where')}
              </p>
            </section>
          )}

          <section className="stack" style={{ gap: 12 }} aria-labelledby="cf-items-t">
            <div className="row between">
              <h2 className="h3" id="cf-items-t">
                {t('trip_items_t')}
              </h2>
              <span className="tag tag-forest num" dir="ltr">
                {order.orderNumber}
              </span>
            </div>

            {lines.map((line) => {
              const status = isBookingStatus(line.bookingStatus) ? line.bookingStatus : 'created'
              const tag = itemTag(state, line.kind, status)
              const display = catalog?.display.get(
                displayKey(line.kind, line.kind === 'driver' ? line.vehicleClass : line.refId),
              )
              const meta: string[] = []
              if (line.travelDate !== null) {
                meta.push(
                  line.endDate !== null && line.endDate !== line.travelDate
                    ? `${day(line.travelDate)} – ${day(line.endDate)}`
                    : day(line.travelDate),
                )
              } else if (isDigitalKind(line.kind)) {
                meta.push(t('co_digital'))
              }
              return (
                <article key={line.id} className="oi">
                  {display?.imageUrl ? (
                    <Photo src={display.imageUrl} alt="" width={64} height={64} radius={12} />
                  ) : (
                    <span className="ck-thumb" style={{ width: 64, height: 64 }} aria-hidden="true">
                      <Icon name={TRIP_KIND_ICON[line.kind as CartItemKind] ?? 'grid'} size={24} />
                    </span>
                  )}
                  <span className="minw0 stack" style={{ gap: 4 }}>
                    <b className="oi-name">{nameOf(line)}</b>
                    <small className="muted">
                      {meta.join(' · ')}
                      {line.travelTime !== null && (
                        <>
                          {meta.length > 0 ? ' · ' : ''}
                          <span dir="ltr">{line.travelTime.slice(0, 5)}</span>
                        </>
                      )}
                    </small>
                    {line.options?.lines && line.options.lines.length > 0 && (
                      <PriceBreakdown
                        parts={line.options.lines}
                        currency={currency}
                        locale={locale}
                      />
                    )}
                    <span className={`tag tag-${tag.tone}`} style={{ alignSelf: 'flex-start' }}>
                      {t(tag.key)}
                    </span>
                  </span>
                  <span className="stack oi-end">
                    <b className="price" dir="ltr">
                      {money(line.lineTotalMinor)}
                    </b>
                    {state === 'success' && status === 'completed' && line.kind === 'itinerary' && (
                      <Link
                        className="btn btn-forest btn-sm"
                        href={`/account/schedules/${line.id}/download`}
                      >
                        <Icon name="download" size={15} /> PDF
                      </Link>
                    )}
                    {state === 'success' && status === 'completed' && line.kind === 'plan' && (
                      <Link className="btn btn-forest btn-sm" href="/map">
                        {t('trip_open')}
                      </Link>
                    )}
                  </span>
                </article>
              )
            })}

            <div className="sum-total">
              <span>{amountLabel}</span>
              <b className="price" dir="ltr">
                {money(order.totalMinor)}
              </b>
            </div>
          </section>

          {state === 'success' && (
            <section className="panel stack" aria-labelledby="cf-next-t">
              <h2 className="h3" id="cf-next-t">
                {t('trip_next_t')}
              </h2>
              <ol className="tl-list">
                <li>
                  <b>{t('trip_next_paid')}</b>
                  <br />
                  <small className="muted">
                    {order.placedAt === null
                      ? ''
                      : format.dateTime(order.placedAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                  </small>
                </li>
                {providerItems.length > 0 && (
                  <li
                    className={
                      providerItems.every(
                        (l) => l.bookingStatus === 'confirmed' || l.bookingStatus === 'completed',
                      )
                        ? undefined
                        : 'now'
                    }
                  >
                    <b>{t('trip_next_provider')}</b>
                    <br />
                    <small className="muted">{t('trip_next_provider_b')}</small>
                  </li>
                )}
                {providerItems.length > 0 && (
                  <li className="pending">
                    <b>{t('trip_next_voucher')}</b>
                    <br />
                    <small className="muted">{t('trip_next_voucher_b')}</small>
                  </li>
                )}
                {providerItems.length === 0 && (
                  <li>
                    <b>{t('trip_next_ready')}</b>
                    <br />
                    <small className="muted">{t('trip_next_ready_b')}</small>
                  </li>
                )}
              </ol>
              {history.length > 0 && (
                <>
                  <h3 className="cf-hist-t">{t('trip_history_t')}</h3>
                  <ul className="cf-hist">
                    {history.map((event, index) => {
                      const line = lines.find((l) => l.id === event.entityId)
                      const next = (event.after as { bookingStatus?: string } | null)?.bookingStatus
                      if (!line || next === undefined || !isBookingStatus(next)) return null
                      return (
                        <li key={index}>
                          <time dateTime={event.createdAt.toISOString()}>
                            {format.dateTime(event.createdAt, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </time>
                          <span>
                            {nameOf(line)} — {t(`trip_bs_${next}`)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
