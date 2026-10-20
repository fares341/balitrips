'use client'

/**
 * "Add VIP" at checkout (phase 3): adds the VIP plan as its own line and
 * reloads the checkout so the total the traveller agrees to includes it.
 * Never pre-selected; the server re-checks the Studio switch and the plan.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { useToast } from '@/components/shared'
import { useRouter } from '@/i18n/routing'

import { addVipAction } from '../my-trip/actions'

export function VipUpsellButton({ planId, label }: { planId: string; label: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className={busy ? 'btn btn-orange btn-sm is-loading' : 'btn btn-orange btn-sm'}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => {
        void (async () => {
          setBusy(true)
          try {
            const result = await addVipAction(planId, 'upsell')
            if (!result.ok) {
              toast(t(result.reason === 'bookings_closed' ? 'bk_closed_t' : 'c_error'))
              return
            }
            window.dispatchEvent(new Event(CART_CHANGED_EVENT))
            router.refresh()
          } catch {
            toast(t('c_error'))
          } finally {
            setBusy(false)
          }
        })()
      }}
    >
      {label}
    </button>
  )
}
