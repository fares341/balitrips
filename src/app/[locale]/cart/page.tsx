/**
 * My Trip — the cart.
 *
 * Ported from `CartPage` in design/handoff/sections-bt/page-cart.jsx:
 * breadcrumbs, the empty state, lines grouped by kind under a bordered group
 * header, a 72px thumbnail, a quantity stepper on activities, a remove button,
 * and a sticky summary carrying a subtotal per group and a grand total.
 *
 * What changed, and why:
 *
 *  1. **The cart is on the server.** The handoff held it in React state with a
 *     `price` on every item and summed it in the browser, so the trip died
 *     with the tab and the totals were whatever the client said they were.
 *     Every amount here comes from `getCartWithTotals()`, which prices through
 *     the same `buildQuote` that checkout uses.
 *  2. **Zero is not "—".** The handoff rendered `sub ? "$" + sub : "—"` for
 *     every group subtotal, so a genuinely free group — saved places, a comped
 *     add-on — was indistinguishable from one that could not be priced at all.
 *     A priced group always renders formatted money, including a real zero;
 *     "—" now means one thing only: no price exists, and the reason is spelled
 *     out next to the line.
 *  3. **The stepper has a maximum.** See `cart-line-controls.tsx`.
 *  4. **"Complete booking" is a link to a real URL.** The handoff's button
 *     called `openAuth("signup")` and, on return, left you on the cart with no
 *     memory of what you had been doing — so you pressed it twice. `/checkout`
 *     is a page you can link, bookmark and come back to, and the sign-in
 *     detour there carries its own return intent.
 *
 * Dynamic by necessity: the cart is per-visitor and reads cookies. It is
 * excluded from indexing for the same reason.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { HOME_HREF } from '@/components/layout/routes'
import { Breadcrumbs, Button, LinkButton } from '@/components/shared'
import { NO_PRICE, TRIP_KIND_ICON, TripLine } from '@/components/trip'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { bookingsOpen } from '@/lib/bookings-open'
import { getCartWithTotals, type CartGroupView } from '@/lib/cart'
import { formatMoney } from '@/lib/money'

import { toLocale } from '../_seo-hreflang'
import { QuantityControl, RemoveButton } from './cart-line-controls'

/** The cart is per-visitor: there is nothing here to prerender or cache. */
export const dynamic = 'force-dynamic'

const ACTIVITIES_HREF = '/activities'
const CHECKOUT_HREF = '/checkout'

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('ct2_title'),
    description: t('ct2_sub'),
    // A cart has no business in an index, and no canonical worth declaring.
    robots: { index: false, follow: false },
  }
}

