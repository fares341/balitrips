/**
 * Order confirmation.
 *
 * The handoff's version of this screen was `const [done, setDone] =
 * React.useState(false)` — a boolean in component state. It had no order
 * number, no line items, no amount and no status; it vanished on any
 * navigation and could never be reopened, bookmarked, forwarded to support or
 * shown to a bank. This is a real page at a real URL, keyed by the order
 * number.
 *
 * It polls while the order is still `pending`. That is not a workaround: only
 * a verified webhook moves an order to `paid`, and providers routinely deliver
 * that event before the customer's browser returns. A confirmation page that
 * assumed the redirect meant success would confidently tell people their
 * booking was confirmed before any money existed.
 *
 * Every amount is read from the immutable order snapshot rather than
 * recomputed, so editing or unpublishing a product later cannot rewrite what
 * the customer bought.
 */

import { and, asc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { HOME_HREF } from '@/components/layout/routes'
import { Breadcrumbs, Button, LinkButton } from '@/components/shared'
import { TRIP_KIND_ICON } from '@/components/trip'
import { Icon } from '@/components/ui'
import { db } from '@/db'
import { orderItems, orders } from '@/db/schema'
import { getSessionUser } from '@/lib/cart'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/orders/state'
import type { CartItemKind } from '@/lib/pricing/quote'

import { toLocale } from '../../../_seo-hreflang'
import { beginSignInAction } from '../../actions'
import { OrderStatusWatcher } from './order-status-watcher'

/** Status changes underneath this page; there is nothing to cache. */
export const dynamic = 'force-dynamic'

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/

type PageParams = Promise<{ locale: string; orderNumber: string }>

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

/** Headline, body and colour per status. */
function presentation(status: OrderStatus): {
  titleKey: string
  bodyKey: string | null
  icon: 'check' | 'clock' | 'cross'
  colour: string
} {
  switch (status) {
    case 'paid':
    case 'confirmed':
      return { titleKey: 'cf_t_paid', bodyKey: 'cf_b_paid', icon: 'check', colour: 'var(--forest)' }
    case 'cancelled':
      return {
        titleKey: 'cf_t_failed',
        bodyKey: 'cf_b_failed',
        icon: 'cross',
        colour: 'var(--orange-deep)',
      }
    case 'refunded':
    case 'partially_refunded':
      return {
        titleKey: 'cf_t_refunded',
        bodyKey: 'cf_b_refunded',
        icon: 'check',
        colour: 'var(--muted)',
      }
    case 'pending':
      // The body is the watcher's, because it changes as time passes.
      return { titleKey: 'cf_t_pending', bodyKey: null, icon: 'clock', colour: 'var(--muted)' }
  }
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw, orderNumber } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: `${t('cf_order')} ${orderNumber}`,
    description: t('cf_b_paid'),
    // Someone else's order confirmation is the last thing that should be in
    // a search index.
    robots: { index: false, follow: false },
  }
}

