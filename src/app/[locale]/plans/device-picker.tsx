'use client'

/**
 * Device-count stepper on a plan card (owner, Nov 2026): plans are sold per
 * device. Shown only when the plan sells extra devices. The total here is a
 * preview — the server clamps the count and prices it again at checkout
 * (`buildQuote` → `planTotalMinor`); only the count travels, as `?devices=n`.
 */

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Money } from '@/components/currency/currency-context'
import { Icon } from '@/components/ui'
import { planDeviceRange, planTotalMinor, type PlanDeviceFacts } from '@/lib/pricing/plan-devices'

export function DevicePicker({
  plan,
  currency,
  buyHref,
  ctaLabel,
  ctaClassName,
}: {
  plan: PlanDeviceFacts
  currency: string
  /** `/plans/buy/<id>` already localised; the count is appended. */
  buyHref: string
  ctaLabel: string
  ctaClassName: string
}) {
  const t = useTranslations()
  const labelId = useId()
  const { min, max } = planDeviceRange(plan)
  const [devices, setDevices] = useState(min)
  const { totalMinor } = planTotalMinor(plan, devices)
  const extra = plan.extraDevicePriceMinor ?? 0

  return (
    <>
      <div className="bt-pdev">
        <span className="bt-pdev-l" id={labelId}>
          <Icon name="phone" size={15} /> {t('pl_devices_label')}
        </span>
        <div className="bt-pdev-step" role="group" aria-labelledby={labelId}>
          <button
            type="button"
            aria-label={t('pl_devices_less')}
            disabled={devices <= min}
            onClick={() => setDevices((n) => Math.max(min, n - 1))}
          >
            −
          </button>
          <output aria-live="polite">{devices}</output>
          <button
            type="button"
            aria-label={t('pl_devices_more')}
            disabled={devices >= max}
            onClick={() => setDevices((n) => Math.min(max, n + 1))}
          >
            +
          </button>
        </div>
        <small className="muted bt-pdev-note">
          {t.rich('pl_devices_extra', {
            price: () => <Money key="x" minor={extra} currency={currency} />,
          })}
        </small>
      </div>

      <p className="bt-ptier-price">
        <strong className="bt-money">
          <Money key={totalMinor} minor={totalMinor} currency={currency} />
        </strong>
        <span>/ {t('pl_devices_count', { count: devices })}</span>
      </p>

      <a href={`${buyHref}?devices=${devices}`} rel="nofollow" className={ctaClassName}>
        {ctaLabel}
      </a>
    </>
  )
}
