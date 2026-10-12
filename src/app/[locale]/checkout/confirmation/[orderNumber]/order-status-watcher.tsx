'use client'

/**
 * Waits for the webhook.
 *
 * `checkout()` deliberately leaves the order in `pending`: only a verified
 * provider event moves it to `paid`, because providers routinely deliver that
 * event before the customer's browser returns — and sometimes the browser
 * never returns at all. So a customer who lands here immediately after 3-D
 * Secure will, quite normally, see `pending` for a second or two.
 *
 * Polling is the honest answer to that. It re-renders the server component
 * rather than fetching a status endpoint, so the page it converges on is the
 * real page, with no second source of truth to drift.
 *
 * It stops. An interval that runs forever on a tab someone left open is a
 * self-inflicted load test, and after roughly a minute the answer is no longer
 * "wait" but "we will email you".
 *
 * It also resets the header badge. The cart is emptied server-side by the
 * webhook, which is a request from the payment provider and therefore has no
 * access to this customer's cookies — so the display hint is corrected here,
 * on the client, the moment the order is known to be paid.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT, CART_COUNT_COOKIE } from '@/components/layout/routes'
import { useRouter } from '@/i18n/routing'

/** 3s between polls, 20 polls: one minute of patience, then a message. */
const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 20

export type OrderStatusWatcherProps = {
  /** The order's current status, from the server render. */
  status: string
}

export function OrderStatusWatcher({ status }: OrderStatusWatcherProps) {
  const t = useTranslations()
  const router = useRouter()
  const [exhausted, setExhausted] = useState(false)
  const attempts = useRef(0)

  const settled = status !== 'pending'

  useEffect(() => {
    if (!settled) return
    if (status === 'cancelled') return

    // The webhook emptied the cart; the badge is a cookie the webhook could
    // not reach. It is non-httpOnly by design, precisely so this is possible.
    document.cookie = `${CART_COUNT_COOKIE}=0; path=/; max-age=${60 * 60 * 24 * 60}; samesite=lax`
    window.dispatchEvent(new Event(CART_CHANGED_EVENT))
  }, [settled, status])

  useEffect(() => {
    if (settled) return

    const timer = setInterval(() => {
      attempts.current += 1
      if (attempts.current > MAX_ATTEMPTS) {
        clearInterval(timer)
        setExhausted(true)
        return
      }
      router.refresh()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [settled, router])

  if (settled) return null

  return (
    <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }} aria-live="polite">
      {exhausted ? t('cf_slow') : t('cf_b_pending')}
    </p>
  )
}
