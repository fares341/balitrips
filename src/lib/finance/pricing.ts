import { and, count, eq, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { couponRedemptions, coupons } from '@/db/schema'
import { readSetting } from '@/app/(admin)/_lib/settings'
import type { Quote } from '@/lib/pricing/quote'

import { computeTotals, type FeeSchedule, type PricedTotals } from './adjustments'
import {
  evaluateCoupon,
  normalizeCouponCode,
  type CouponLine,
  type CouponRejection,
  type CouponRule,
} from './coupons'

/**
 * The server side of discounts, fees and tax: load the coupon and the fee
 * schedule, count paid uses, and hand everything to the pure functions.
 *
 * Used by the cart (what is shown), by checkout (what is charged and frozen
 * on the order) — the same call in both places, so they cannot disagree.
 */

export async function loadFeeSchedule(): Promise<FeeSchedule> {
  const fees = await readSetting('fees')
  return {
    enabled: fees.enabled,
    serviceFeeBps: fees.serviceFeeBps,
    bookingFeeMinor: fees.bookingFeeMinor,
    paymentSurchargeBps: fees.paymentSurchargeBps,
    feeCurrency: fees.feeCurrency,
    taxEnabled: fees.taxEnabled,
    taxRateBps: fees.taxRateBps,
    taxLabel: fees.taxLabel,
  }
}

export function couponRuleOf(row: typeof coupons.$inferSelect): CouponRule {
  return {
    id: row.id,
    code: row.code,
    type: row.type === 'fixed' ? 'fixed' : 'percent',
    value: row.value,
    currency: row.currency,
    minSubtotalMinor: row.minSubtotalMinor,
    validFrom: row.validFrom,
    validTo: row.validTo,
    maxUses: row.maxUses,
    maxUsesPerCustomer: row.maxUsesPerCustomer,
    appliesTo: row.appliesTo === 'kinds' || row.appliesTo === 'items' ? row.appliesTo : 'all',
    appliesKinds: row.appliesKinds ?? [],
    appliesItems: row.appliesItems ?? [],
    active: row.active,
  }
}

export async function findCouponByCode(code: string): Promise<CouponRule | null> {
  const wanted = normalizeCouponCode(code)
  if (wanted === '') return null
  const [row] = await db
    .select()
    .from(coupons)
    .where(sql`lower(${coupons.code}) = lower(${wanted})`)
    .limit(1)
  return row ? couponRuleOf(row) : null
}

/** Paid uses of a coupon: in total, and by this account or e-mail. */
export async function couponUsage(
  couponId: string,
  customer: { userId: string | null; email: string | null },
): Promise<{ total: number; byCustomer: number }> {
  const [total] = await db
    .select({ value: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, couponId))
  const email = customer.email?.trim().toLowerCase() || null
  const mine =
    customer.userId === null && email === null
      ? null
      : or(
          customer.userId === null ? undefined : eq(couponRedemptions.userId, customer.userId),
          email === null ? undefined : eq(couponRedemptions.email, email),
        )
  const [byCustomer] =
    mine === null || mine === undefined
      ? [{ value: 0 }]
      : await db
          .select({ value: count() })
          .from(couponRedemptions)
          .where(and(eq(couponRedemptions.couponId, couponId), mine))
  return { total: total?.value ?? 0, byCustomer: byCustomer?.value ?? 0 }
}

export interface AdjustedQuote {
  totals: PricedTotals
  /** The coupon that applied, or null. */
  coupon: { id: string; code: string } | null
  /** Why a code the customer entered did not apply. Null when none was entered or it applied. */
  couponError: CouponRejection | null
}

/**
 * Price the space between subtotal and total for a quote.
 *
 * `parents` maps a package (activity tier) id to its activity, so a code for
 * "this activity" also covers its packages.
 */
export async function adjustQuote(
  quote: Quote,
  options: {
    couponCode: string | null
    userId: string | null
    email: string | null
    parents?: ReadonlyMap<string, string>
    schedule?: FeeSchedule
    now?: Date
  },
): Promise<AdjustedQuote> {
  const schedule = options.schedule ?? (await loadFeeSchedule())
  let coupon: AdjustedQuote['coupon'] = null
  let couponError: CouponRejection | null = null
  let discount: { amountMinor: number; code: string } | null = null

  const code = options.couponCode?.trim() ?? ''
  if (code !== '' && quote.ok) {
    const rule = await findCouponByCode(code)
    if (rule === null) {
      couponError = 'not_found'
    } else {
      const usage = await couponUsage(rule.id, { userId: options.userId, email: options.email })
      const lines: CouponLine[] = quote.lines.map((line) => ({
        kind: line.kind,
        refs: [
          line.refId,
          line.refId === null ? null : (options.parents?.get(line.refId) ?? null),
        ].filter((ref): ref is string => ref !== null),
        lineTotalMinor: line.lineTotalMinor,
      }))
      const verdict = evaluateCoupon(
        rule,
        usage,
        lines,
        quote.currency,
        quote.subtotalMinor,
        options.now,
      )
      if (verdict.ok) {
        coupon = { id: rule.id, code: rule.code }
        discount = { amountMinor: verdict.discountMinor, code: rule.code }
      } else {
        couponError = verdict.reason
      }
    }
  }

  return {
    totals: computeTotals(quote.subtotalMinor, quote.currency, discount, schedule),
    coupon,
    couponError,
  }
}
