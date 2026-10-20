import type { coupons } from '@/db/schema'
import { formatMoney } from '@/lib/money'

type CouponRow = typeof coupons.$inferSelect

export type CouponState = 'live' | 'off' | 'scheduled' | 'ended'

/** What the owner needs to know at a glance: does this code work right now? */
export function couponStateOf(
  row: Pick<CouponRow, 'active' | 'validFrom' | 'validTo'>,
  now: Date,
): CouponState {
  if (!row.active) return 'off'
  if (row.validFrom !== null && now < row.validFrom) return 'scheduled'
  if (row.validTo !== null && now > row.validTo) return 'ended'
  return 'live'
}

export function couponValueLabel(
  row: Pick<CouponRow, 'type' | 'value' | 'currency'>,
  intl: string,
): string {
  if (row.type === 'fixed') return formatMoney(row.value, row.currency ?? 'USD', intl)
  return `${new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(row.value / 100)}%`
}
