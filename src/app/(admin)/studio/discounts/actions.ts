'use server'

import { eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { couponRedemptions, coupons } from '@/db/schema'
import { COUPON_KINDS, isValidCouponCode } from '@/lib/finance/coupons'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbaliDateTime } from '../../_lib/bali-time'
import {
  fbool,
  fcurrency,
  fenum,
  fintOrNull,
  fmoneyOrNull,
  fmulti,
  fpercent,
  freq,
  fstr,
  isUuid,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/**
 * Discount codes. Admin only (`discounts.write`): a code is money off every
 * order that uses it, so creating or changing one is a financial edit.
 * Every save is audited with the before/after values.
 */

const LIST = adminHref('/discounts')

export async function saveCoupon(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('discounts.write')
  const { t } = await getAdminI18n()
  const isNew = id === 'new'
  let target = isNew ? adminHref('/discounts/new') : adminHref(`/discounts/${id}`)
  let outcome: { ok: string } | { err: string }
  try {
    if (!isNew && !isUuid(id)) throw new Error(t('disc.err_gone'))
    const code = freq(form, 'code', t('disc.code')).toUpperCase()
    if (!isValidCouponCode(code)) throw new Error(t('disc.err_code'))
    const type = fenum(form, 'type', ['percent', 'fixed'] as const, 'percent')
    const currencyText = (fstr(form, 'currency') ?? '').toUpperCase()
    const currency = currencyText === '' ? null : fcurrency(form, 'currency')
    if (type === 'fixed' && currency === null) throw new Error(t('disc.err_currency_fixed'))
    const value =
      type === 'percent'
        ? fpercent(form, 'value', 0, t('disc.value'))
        : (fmoneyOrNull(form, 'value', currency ?? 'USD', t('disc.value')) ?? 0)
    if (value <= 0) throw new Error(t('disc.err_value'))
    if (type === 'percent' && value > 10_000) throw new Error(t('disc.err_percent'))
    const minSubtotalMinor = fmoneyOrNull(
      form,
      'minSubtotal',
      currency ?? 'USD',
      t('disc.min_subtotal'),
    )
    if (minSubtotalMinor !== null && minSubtotalMinor > 0 && currency === null) {
      throw new Error(t('disc.err_currency_min'))
    }
    const validFrom = fbaliDateTime(form, 'validFrom', t('disc.valid_from'))
    const validTo = fbaliDateTime(form, 'validTo', t('disc.valid_to'))
    if (validFrom && validTo && validTo < validFrom) throw new Error(t('disc.err_dates'))
    const maxUses = fintOrNull(form, 'maxUses', t('disc.max_uses'))
    const maxUsesPerCustomer = fintOrNull(form, 'maxUsesPerCustomer', t('disc.max_per_customer'))
    if (
      (maxUses !== null && maxUses < 1) ||
      (maxUsesPerCustomer !== null && maxUsesPerCustomer < 1)
    ) {
      throw new Error(t('disc.err_uses'))
    }
    const appliesTo = fenum(form, 'appliesTo', ['all', 'kinds', 'items'] as const, 'all')
    const appliesKinds = fmulti(form, 'kinds').filter((kind) =>
      (COUPON_KINDS as readonly string[]).includes(kind),
    )
    const appliesItems = fmulti(form, 'items').filter(isUuid).slice(0, 500)
    if (appliesTo === 'kinds' && appliesKinds.length === 0) throw new Error(t('disc.err_kinds'))
    if (appliesTo === 'items' && appliesItems.length === 0) throw new Error(t('disc.err_items'))

    const values = {
      code,
      type,
      value,
      currency,
      minSubtotalMinor: minSubtotalMinor !== null && minSubtotalMinor > 0 ? minSubtotalMinor : null,
      validFrom,
      validTo,
      maxUses,
      maxUsesPerCustomer,
      appliesTo,
      appliesKinds: appliesTo === 'kinds' ? appliesKinds : null,
      appliesItems: appliesTo === 'items' ? appliesItems : null,
      active: fbool(form, 'active'),
      internalNote: (fstr(form, 'internalNote') ?? '').slice(0, 2000) || null,
    }

    // Another code with the same letters (any case) is refused with a sentence, not a 500.
    const [clash] = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(sql`lower(${coupons.code}) = lower(${code})`)
      .limit(1)
    if (clash && clash.id !== id) throw new Error(t('disc.err_duplicate'))

    await db.transaction(async (tx) => {
      if (isNew) {
        const [row] = await tx
          .insert(coupons)
          .values({ ...values, createdBy: session.userId })
          .returning()
        if (!row) throw new Error(t('disc.err_gone'))
        target = adminHref(`/discounts/${row.id}`)
        await writeAudit(
          {
            actor: session,
            action: 'coupon.create',
            entityType: 'coupon',
            entityId: row.id,
            before: null,
            after: values,
          },
          tx,
        )
      } else {
        const [before] = await tx.select().from(coupons).where(eq(coupons.id, id)).for('update')
        if (!before) throw new Error(t('disc.err_gone'))
        await tx
          .update(coupons)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(coupons.id, id))
        await writeAudit(
          {
            actor: session,
            action: 'coupon.update',
            entityType: 'coupon',
            entityId: id,
            before,
            after: { ...before, ...values },
          },
          tx,
        )
      }
    })
    outcome = { ok: t('disc.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

/**
 * Delete a code that was never used. A used code is kept (orders point at it
 * and the usage figures need it) — switch it off instead.
 */
export async function deleteCoupon(id: string): Promise<void> {
  const session = await requireCapability('discounts.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  let target = LIST
  try {
    if (!isUuid(id)) throw new Error(t('disc.err_gone'))
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(coupons).where(eq(coupons.id, id)).for('update')
      if (!before) throw new Error(t('disc.err_gone'))
      const [used] = await tx
        .select({ id: couponRedemptions.id })
        .from(couponRedemptions)
        .where(eq(couponRedemptions.couponId, id))
        .limit(1)
      const [onOrder] = await tx.execute<{ n: number }>(
        sql`select 1 as n from orders where coupon_id = ${id} limit 1`,
      )
      if (used || onOrder) {
        target = adminHref(`/discounts/${id}`)
        throw new Error(t('disc.err_used_delete'))
      }
      await tx.delete(coupons).where(eq(coupons.id, id))
      await writeAudit(
        {
          actor: session,
          action: 'coupon.delete',
          entityType: 'coupon',
          entityId: id,
          before,
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('disc.ok_deleted') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}