export default async function CartPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const cart = await getCartWithTotals()

  const crumbs = [{ label: t('c_home'), href: HOME_HREF }, { label: t('ct2_title') }]
  const isEmpty = cart === null || cart.itemCount === 0

  return (
    <div className="bt-detailwrap">
      <div className="wrap">
        <Breadcrumbs trail={crumbs} label={t('c_breadcrumb')} />
      </div>

      <div className="wrap">
        <div className="bt-sec-head" style={{ marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(28px,5vw,42px)' }}>{t('ct2_title')}</h1>
            <p className="lede" style={{ marginTop: 10 }}>
              {t('ct2_sub')}
            </p>
          </div>
        </div>

        {isEmpty ? (
          <div className="bt-cart-empty2">
            <span
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'var(--ivory-2)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="cart" size={32} color="var(--muted)" />
            </span>
            <h2 style={{ fontSize: 20 }}>{t('ct2_empty')}</h2>
            <p className="muted" style={{ fontSize: 14.5, maxWidth: '42ch' }}>
              {t('ct2_empty_b')}
            </p>
            <LinkButton href={ACTIVITIES_HREF} variant="orange">
              {t('ct2_browse')}
            </LinkButton>
          </div>
        ) : (
          <div className="bt-cart-grid">
            <div className="bt-cart-lines">
              {cart.groups.map((group) => (
                <section key={group.kind} aria-labelledby={`bt-cart-grp-${group.kind}`}>
                  <h2 className="bt-cart-grouphead" id={`bt-cart-grp-${group.kind}`}>
                    <Icon name={TRIP_KIND_ICON[group.kind]} size={17} color="var(--forest)" />
                    {t(`ct2_grp_${group.kind}`)}{' '}
                    <span className="muted">· {format.number(group.lines.length)}</span>
                  </h2>

                  {group.lines.map((line) => (
                    <TripLine
                      key={line.id}
                      line={line}
                      locale={locale}
                      controls={
                        <>
                          {/*
                            Only activities are sold by quantity: an itinerary
                            is bought once, a saved place is free, and a
                            driver's quantity is days derived from its dates.
                          */}
                          {line.kind === 'activity' && line.maxQuantity !== null && (
                            <QuantityControl
                              itemId={line.id}
                              quantity={line.quantity}
                              max={line.maxQuantity}
                              label={t('ct2_qty')}
                              decreaseLabel={t('c_qty_dec')}
                              increaseLabel={t('c_qty_inc')}
                            />
                          )}
                          <RemoveButton itemId={line.id} label={t('ct2_remove')} />
                        </>
                      }
                    />
                  ))}
                </section>
              ))}
            </div>

            <aside className="bt-booking" aria-labelledby="bt-cart-summary">
              <h2 id="bt-cart-summary" style={{ fontSize: 18, marginBottom: 14 }}>
                {t('ad_summary')}
              </h2>

              <div className="bt-summary" style={{ marginTop: 0 }}>
                {cart.groups.map((group) => (
                  <div key={group.kind} className="bt-summary-row">
                    <span className="muted">
                      {`${t(`ct2_grp_${group.kind}`)} (${format.number(group.lines.length)})`}
                    </span>
                    <span style={{ fontWeight: 700 }}>{summaryValue(group, locale)}</span>
                  </div>
                ))}
                <div className="bt-summary-total">
                  <span>{t('c_total')}</span>
                  <span>{formatMoney(cart.totalMinor, cart.currency, locale)}</span>
                </div>
              </div>

              {!bookingsOpen() ? (
                <>
                  <p className="bt-errmsg" style={{ marginTop: 14 }}>
                    <Icon name="cal" size={12} color="var(--orange-deep)" />
                    {t('bk_closed_b')}
                  </p>
                  <Button variant="orange" block disabled style={{ marginTop: 8 }}>
                    {t('ct2_complete')}
                  </Button>
                  <LinkButton href="/custom" variant="ghost" block style={{ marginTop: 10 }}>
                    {t('bk_closed_cta')}
                  </LinkButton>
                </>
              ) : cart.ok ? (
                <LinkButton href={CHECKOUT_HREF} variant="orange" block style={{ marginTop: 14 }}>
                  {t('ct2_complete')} <Icon name="arrow" size={17} color="#fff" className="flip" />
                </LinkButton>
              ) : (
                <>
                  <p className="bt-errmsg" style={{ marginTop: 14 }}>
                    <Icon name="cross" size={12} color="var(--orange-deep)" />
                    {t('ct2_blocked')}
                  </p>
                  <Button variant="orange" block disabled style={{ marginTop: 8 }}>
                    {t('ct2_complete')}
                  </Button>
                </>
              )}

              <LinkButton href={ACTIVITIES_HREF} variant="ghost" block style={{ marginTop: 10 }}>
                {t('ct2_browse')}
              </LinkButton>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Group subtotal.
 *
 * Formatted money whenever the group has priced lines — a free group shows a
 * real zero rather than the handoff's dash. "—" is reserved for a group in
 * which nothing at all could be priced.
 */
function summaryValue(group: CartGroupView, locale: Locale): string {
  const pricedLines = group.lines.length - group.unpricedCount
  if (pricedLines === 0) return NO_PRICE
  return formatMoney(group.subtotalMinor, group.currency, locale)
}
