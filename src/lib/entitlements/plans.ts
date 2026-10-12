/**
 * الباقات: القراءة، التسعير، المنح عند الدفع، والصلاحيات الفعّالة.
 *
 * دورة حياة الباقة:
 *  1. `/plans` يعرض `listPublishedPlans()`، وزر الشراء يضيف بند `plan` للسلة.
 *  2. `buildQuote` يسعّره من `planPrices()` — من قاعدة البيانات، لا من العميل.
 *  3. عند انتقال الطلب إلى `paid` (webhook أو reconcile) تستدعي المعاملة نفسها
 *     `grantOrderPlans()`: صف `entitlements` لكل بند باقة، بمدة وحد أجهزة
 *     منسوخين من الباقة وقت الشراء.
 *  4. الاسترداد/الإلغاء يُبطلها عبر `revokeOrderEntitlements()` الموجود
 *     (مطابقة على `granted_by_order_id`).
 */

import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm'

import { db } from '@/db'
import { entitlements, orderItems, orders, plans } from '@/db/schema'

import { isEntitlementKind, makeEntitlementSet, type EntitlementSet } from './redaction'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const DAY_MS = 24 * 60 * 60 * 1000

export type PlanRow = typeof plans.$inferSelect

const LIVE_PLAN = and(eq(plans.status, 'published'), isNull(plans.deletedAt))

export async function listPublishedPlans(): Promise<PlanRow[]> {
  return db.select().from(plans).where(LIVE_PLAN).orderBy(asc(plans.sortOrder))
}

export async function findPublishedPlanBySlug(slug: string): Promise<PlanRow | null> {
  const [row] = await db
    .select()
    .from(plans)
    .where(and(LIVE_PLAN, eq(plans.slug, slug)))
    .limit(1)
  return row ?? null
}

/** للتسعير والعرض في السلة. الباقات غير المنشورة غائبة → `unknown_item`. */
export async function loadPlansById(ids: readonly string[]): Promise<PlanRow[]> {
  if (ids.length === 0) return []
  return db
    .select()
    .from(plans)
    .where(and(LIVE_PLAN, inArray(plans.id, [...ids])))
}

export function planPriceMap(rows: readonly PlanRow[]) {
  return new Map(
    rows.map((row) => [row.id, { priceMinor: row.priceMinor, currency: row.currency }]),
  )
}

/** تاريخ الانتهاء لباقة تبدأ الآن. NULL = مدى الحياة. */
export function planExpiry(durationDays: number | null, start: Date): Date | null {
  if (durationDays === null || durationDays <= 0) return null
  return new Date(start.getTime() + durationDays * DAY_MS)
}

/**
 * امنح صلاحيات بنود الباقات في طلب مدفوع. متساوي النتيجة عند التكرار:
 * webhook مكرر أو reconcile بعده لا ينشئان صفاً ثانياً.
 */
export async function grantOrderPlans(tx: Tx, orderId: string, now = new Date()): Promise<number> {
  const lines = await tx
    .select({ plan: plans })
    .from(orderItems)
    .innerJoin(plans, eq(plans.id, orderItems.refId))
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.kind, 'plan')))

  if (lines.length === 0) return 0

  const existing = await tx
    .select({ planId: entitlements.planId })
    .from(entitlements)
    .where(eq(entitlements.grantedByOrderId, orderId))
  const already = new Set(existing.map((row) => row.planId))

  const [owner] = await tx
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  // طلب ضيف بلا حساب: لا يوجد من نمنحه. الدفع لا يتم أصلاً دون تسجيل.
  if (!owner?.userId) return 0

  let granted = 0
  for (const { plan } of lines) {
    if (already.has(plan.id)) continue
    if (!isEntitlementKind(plan.entitlementKind)) continue
    await tx.insert(entitlements).values({
      userId: owner.userId,
      kind: plan.entitlementKind,
      grantedByOrderId: orderId,
      planId: plan.id,
      startsAt: now,
      expiresAt: planExpiry(plan.durationDays, now),
      deviceLimit: plan.deviceLimit,
    })
    granted += 1
  }
  return granted
}

/* --------------------------------------------------------------------------
   الصلاحيات الفعّالة
   -------------------------------------------------------------------------- */

export interface Permissions {
  entitlements: EntitlementSet
  /** "رحلتي": من أي باقة حيّة تسمح بها، أو صلاحية بلا باقة (منح يدوي/قديم). */
  canUseTrip: boolean
  /** المفضلة متاحة لكل مستخدم مسجّل ما لم تمنعها كل باقاته الحيّة صراحةً. */
  canSaveFavorites: boolean
  hasAnyPlan: boolean
}

export function combinePermissions(
  rows: readonly {
    kind: string
    canUseTrip: boolean | null
    canSaveFavorites: boolean | null
  }[],
): Permissions {
  const kinds = rows.map((row) => row.kind).filter(isEntitlementKind)
  return {
    entitlements: makeEntitlementSet(kinds),
    canUseTrip: rows.some((row) => row.canUseTrip ?? true),
    canSaveFavorites: rows.length === 0 || rows.some((row) => row.canSaveFavorites ?? true),
    hasAnyPlan: rows.length > 0,
  }
}

export async function loadPermissions(userId: string | null): Promise<Permissions> {
  if (userId === null) return combinePermissions([])
  const now = new Date()
  const rows = await db
    .select({
      kind: entitlements.kind,
      canUseTrip: plans.canUseTrip,
      canSaveFavorites: plans.canSaveFavorites,
    })
    .from(entitlements)
    .leftJoin(plans, eq(plans.id, entitlements.planId))
    .where(
      and(
        eq(entitlements.userId, userId),
        isNull(entitlements.revokedAt),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
      ),
    )
  return combinePermissions(rows)
}
