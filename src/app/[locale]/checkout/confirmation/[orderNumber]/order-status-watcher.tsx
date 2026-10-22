'use client'

/**
 * Waits for the webhook.
 *
 * `checkout()` leaves the order `pending`: only a verified provider event
 * moves it to `paid`, and providers routinely deliver that event before the
 * customer's browser returns — so a customer who lands here right after 3-D
 * Secure will, quite normally, see "processing" for a second or two.
 *
 * Polling re-renders the server component rather than fetching a status
 * endpoint, so the page it converges on is the real page. It stops after
 * about a minute; by then the answer is "we will email you".
 *
 * On success it also resets the header badge: the webhook emptied the cart
 * server-side but could not reach this browser's count cookie.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT, CART_COUNT_COOKIE } from '@/components/layout/routes'
import { useRouter } from '@/i18n/routing'
import type { PaymentState } from '@/lib/orders/booking-status'

/** 3s between polls, 20 polls: one minute of patience, then a message. */
const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 20

export type OrderStatusWatcherProps = {
  state: PaymentState
}

export function OrderStatusWatcher({ state }: OrderStatusWatcherProps) {
  const t = useTranslations()
  const router = useRouter()
  const [exhausted, setExhausted] = useState(false)
  const attempts = useRef(0)

  useEffect(() => {
    // The checkout is done (paid, or the card held for the supplier).
    if (state !== 'success' && state !== 'authorized') return
    document.cookie = `${CART_COUNT_COOKIE}=0; path=/; max-age=${60 * 60 * 24 * 60}; samesite=lax`
    window.dispatchEvent(new Event(CART_CHANGED_EVENT))
  }, [state])

  useEffect(() => {
    if (state !== 'processing') return
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
  }, [state, router])

  if (state !== 'processing') return null

  return (
    <p className="cf-wait" aria-live="polite">
      {exhausted ? t('cf_slow') : t('cf_b_pending')}
    </p>
  )
}
