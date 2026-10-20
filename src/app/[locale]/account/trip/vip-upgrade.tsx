'use client'

/**
 * "Upgrade to VIP" on My Trip (phase 3, itineraries sold with `vip_later`):
 * adds the VIP plan to the trip as its own line and opens the trip. Priced on
 * the server; VIP is granted only once that order is paid.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { useToast } from '@/components/shared'
import { useRouter } from '@/i18n/routing'

import { addVipAction } from '../../my-trip/actions'

export function VipUpgradeButton({ planId, label }: { planId: string; label: string }) {
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
            const result = await addVipAction(planId, 'addon')
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
      {label}
    </button>
  )
}
