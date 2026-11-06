'use client'

/**
 * «اختر باقتك» (phase 2, design 03): exactly two options — «الجدول فقط» and
 * «الجدول + الخريطة» — then «متابعة», which puts the choice in the existing
 * cart and opens the existing checkout. Every price shown here was computed
 * on the server and is display only; the server prices the cart again.
 *
 * On a phone the box's button is repeated in a bar fixed to the bottom of
 * the screen, so «متابعة» is always one tap away.
 */

import { useId, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { useToast } from '@/components/shared'
import { Icon } from '@/components/ui'
import { useRouter } from '@/i18n/routing'

import { buyItineraryAction } from './actions'

export interface PackageOption {
  key: 'itineraryOnly' | 'withMap'
  label: string
  badge: string | null
  /** What the buyer pays for this option (formatted <Money>). */
  price: ReactNode
  /** Struck-through full price, or null. */
  was: ReactNode | null
  /** «وفّر X», or null. */
  saving: ReactNode | null
  note: string | null
}

export interface PackageTier {
  key: string
  label: string
  price: ReactNode
}

export function PackageBox({
  slug,
  options,
  tiers = [],
  title,
  footnote,
}: {
  slug: string
  options: readonly PackageOption[]
  tiers?: readonly PackageTier[]
  title: string
  footnote: ReactNode
}) {
  const t = useTranslations()
  const router = useRouter()
  const { toast } = useToast()
  const groupId = useId()
  const [choice, setChoice] = useState<PackageOption['key']>(
    options.find((one) => one.key === 'withMap')?.key ?? options[0]?.key ?? 'itineraryOnly',
  )
  const [tier, setTier] = useState<string | null>(tiers[0]?.key ?? null)
  const [busy, setBusy] = useState(false)
  const chosen = options.find((one) => one.key === choice) ?? options[0]

  const go = () => {
    void (async () => {
      setBusy(true)
      try {
        const result = await buyItineraryAction({ slug, withMap: choice === 'withMap', tier })
        if (!result.ok) {
          toast(t(result.reason === 'bookings_closed' ? 'bk_closed_t' : 'c_error'))
          return
        }
        window.dispatchEvent(new Event(CART_CHANGED_EVENT))
        router.push('/checkout')
      } catch {
        toast(t('c_error'))
      } finally {
        setBusy(false)
      }
    })()
  }

  const button = (className: string) => (
    <button
      type="button"
      className={busy ? `${className} is-loading` : className}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={go}
    >
      {t('itp_continue')}
    </button>
  )

  return (
    <>
      <div className="itp-box">
        <h2 className="itp-box-t">{title}</h2>
        {tiers.length > 1 && (
          <fieldset className="it-tiers">
            <legend>{t('it_tier_pick')}</legend>
            {tiers.map((one) => (
              <label key={one.key} className="it-tier">
                <input
                  type="radio"
                  name={`${groupId}-tier`}
                  value={one.key}
                  checked={tier === one.key}
                  onChange={() => setTier(one.key)}
                />
                <span className="it-tier-t">
                  <b>{one.label}</b>
                </span>
                <span className="it-tier-p">
                  <bdi dir="ltr">{one.price}</bdi>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <fieldset className="itp-opts">
          <legend className="sr-only">{title}</legend>
          {options.map((option) => (
            <label key={option.key} className="itp-opt">
              <input
                type="radio"
                name={`${groupId}-opt`}
                value={option.key}
                checked={choice === option.key}
                onChange={() => setChoice(option.key)}
              />
              <span className="itp-opt-main">
                <span className="itp-opt-head">
                  <b>{option.label}</b>
                  {option.badge !== null && <span className="itp-badge">{option.badge}</span>}
                </span>
                {option.note !== null && <small className="muted">{option.note}</small>}
                {option.saving !== null && <span className="itp-save">{option.saving}</span>}
              </span>
              <span className="itp-opt-price">
                {option.was !== null && <s className="muted">{option.was}</s>}
                <strong className="bt-money">{option.price}</strong>
              </span>
            </label>
          ))}
        </fieldset>
        {button('btn btn-primary btn-block')}
        <ul className="itp-promises">
          <li>
            <Icon name="download" size={15} /> {t('itp_p_instant')}
          </li>
          <li>
            <Icon name="doc" size={15} /> {t('itp_p_offline')}
          </li>
          <li>
            <Icon name="check" size={15} /> {t('itp_p_updates')}
          </li>
        </ul>
        <p className="itp-digital">{footnote}</p>
      </div>

      <div className="itp-mbar" role="region" aria-label={title}>
        <span className="itp-mbar-price">
          <small>{chosen?.label}</small>
          <strong className="bt-money">{chosen?.price}</strong>
        </span>
        {button('btn btn-primary')}
      </div>
    </>
  )
}
