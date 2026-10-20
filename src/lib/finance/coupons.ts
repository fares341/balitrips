/**
 * Discount codes — the rules, as pure functions.
 *
 * The server is the only place a discount is decided: the cart and checkout
 * both call `evaluateCoupon` with the coupon row, its paid-use counts and the
 * priced lines, and the browser only ever sends the code. Loading and counting
 * live in `./coupons-db.ts`.
 *
 * Usage is counted from `coupon_redemptions`, which gets a row only when an
 * order is PAID (and only one per order). An abandoned checkout therefore
 * never uses up a code. The flip side: two people paying at the same moment
 * for the last use can both succeed — the owner sees it in the usage count,
 * and neither customer is charged more than they agreed to.
 */

export type CouponRejection =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'used_up'
  | 'used_up_customer'
  | 'currency'
  | 'min_subtotal'
  | 'not_applicable'

export interface CouponRule {
  id: string
  code: string
  type: 'percent' | 'fixed'
  /** percent: basis points. fixed: minor units of `currency`. */
  value: number
  currency: string | null
  minSubtotalMinor: number | null
  validFrom: Date | null
  validTo: Date | null
  maxUses: number | null
  maxUsesPerCustomer: number | null
  appliesTo: 'all' | 'kinds' | 'items'
  appliesKinds: readonly string[]
  appliesItems: readonly string[]
  active: boolean
}

export interface CouponUsage {
  /** Paid uses in total. */
  total: number
  /** Paid uses by this customer (account or e-mail). 0 when unknown. */
  byCustomer: number
}

/** A priced cart line, as far as a coupon cares. */
export interface CouponLine {
  /** Cart kind: activity | activity_tier | driver | itinerary | package | place | plan | custom */
  kind: string
  /** Every catalogue id the line stands for (a package line: its own id AND its activity). */
  refs: readonly string[]
  lineTotalMinor: number
}

export type CouponVerdict =
  | { ok: true; discountMinor: number; eligibleMinor: number }
  | { ok: false; reason: CouponRejection }

/** The product families the owner picks from. A package of an activity is an activity. */
export const COUPON_KINDS = [
  'activity',
  'itinerary',
  'package',
  'plan',
  'driver',
  'custom',
] as const
export type CouponKind = (typeof COUPON_KINDS)[number]

export function couponKindOf(kind: string): CouponKind | null {
  if (kind === 'activity' || kind === 'activity_tier') return 'activity'
  return (COUPON_KINDS as readonly string[]).includes(kind) ? (kind as CouponKind) : null
}

/** Codes are matched without case or surrounding spaces. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase()
}

/** What an owner may type as a code: letters, digits, dash and underscore, 3–40. */
export function isValidCouponCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{3,40}$/.test(code.trim())
}

function lineEligible(rule: CouponRule, line: CouponLine): boolean {
  if (line.lineTotalMinor <= 0) return false
  switch (rule.appliesTo) {
    case 'all':
      return true
    case 'kinds': {
      const kind = couponKindOf(line.kind)
      return kind !== null && rule.appliesKinds.includes(kind)
    }
    case 'items':
      return line.refs.some((ref) => rule.appliesItems.includes(ref))
  }
}

/**
 * Decide whether a code applies to these lines and how much it takes off.
 *
 * Never more than the eligible lines are worth, never negative, always an
 * integer number of minor units (a percentage rounds half up).
 */
export function evaluateCoupon(
  rule: CouponRule,
  usage: CouponUsage,
  lines: readonly CouponLine[],
  currency: string,
  subtotalMinor: number,
  now: Date = new Date(),
): CouponVerdict {
  if (!rule.active) return { ok: false, reason: 'inactive' }
  if (rule.validFrom !== null && now < rule.validFrom) return { ok: false, reason: 'not_started' }
  if (rule.validTo !== null && now > rule.validTo) return { ok: false, reason: 'expired' }
  if (rule.maxUses !== null && usage.total >= rule.maxUses) return { ok: false, reason: 'used_up' }
  if (rule.maxUsesPerCustomer !== null && usage.byCustomer >= rule.maxUsesPerCustomer) {
    return { ok: false, reason: 'used_up_customer' }
  }
  const sameCurrency = rule.currency === null || rule.currency === currency
  if (rule.type === 'fixed' && !sameCurrency) return { ok: false, reason: 'currency' }
  if (rule.minSubtotalMinor !== null && rule.minSubtotalMinor > 0) {
    if (!sameCurrency) return { ok: false, reason: 'currency' }
    if (subtotalMinor < rule.minSubtotalMinor) return { ok: false, reason: 'min_subtotal' }
  }

  const eligibleMinor = lines
    .filter((line) => lineEligible(rule, line))
    .reduce((sum, line) => sum + line.lineTotalMinor, 0)
  if (eligibleMinor <= 0) return { ok: false, reason: 'not_applicable' }

  const raw =
    rule.type === 'percent'
      ? Math.floor((eligibleMinor * Math.min(Math.max(rule.value, 0), 10_000) + 5_000) / 10_000)
      : Math.max(rule.value, 0)
  const discountMinor = Math.min(raw, eligibleMinor)
  if (discountMinor <= 0) return { ok: false, reason: 'not_applicable' }
  return { ok: true, discountMinor, eligibleMinor }
}
