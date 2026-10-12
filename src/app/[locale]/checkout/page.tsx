/**
 * Checkout.
 *
 * The handoff had no checkout. `CartPage.complete()` was three lines: if there
 * is no user, open the signup modal and return; otherwise flip a boolean, empty
 * the cart and scroll to the top. No order, no payment, no terms, and — the
 * part that made it unusable — no memory of what you had been doing, so after
 * creating an account you landed back on the cart and had to press the button
 * a second time.
 *
 * This page fixes that at the root. It has a URL, so signing in mid-flow is a
 * round trip that ends *here*: the sign-in detour records where it came from,
 * in a `?next=` parameter and an httpOnly cookie, and `mergeAnonymousCart`
 * folds the trip built while signed out into the new account. The cart is
 * never destroyed at the moment it is most valuable.
 *
 * The total shown is the server's, recomputed from the catalogue by
 * `buildQuote`. Nothing on this page is trusted to price anything: the hidden
 * `expectedTotalMinor` exists only so the action can refuse to charge a number
 * the customer never saw.
 */

import { randomUUID } from 'node:crypto'

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { CART_HREF, HOME_HREF } from '@/components/layout/routes'
import { Breadcrumbs, Button, LinkButton } from '@/components/shared'
import { NO_PRICE, TRIP_KIND_ICON, TripLine } from '@/components/trip'
import { Icon } from '@/components/ui'
import { bookingsOpen } from '@/lib/bookings-open'
import { getCartWithTotals, getSessionUser, mergeAnonymousCartOnSignIn } from '@/lib/cart'
import { formatMoney } from '@/lib/money'

import { toLocale } from '../_seo-hreflang'
import { beginSignInAction } from './actions'
import { CheckoutForm } from './checkout-form'

/** Per-visitor and money-bearing: never cached, never prerendered. */
export const dynamic = 'force-dynamic'

const ACTIVITIES_HREF = '/activities'

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('chk_title'),
    description: t('chk_sub'),
    robots: { index: false, follow: false },
  }
}

