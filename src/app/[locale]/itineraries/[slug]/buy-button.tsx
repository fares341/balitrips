'use client'

/**
 * "Buy the itinerary": adds it to My Trip (server action, server-priced) and
 * opens My Trip. The link it replaces (`/my-trip?add=itinerary&slug=`) was
 * never read by anything, so the button opened an empty trip.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { useToast } from '@/components/shared'
import { useRouter } from '@/i18n/routing'

import { addToCartAction } from '../../my-trip/actions'

export function BuyItineraryButton({
  itineraryId,
  className,
  style,
  children,
}: {
  itineraryId: string
  className: string
  style?: CSSProperties
  children: ReactNode
}) {
  const t = useTranslations()
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      className={busy ? `${className} is-loading` : className}
      style={style}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => {
        void (async () => {
          setBusy(true)
          try {
            const result = await addToCartAction({ kind: 'itinerary', refId: itineraryId })
            if (!result.ok) {
              toast(t(result.reason === 'bookings_closed' ? 'bk_closed_t' : 'c_error'))
              return
            }
            window.dispatchEvent(new Event(CART_CHANGED_EVENT))
            router.push('/my-trip')
          } catch {
            toast(t('c_error'))
          } finally {
            setBusy(false)
          }
        })()
      }}
    >
      {children}
    </button>
  )
}
