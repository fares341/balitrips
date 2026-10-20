import type { OrderAdjustmentLine } from '@/db/schema'
import type { Locale } from '@/i18n/config'

/**
 * The words for the lines between subtotal and total, shared by checkout, the
 * order page, the receipt and the invoice. The caller supplies the translated
 * words; this decides which one a line gets and appends the rate.
 */
export interface AdjustmentWords {
  discount: (code: string) => string
  serviceFee: string
  bookingFee: string
  surcharge: string
  tax: string
}

export function adjustmentLabel(
  line: OrderAdjustmentLine,
  locale: Locale,
  words: AdjustmentWords,
): string {
  const rate =
    line.bps === undefined
      ? ''
      : ` (${new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
          maximumFractionDigits: 2,
        }).format(line.bps / 100)}%)`
  switch (line.kind) {
    case 'discount':
      return words.discount(line.code ?? '')
    case 'service_fee':
      return `${words.serviceFee}${rate}`
    case 'booking_fee':
      return words.bookingFee
    case 'surcharge':
      return `${words.surcharge}${rate}`
    case 'tax': {
      const own = line.label?.[locale]?.trim() || line.label?.en?.trim() || ''
      return `${own === '' ? words.tax : own}${rate}`
    }
  }
}

/** Signed amount for display: a discount is taken off. */
export function adjustmentSign(line: OrderAdjustmentLine): '−' | '+' {
  return line.kind === 'discount' ? '−' : '+'
}
