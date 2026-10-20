'use client'

/**
 * Tells the visitor's ad / analytics tags about a paid order, on the
 * confirmation page — with the event id the SERVER already stored for this
 * purchase (`serverEventId('purchase', orderId)`). Meta and TikTok drop the
 * copy their server API receives with the same id; GA4 de-duplicates on the
 * transaction id (the order number). Our own table is never written from
 * here: the server owns purchases. Without consent the tracker ignores it.
 */

import { useEffect } from 'react'

import { track } from '@/lib/analytics/client'

export function PurchaseTracker({
  eventId,
  orderNumber,
  valueMinor,
  currency,
}: {
  eventId: string
  orderNumber: string
  valueMinor: number
  currency: string
}) {
  useEffect(() => {
    // After the layout's tracker has attached its listener (effects run child-first).
    const timer = window.setTimeout(() => {
      track('purchase', { eventId, itemRef: orderNumber, valueMinor, currency })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [eventId, orderNumber, valueMinor, currency])
  return null
}
