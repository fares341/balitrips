/**
 * Put a live <Money> inside translated text.
 *
 * A message such as «ترقية — {price}» cannot take a React node for a
 * tag-less placeholder, so the caller formats it with MONEY_SLOT as the
 * price and this splits the string there. The price then goes through the
 * same «≈» display-currency runtime as every other catalogue price, instead
 * of being frozen as SAR text.
 */

import type { ReactNode } from 'react'

import { Money } from './currency-context'

/** Placeholder value passed to t(..., { price: MONEY_SLOT }). Private-use character. */
export const MONEY_SLOT = ''

export function withMoney(text: string, minor: number, currency: string): ReactNode {
  const parts = text.split(MONEY_SLOT)
  if (parts.length === 1) return text
  return parts.flatMap((part, index) =>
    index === 0 ? [part] : [<Money key={`m${index}`} minor={minor} currency={currency} />, part],
  )
}