export default async function ConfirmationPage({ params }: { params: PageParams }) {
  const { locale: raw, orderNumber } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })

  const user = await getSessionUser()

  if (!user) {
    return (
      <div className="bt-detailwrap">
        <div className="wrap">
          <div className="bt-cart-done">
            <span className="bt-cart-done-ic" style={{ background: 'var(--forest)' }}>
              <Icon name="lock" size={34} color="#fff" />
            </span>
            <h1 style={{ fontSize: 'clamp(26px,4.5vw,40px)', marginTop: 18 }}>
              {t('cf_signin_t')}
            </h1>
            <p className="lede" style={{ marginTop: 12, maxWidth: '48ch', marginInline: 'auto' }}>
              {t('cf_signin_b')}
            </p>
            <form action={beginSignInAction} style={{ marginTop: 20 }}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="orange">
                {t('auth_in_btn')}
              </Button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  const orderRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber), eq(orders.userId, user.id)))
    .limit(1)

  const order = orderRows[0]
  // Unknown order number, or someone else's. Both are a 404 — never the
  // handoff's "|| ARRAY[0]" style fallback onto whatever happened to be first.
  if (!order) notFound()

  const lines = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.id))

  const status: OrderStatus = isOrderStatus(order.status) ? order.status : 'pending'
  const view = presentation(status)
  const settled = status === 'paid' || status === 'confirmed'

  const calendarDate = (value: string): string => {
    if (!PLAIN_DATE.test(value)) return value
    return format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })
  }

  const crumbs = [{ label: t('c_home'), href: HOME_HREF }, { label: t('cf_order') }]

  return (
    <div className="bt-detailwrap">
      <div className="wrap">
        <Breadcrumbs trail={crumbs} label={t('c_breadcrumb')} />
      </div>

      <div className="wrap">
        <div className="bt-cart-done">
          <span className="bt-cart-done-ic" style={{ background: view.colour }}>
            <Icon name={view.icon} size={38} color="#fff" />
          </span>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,40px)', marginTop: 18 }}>{t(view.titleKey)}</h1>
          {view.bodyKey !== null && (
            <p className="lede" style={{ marginTop: 12, maxWidth: '48ch', marginInline: 'auto' }}>
              {t(view.bodyKey)}
            </p>
          )}
          <OrderStatusWatcher status={status} />
        </div>

        <div className="bt-cart-grid">
          <div className="bt-cart-lines">
            <section aria-labelledby="bt-cf-items">
              <h2 className="bt-cart-grouphead" id="bt-cf-items">
                <Icon name="grid" size={17} color="var(--forest)" />
                {t('cf_items')} <span className="muted">· {format.number(lines.length)}</span>
              </h2>

              {lines.map((line) => {
                const kind = line.kind as CartItemKind
                const icon = TRIP_KIND_ICON[kind] ?? 'grid'
                const meta: string[] = []
                if (line.travelDate !== null) {
                  meta.push(
                    line.endDate !== null && line.endDate !== line.travelDate
                      ? `${calendarDate(line.travelDate)} – ${calendarDate(line.endDate)}`
                      : calendarDate(line.travelDate),
                  )
                }
                if (line.travelTime !== null) meta.push(line.travelTime.slice(0, 5))
                if (line.guests !== null) {
                  meta.push(`${t('c_guests')}: ${format.number(line.guests)}`)
                }

                return (
                  <article key={line.id} className="bt-cart-line">
                    <span
                      style={{
                        width: 48,
                        height: 48,
                        flexShrink: 0,
                        borderRadius: 12,
                        background: 'var(--ivory-2)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                      aria-hidden="true"
                    >
                      <Icon name={icon} size={20} color="var(--muted)" />
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {/* The name the customer actually bought, frozen at
                            purchase — not a live read of the catalogue. */}
                        {pick(line.nameSnapshot, locale, t(`ct2_grp_${kind}`))}
                      </div>
                      {meta.length > 0 && (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                          {meta.join(' · ')}
                        </div>
                      )}
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                        {formatMoney(line.unitPriceMinor, order.presentmentCurrency, locale)} ×{' '}
                        {format.number(line.quantity)}
                      </div>
                    </div>

                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 16,
                        color: 'var(--orange-deep)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatMoney(line.lineTotalMinor, order.presentmentCurrency, locale)}
                    </div>
                  </article>
                )
              })}
            </section>
          </div>

          <aside className="bt-booking" aria-labelledby="bt-cf-summary">
            <h2 id="bt-cf-summary" style={{ fontSize: 18, marginBottom: 14 }}>
              {t('ad_summary')}
            </h2>

            <div className="bt-summary" style={{ marginTop: 0 }}>
              <SummaryRow label={t('cf_order')} value={order.orderNumber} />
              {order.placedAt !== null && (
                <SummaryRow
                  label={t('c_date')}
                  value={format.dateTime(order.placedAt, { dateStyle: 'medium' })}
                />
              )}
              <SummaryRow label={t('cf_status')} value={t(`cf_st_${status}`)} />
              <div className="bt-summary-total">
                {/* "Amount paid" only once it has been. Until the webhook
                    lands it is an amount due, and saying otherwise would be
                    the same lie the handoff's instant success screen told. */}
                <span>{settled ? t('cf_paid') : t('c_total')}</span>
                <span>{formatMoney(order.totalMinor, order.presentmentCurrency, locale)}</span>
              </div>
            </div>

            <LinkButton href="/account" variant="orange" block style={{ marginTop: 14 }}>
              {t('nav_account')}
            </LinkButton>
            <LinkButton href={HOME_HREF} variant="ghost" block style={{ marginTop: 10 }}>
              {t('c_home')}
            </LinkButton>
          </aside>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bt-summary-row">
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}
