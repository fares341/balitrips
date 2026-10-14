/**
 * The priced parts of an activity booking (handoff OrderItem `lines[]`):
 * package × units, each add-on, included ones marked rather than charged.
 *
 * Shared by the cart, the checkout review and the order confirmation so the
 * three always itemise a booking the same way. Amounts come from the server
 * (`buildQuote` for a cart, the frozen order snapshot for an order).
 */

import { getTranslations } from 'next-intl/server'

import type { Localized } from '@/db/schema/_shared'
import type { Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

export type BreakdownPart = {
  kind: 'package' | 'addon' | 'driver'
  name: Localized | null
  quantity: number
  totalMinor: number
  included?: boolean
}

export async function PriceBreakdown({
  parts,
  currency,
  locale,
}: {
  parts: readonly BreakdownPart[]
  currency: string
  locale: Locale
}) {
  const t = await getTranslations({ locale })
  const shown = parts.filter((part) => part.kind !== 'driver')
  if (shown.length === 0) return null
  return (
    <ul
      className="muted"
      style={{
        listStyle: 'none',
        margin: '6px 0 0',
        padding: 0,
        fontSize: 12.5,
        display: 'grid',
        gap: 2,
      }}
    >
      {shown.map((part, index) => {
        const name = pick(part.name, locale, part.kind === 'package' ? t('act_base_line') : '')
        return (
          <li key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>
              {name}
              {part.quantity > 1 && !part.included ? (
                <span dir="ltr"> × {part.quantity}</span>
              ) : null}
            </span>
            <span dir="ltr" style={{ whiteSpace: 'nowrap' }}>
              {part.included ? t('act_included') : formatMoney(part.totalMinor, currency, locale)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
