'use client'

/**
 * Buy the itinerary, with the optional VIP map as a separate line (phase 3,
 * map access `vip_addon`). The box is unticked by default: VIP is never
 * added without the traveller choosing it. Both lines are priced on the
 * server; VIP is granted only when the order is paid.
 */

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { useToast } from '@/components/shared'
import { useRouter } from '@/i18n/routing'

import { addToCartAction, addVipAction } from '../../my-trip/actions'

export function ItineraryBuyBox({
  itineraryId,
  vip,
  className,
  children,
}: {
  itineraryId: string
  /** Offered when set: the plan and its price, already formatted. */
  vip: { planId: string; label: string; note: string | null } | null
  className: string
  children: ReactNode
}) {
  const t = useTranslations()
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [withVip, setWithVip] = useState(false)

  return (
    <div className="it-buybox">
      {vip !== null && (
        <label className="it-vipaddon">
          <input
            type="checkbox"
            checked={withVip}
            onChange={(event) => setWithVip(event.target.checked)}
          />
          <span>
            <b>{vip.label}</b>
            <small className="muted">{t('p3_vip_addon_b')}</small>
            {vip.note !== null && <small className="muted">{vip.note}</small>}
          </span>
        </label>
      )}
      <button
        type="button"
        className={busy ? `${className} is-loading` : className}
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
              if (withVip && vip !== null) {
                const added = await addVipAction(vip.planId, 'addon')
                if (!added.ok) toast(t('c_error'))
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
    </div>
  )
}
