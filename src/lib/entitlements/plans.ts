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

import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { entitlements, itineraries, orderItems, orders, plans } from '@/db/schema'

import { isEntitlementKind, makeEntitlementSet, type EntitlementSet } from './redaction'
import { carryOverFamily } from './family'

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

  // الوثيقة 4.2: "هل يشمل الخريطة؟" — جدول يشمل الخريطة يمنح الوصول لها عند الدفع
  // (VIP إن كان جدول VIP). كان شراء الجدول لا يفتح الخريطة أبداً.
  const mapItineraries = await tx
    .select({ includesMap: itineraries.includesMap, isVip: itineraries.isVip })
    .from(orderItems)
    .innerJoin(itineraries, eq(itineraries.id, orderItems.refId))
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.kind, 'itinerary'),
        eq(itineraries.includesMap, true),
      ),
    )

  if (lines.length === 0 && mapItineraries.length === 0) return 0

  const existing = await tx
    .select({ planId: entitlements.planId, kind: entitlements.kind })
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
    // تجديد باقة بمدة قبل انتهائها: المدة الجديدة تبدأ من نهاية الحالية،
    // لا من اليوم — كي لا يخسر العميل الأيام المتبقية التي دفع ثمنها.
    let startsAt = now
    if (plan.durationDays !== null && plan.durationDays > 0) {
      const [current] = await tx
        .select({ until: sql<Date | null>`max(${entitlements.expiresAt})` })
        .from(entitlements)
        .where(
          and(
            eq(entitlements.userId, owner.userId),
            eq(entitlements.planId, plan.id),
            isNull(entitlements.revokedAt),
            gt(entitlements.expiresAt, now),
          ),
        )
      const until = current?.until ? new Date(current.until) : null
      if (until !== null && until.getTime() > now.getTime()) startsAt = until
    }
    const [row] = await tx
      .insert(entitlements)
      .values({
        userId: owner.userId,
        kind: plan.entitlementKind,
        grantedByOrderId: orderId,
        planId: plan.id,
        startsAt,
        expiresAt: planExpiry(plan.durationDays, startsAt),
        deviceLimit: plan.deviceLimit,
      })
      .returning()
    // باقة عائلية مجدَّدة: الأفراد ينتقلون مع الصاحب.
    if (row && plan.maxMembers > 1) await carryOverFamily(tx, row)
    granted += 1
  }

  const itineraryKinds = new Set(
    mapItineraries.map((row) => (row.isVip ? ('vip' as const) : ('map_access' as const))),
  )
  for (const kind of itineraryKinds) {
    if (existing.some((row) => row.planId === null && row.kind === kind)) continue
    await tx.insert(entitlements).values({
      userId: owner.userId,
      kind,
      grantedByOrderId: orderId,
      startsAt: now,
      expiresAt: null,
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
  /**
   * تحميل PDF (الوثيقة 13.2): مسموح ما لم تكن لدى المستخدم باقات حيّة كلها
   * تمنعه — عندها العرض داخل الموقع فقط. من اشترى جدولاً بلا باقة يتبع
   * السياسة العامة في Studio → Protection.
   */
  canDownloadPdf: boolean
  hasAnyPlan: boolean
}

export function combinePermissions(
  rows: readonly {
    kind: string
    canUseTrip: boolean | null
    canSaveFavorites: boolean | null
    canDownloadPdf?: boolean | null
  }[],
): Permissions {
  const kinds = rows.map((row) => row.kind).filter(isEntitlementKind)
  return {
    entitlements: makeEntitlementSet(kinds),
    canUseTrip: rows.some((row) => row.canUseTrip ?? true),
    canSaveFavorites: rows.length === 0 || rows.some((row) => row.canSaveFavorites ?? true),
    canDownloadPdf: rows.length === 0 || rows.some((row) => row.canDownloadPdf ?? true),
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
      canDownloadPdf: plans.canDownloadPdf,
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