export default async function CheckoutPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })

  const user = await getSessionUser()

  /*
   * Arriving here straight after signing up is the normal path, so the merge
   * runs on render as well as in the action. It is idempotent and a no-op when
   * there is no anonymous token, which is why it is safe to call twice.
   */
  if (user) await mergeAnonymousCartOnSignIn(user.id)

  const cart = await getCartWithTotals()

  const crumbs = [
    { label: t('c_home'), href: HOME_HREF },
    { label: t('ct2_title'), href: CART_HREF },
    { label: t('chk_title') },
  ]

  const shell = (children: React.ReactNode) => (
    <div className="bt-detailwrap">
      <div className="wrap">
        <Breadcrumbs trail={crumbs} label={t('c_breadcrumb')} />
      </div>
      <div className="wrap">
        <div className="bt-sec-head" style={{ marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(28px,5vw,42px)' }}>{t('chk_title')}</h1>
            <p className="lede" style={{ marginTop: 10 }}>
              {t('chk_sub')}
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )

  // ---------------------------------------------------------------------
  // Bookings closed: no pay box, no sign-in prompt, no idempotency key minted.
  // Above the signed-out branch so a visitor is never asked to sign in for
  // something that cannot complete. Safe to read the flag here -- this route
  // is force-dynamic, so the value is not baked at build time.
  // ---------------------------------------------------------------------
  if (!bookingsOpen()) {
    return shell(
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
          <Icon name="cal" size={30} color="var(--forest)" />
        </span>
        <h2 style={{ fontSize: 20 }}>{t('bk_closed_t')}</h2>
        <p className="muted" style={{ fontSize: 14.5, maxWidth: '46ch' }}>
          {t('bk_closed_b')}
        </p>
        <LinkButton href="/custom" variant="orange">
          {t('bk_closed_cta')}
        </LinkButton>
      </div>,
    )
  }

  // ---------------------------------------------------------------------
  // Signed out: prompt, remember, come back here.
  // ---------------------------------------------------------------------
  if (!user) {
    return shell(
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
          <Icon name="lock" size={30} color="var(--forest)" />
        </span>
        <h2 style={{ fontSize: 20 }}>{t('chk_signin_t')}</h2>
        <p className="muted" style={{ fontSize: 14.5, maxWidth: '46ch' }}>
          {t('chk_signin_b')}
        </p>

        {/*
          A form, not a link: a Server Component render cannot write cookies,
          and the pending-checkout cookie is precisely what stops the visitor
          from having to press "complete booking" twice.
        */}
        <form action={beginSignInAction}>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="orange">
            {t('auth_in_btn')} <Icon name="arrow" size={17} color="#fff" className="flip" />
          </Button>
        </form>

        <LinkButton href={CART_HREF} variant="ghost" size="sm">
          {t('c_backto')} {t('ct2_title')}
        </LinkButton>
      </div>,
    )
  }

  // ---------------------------------------------------------------------
  // Nothing to buy.
  // ---------------------------------------------------------------------
  if (cart === null || cart.itemCount === 0) {
    return shell(
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
      </div>,
    )
  }

  /**
   * New per render, so a double-click submits the *same* key and cannot buy
   * the trip twice, while a genuine retry after a decline gets a fresh one.
   */
  const idempotencyKey = randomUUID()

  return shell(
    <div className="bt-cart-grid">
      <div className="bt-cart-lines">
        <section aria-labelledby="bt-chk-review">
          <h2 className="bt-cart-grouphead" id="bt-chk-review">
            <Icon name="calcheck" size={17} color="var(--forest)" />
            {t('chk_review')} <span className="muted">· {format.number(cart.itemCount)}</span>
          </h2>

          {cart.groups.flatMap((group) =>
            group.lines.map((line) => (
              <TripLine key={line.id} line={line} locale={locale} size={64} />
            )),
          )}
        </section>

        {!cart.ok && (
          <p className="bt-errmsg">
            <Icon name="cross" size={12} color="var(--orange-deep)" />
            {t('ct2_blocked')}
          </p>
        )}

        <div>
          <LinkButton href={CART_HREF} variant="ghost" size="sm">
            {t('c_backto')} {t('ct2_title')}
          </LinkButton>
        </div>
      </div>

      <aside className="bt-booking" aria-labelledby="bt-chk-summary">
        <h2 id="bt-chk-summary" style={{ fontSize: 18, marginBottom: 14 }}>
          {t('ad_summary')}
        </h2>

        {cart.ok ? (
          <CheckoutForm
            expectedTotalMinor={cart.totalMinor}
            currency={cart.currency}
            idempotencyKey={idempotencyKey}
          >
            <div className="bt-summary" style={{ marginTop: 0 }}>
              {cart.groups.map((group) => {
                const priced = group.lines.length - group.unpricedCount
                return (
                  <div key={group.kind} className="bt-summary-row">
                    <span className="muted">
                      <Icon name={TRIP_KIND_ICON[group.kind] ?? 'pdf'} size={13} />{' '}
                      {`${t(`ct2_grp_${group.kind}`)} (${format.number(group.lines.length)})`}
                    </span>
                    <span style={{ fontWeight: 700 }}>
                      {priced === 0
                        ? NO_PRICE
                        : formatMoney(group.subtotalMinor, group.currency, locale)}
                    </span>
                  </div>
                )
              })}
              <div className="bt-summary-total">
                <span>{t('c_total')}</span>
                <span>{formatMoney(cart.totalMinor, cart.currency, locale)}</span>
              </div>
            </div>
          </CheckoutForm>
        ) : (
          <>
            <div className="bt-summary" style={{ marginTop: 0 }}>
              <div className="bt-summary-total">
                <span>{t('c_total')}</span>
                <span>{formatMoney(cart.totalMinor, cart.currency, locale)}</span>
              </div>
            </div>
            <p className="bt-errmsg" style={{ marginTop: 12 }}>
              <Icon name="cross" size={12} color="var(--orange-deep)" />
              {t('ct2_blocked')}
            </p>
            <LinkButton href={CART_HREF} variant="orange" block style={{ marginTop: 8 }}>
              {t('ct2_title')}
            </LinkButton>
          </>
        )}
      </aside>
    </div>,
  )
}
