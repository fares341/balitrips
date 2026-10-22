'use client'

/**
 * Buy the itinerary, with the optional VIP map as a separate line (phase 3,
 * map access `vip_addon`). The box is unticked by default: VIP is never
 * added without the traveller choosing it. Both lines are priced on the
 * server; VIP is granted only when the order is paid.
 */

import { useId, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { useToast } from '@/components/shared'
import { useRouter } from '@/i18n/routing'

import { addToCartAction, addVipAction } from '../../my-trip/actions'

export function ItineraryBuyBox({
  itineraryId,
  vip,
  audiences = [],
  className,
  children,
}: {
  itineraryId: string
  /**
   * Who the plan can be for (the itinerary's audience labels). With two or
   * more, the buyer picks one before buying: one product, several audiences.
   */
  audiences?: readonly string[]
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
  const [audience, setAudience] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const groupId = useId()
  const fieldset = useRef<HTMLFieldSetElement>(null)
  const choose = audiences.length > 1

  return (
    <div className="it-buybox">
      {choose && (
        <fieldset
          ref={fieldset}
          className="it-audience"
          aria-describedby={missing ? `${groupId}-err` : undefined}
          style={{ border: 0, margin: '0 0 10px', padding: 0, display: 'grid', gap: 6 }}
        >
          <legend style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            {t('it_aud_pick')}
          </legend>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {audiences.map((label) => (
              <label
                key={label}
                className={audience === label ? 'chip is-active' : 'chip'}
                style={{ cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name={`${groupId}-aud`}
                  value={label}
                  checked={audience === label}
                  onChange={() => {
                    setAudience(label)
                    setMissing(false)
                  }}
                  style={{ marginInlineEnd: 6 }}
                />
                {label}
              </label>
            ))}
          </div>
          {missing && (
            <small id={`${groupId}-err`} role="alert" style={{ color: 'var(--danger, #b42318)' }}>
              {t('it_aud_required')}
            </small>
          )}
        </fieldset>
      )}
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
          if (choose && audience === null) {
            setMissing(true)
            fieldset.current?.querySelector('input')?.focus()
            return
          }
          void (async () => {
            setBusy(true)
            try {
              const result = await addToCartAction({
                kind: 'itinerary',
                refId: itineraryId,
                audience,
              })
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
