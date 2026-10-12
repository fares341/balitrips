'use client'

/**
 * The pay box.
 *
 * Wraps the server-computed summary (passed in as children, rendered on the
 * server) in the one interactive thing checkout needs: an explicit acceptance
 * of the cancellation policy, and a submit button that cannot be pressed twice.
 *
 * Nothing here computes or carries an amount that matters.
 * `expectedTotalMinor` is the total the customer actually *saw*; the action
 * compares it against a freshly computed quote and refuses to charge on a
 * mismatch rather than quietly billing a different number. The value being in
 * the DOM is the point — it is evidence of what was displayed, not an input to
 * the price.
 *
 * The terms checkbox is never pre-checked. A pre-checked box is not consent
 * and is worth nothing in a dispute, which is the only reason
 * `terms_accepted_at` and `terms_version` exist on the order.
 */

import { useActionState, useId } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { formatMoney } from '@/lib/money'

import { startCheckoutAction } from './actions'
import { INITIAL_CHECKOUT_STATE, type CheckoutErrorCode } from './constants'

const ERROR_KEY: Record<CheckoutErrorCode, string> = {
  bookings_closed: 'bk_closed_b',
  terms: 'chk_err_terms',
  sign_in: 'chk_err_signin',
  empty: 'ct2_empty',
  invalid_cart: 'ct2_blocked',
  price_changed: 'chk_err_price',
  capacity: 'chk_err_capacity',
  payment: 'chk_err_payment',
  unknown: 'c_error',
}

export type CheckoutFormProps = {
  /** Total the page displayed, in minor units. Evidence, not an input. */
  expectedTotalMinor: number
  currency: string
  /** Stable per rendered form, so a double submit cannot buy the trip twice. */
  idempotencyKey: string
  /** The server-rendered summary rows. */
  children: ReactNode
}

export function CheckoutForm({
  expectedTotalMinor,
  currency,
  idempotencyKey,
  children,
}: CheckoutFormProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const [state, formAction, pending] = useActionState(startCheckoutAction, INITIAL_CHECKOUT_STATE)

  const baseId = useId()
  const termsId = `${baseId}-terms`
  const errorId = `${baseId}-error`

  const error = state.error
  const termsInvalid = error === 'terms'

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="expectedTotalMinor" value={expectedTotalMinor} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {children}

      <div className="bt-field" style={{ marginTop: 16 }}>
        <label
          htmlFor={termsId}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 }}
        >
          <input
            id={termsId}
            type="checkbox"
            name="terms"
            style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
            aria-invalid={termsInvalid}
            aria-describedby={error === null ? undefined : errorId}
          />
          <span>{t('chk_terms')}</span>
        </label>

        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          <Link href="/refund">{t('ft_p_refund')}</Link>
          {' · '}
          <Link href="/terms">{t('ft_p_terms')}</Link>
        </p>
      </div>

      {error !== null && (
        <p className="bt-errmsg" id={errorId} role="alert" style={{ marginTop: 4 }}>
          <Icon name="cross" size={12} color="var(--orange-deep)" />
          {t(ERROR_KEY[error])}
          {error === 'price_changed' && state.newTotalMinor !== undefined && (
            <> {formatMoney(state.newTotalMinor, state.currency ?? currency, locale)}</>
          )}
        </p>
      )}

      <Button type="submit" variant="orange" block disabled={pending} style={{ marginTop: 12 }}>
        {pending ? t('c_loading') : t('cart_checkout')}
        {!pending && <Icon name="lock" size={16} color="#fff" />}
      </Button>

      <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
        {t('chk_secure')}
      </p>
    </form>
  )
}
