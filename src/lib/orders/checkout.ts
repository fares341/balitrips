import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'

import { db } from '@/db'
import { loadPlansById, planPriceMap } from '@/lib/entitlements/plans'
import {
  activities,
  activityTiers,
  cartItems,
  driverVehicles,
  itineraries,
  orderItems,
  orders,
  packages,
  payments,
  plans,
} from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import { reserveDriverCapacity } from '@/lib/availability/capacity'
import type { VehicleClass } from '@/lib/booking-rules'
import { assertBookingsOpen } from '@/lib/bookings-open'
import { getPaymentProvider } from '@/lib/payments'
import { cancelUnpaidOrder } from '@/lib/orders/expire'
import {
  buildQuote,
  quoteMatchesExpectation,
  type CatalogSnapshot,
  type Quote,
  type QuoteRequestItem,
} from '@/lib/pricing/quote'

/**
 * Checkout.
 *
 * Everything that must not drift apart happens in one transaction: pricing
 * recomputed from the catalog, capacity reserved, the order and its
 * immutable line snapshots written. The payment intent is created only
 * after that transaction commits, so a failed reservation can never leave a
 * charge without an order behind it.
 *
 * Order state is NOT advanced here. `pending` is as far as checkout goes;
 * only a verified webhook moves an order to `paid`, because the provider's
 * success event routinely arrives before the customer returns to the site.
 */

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly quote?: Quote,
  ) {
    super(message)
    this.name = 'CheckoutError'
  }
}

export interface CheckoutInput {
  cartId: string
  userId: string
  /** What the browser displayed. A mismatch aborts rather than charges. */
  expectedTotalMinor: number
  customer: { email: string; name: string; phone?: string; country?: string; locale: string }
  /** Timestamped proof the cancellation ladder was accepted. */
  termsVersion: string
  returnUrl: string
  /** Stable per checkout attempt, so a double-click cannot charge twice. */
  idempotencyKey: string
}

export interface CheckoutResult {
  orderId: string
  orderNumber: string
  quote: Quote
  payment: { providerPaymentId: string; nextAction: unknown }
}

/** Load exactly the catalog facts pricing needs for the items in a cart. */
async function loadCatalog(items: readonly QuoteRequestItem[]): Promise<CatalogSnapshot> {
  const idsOf = (kind: string) =>
    items.filter((i) => i.kind === kind && i.refId).map((i) => i.refId as string)

  /**
   * Tiers are fetched BEFORE everything else, because a tier line needs its
   * parent activity in the snapshot and the cart may contain no plain
   * activity line referencing it. Loading activities from the cart's own ids
   * alone would leave priceActivityTier unable to find the parent, and every
   * tier would be rejected as unknown_item.
   */
  const tierIds = idsOf('activity_tier')
  const tierRows = tierIds.length
    ? await db
        .select({
          id: activityTiers.id,
          activityId: activityTiers.activityId,
          name: activityTiers.name,
          priceMinor: activityTiers.priceMinor,
          currency: activityTiers.currency,
          pricingMode: activityTiers.pricingMode,
          maxGuests: activityTiers.maxGuests,
          status: activityTiers.status,
        })
        .from(activityTiers)
        .where(and(inArray(activityTiers.id, tierIds), isNull(activityTiers.deletedAt)))
    : []

  const activityIds = [...new Set([...idsOf('activity'), ...tierRows.map((row) => row.activityId)])]
  const itineraryIds = idsOf('itinerary')
  const packageIds = idsOf('package')

  const [activityRows, itineraryRows, packageRows, vehicleRows] = await Promise.all([
    activityIds.length
      ? db
          .select({
            id: activities.id,
            priceMinor: activities.priceMinor,
            currency: activities.currency,
            maxGuests: activities.maxGuests,
            leadTimeHours: activities.leadTimeHours,
            timeSlots: activities.timeSlots,
            status: activities.status,
          })
          .from(activities)
          .where(and(inArray(activities.id, activityIds), isNull(activities.deletedAt)))
      : Promise.resolve([]),
    itineraryIds.length
      ? db
          .select({
            id: itineraries.id,
            priceMinor: itineraries.priceMinor,
            currency: itineraries.currency,
            version: itineraries.version,
            status: itineraries.status,
          })
          .from(itineraries)
          .where(and(inArray(itineraries.id, itineraryIds), isNull(itineraries.deletedAt)))
      : Promise.resolve([]),
    packageIds.length
      ? db
          .select({
            id: packages.id,
            priceMinor: packages.priceMinor,
            currency: packages.currency,
            maxGuests: packages.maxGuests,
            pricingMode: packages.pricingMode,
            status: packages.status,
          })
          .from(packages)
          .where(and(inArray(packages.id, packageIds), isNull(packages.deletedAt)))
      : Promise.resolve([]),
    db
      .select({
        vehicleClass: driverVehicles.vehicleClass,
        dayRateMinor: driverVehicles.dayRateMinor,
        currency: driverVehicles.currency,
        maxPassengers: driverVehicles.maxPassengers,
      })
      .from(driverVehicles),
  ])

  const planRows = await loadPlansById(idsOf('plan'))

  // Unpublished rows are omitted entirely, so buildQuote reports them as
  // unknown_item rather than quietly selling something withdrawn from sale.
  return {
    plans: planPriceMap(planRows),
    activities: new Map(
      activityRows
        .filter((r) => r.status === 'published')
        .map((r) => [
          r.id,
          {
            priceMinor: r.priceMinor,
            currency: r.currency,
            maxGuests: r.maxGuests,
            leadTimeHours: r.leadTimeHours,
            timeSlots: r.timeSlots ?? [],
          },
        ]),
    ),
    activityTiers: new Map(
      tierRows
        .filter((r) => r.status === 'published')
        .map((r) => [
          r.id,
          {
            activityId: r.activityId,
            priceMinor: r.priceMinor,
            currency: r.currency,
            pricingMode: r.pricingMode === 'flat' ? ('flat' as const) : ('per_guest' as const),
            maxGuests: r.maxGuests,
          },
        ]),
    ),
    itineraries: new Map(
      itineraryRows
        .filter((r) => r.status === 'published')
        .map((r) => [r.id, { priceMinor: r.priceMinor, currency: r.currency, version: r.version }]),
    ),
    packages: new Map(
      packageRows
        .filter((r) => r.status === 'published')
        .map((r) => [
          r.id,
          {
            priceMinor: r.priceMinor,
            currency: r.currency,
            maxGuests: r.maxGuests,
            pricingMode: r.pricingMode === 'per_guest' ? 'per_guest' : 'flat',
          },
        ]),
    ),
    vehicles: new Map(
      vehicleRows.map((r) => [
        r.vehicleClass as VehicleClass,
        {
          dayRateMinor: r.dayRateMinor,
          currency: r.currency,
          maxPassengers: r.maxPassengers,
        },
      ]),
    ),
  }
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  // Above EVERYTHING: the order-number sequence, the capacity reservation, the
  // orders and order_items inserts, the provider intent and the payments row.
  // Placed here so a refusal cannot advance order_number_seq or hold a seat.
  assertBookingsOpen('checkout')

  const rows = await db.select().from(cartItems).where(eq(cartItems.cartId, input.cartId))

  if (rows.length === 0) {
    throw new CheckoutError('Cart is empty', 'empty_cart')
  }

  const requestItems: QuoteRequestItem[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as QuoteRequestItem['kind'],
    refId: r.refId,
    quantity: r.quantity,
    travelDate: r.travelDate,
    travelTime: r.travelTime,
    guests: r.guests,
    endDate: r.endDate,
    parentItemId: r.parentItemId,
  }))

  const catalog = await loadCatalog(requestItems)
  const quote = buildQuote(requestItems, catalog)

  if (!quote.ok) {
    throw new CheckoutError('Cart contains items that cannot be booked', 'invalid_cart', quote)
  }

  /**
   * The price the customer agreed to must equal what the server computed.
   * A mismatch means an admin edited the price while the item sat in the
   * cart, or the client tampered with it. Either way, surface it rather
   * than silently charging a different amount.
   */
  if (!quoteMatchesExpectation(quote, input.expectedTotalMinor)) {
    throw new CheckoutError(
      `Price changed: expected ${input.expectedTotalMinor}, computed ${quote.totalMinor}`,
      'price_changed',
      quote,
    )
  }

  // جلسة دفع واحدة مفتوحة لكل عميل: الرجوع للدفع (زر "رجوع" أو تبويب ثانٍ) كان
  // يُنشئ جلسة Stripe جديدة بينما القديمة ما زالت قابلة للدفع 35 دقيقة — فيُدفع
  // الطلب مرتين. نغلق جلسات طلباته المعلّقة السابقة أولاً.
  await closeOpenCheckouts(input.userId, input.idempotencyKey)

  const orderNumber = await nextOrderNumber()
  const provider = getPaymentProvider()

  const { orderId } = await db.transaction(async (tx) => {
    // Capacity first: it is the only step that can fail on someone else's
    // concurrent action, so failing here costs nothing else.
    for (const line of quote.lines) {
      if (line.kind === 'driver' && line.vehicleClass) {
        const item = requestItems.find((i) => i.id === line.itemId)
        if (item?.travelDate) {
          await reserveDriverCapacity(
            tx,
            line.vehicleClass,
            item.travelDate,
            item.endDate ?? item.travelDate,
          )
        }
      }
    }

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId: input.userId,
        status: 'pending',
        presentmentCurrency: quote.currency,
        subtotalMinor: quote.subtotalMinor,
        totalMinor: quote.totalMinor,
        customerSnapshot: input.customer,
        termsAcceptedAt: new Date(),
        termsVersion: input.termsVersion,
        placedAt: new Date(),
      })
      .returning({ id: orders.id })

    if (!order) throw new CheckoutError('Failed to create order', 'order_insert_failed')

    const nameByRef = await loadNameSnapshots(tx, quote)

    await tx.insert(orderItems).values(
      quote.lines.map((line) => {
        const item = requestItems.find((i) => i.id === line.itemId)
        return {
          orderId: order.id,
          kind: line.kind,
          refId: line.refId,
          // Frozen at purchase, so editing or unpublishing a product later
          // cannot rewrite what the customer bought.
          nameSnapshot: nameByRef.get(line.refId ?? line.kind) ?? {
            en: line.kind,
            ar: line.kind,
            id: line.kind,
          },
          unitPriceMinor: line.unitPriceMinor,
          quantity: line.quantity,
          lineTotalMinor: line.lineTotalMinor,
          refVersion: line.refVersion ?? null,
          travelDate: item?.travelDate ?? null,
          travelTime: item?.travelTime ?? null,
          guests: item?.guests ?? null,
          vehicleClass: line.vehicleClass ?? null,
          endDate: item?.endDate ?? null,
          parentItemId: item?.parentItemId ?? null,
        }
      }),
    )

    /**
     * المفتاح يُحجز داخل معاملة الطلب نفسها: ضغطتان متزامنتان بنفس المفتاح
     * كانتا تمرّان من فحص "هل يوجد طلب؟" معاً وتُنشئان طلبين وتحجزان السعة
     * مرتين. الآن الثانية تصطدم بالفهرس الفريد وتُرفض المعاملة كلها.
     */
    try {
      await tx.insert(payments).values({
        orderId: order.id,
        provider: provider.name,
        providerPaymentId: null,
        status: 'requires_action',
        amountMinor: quote.totalMinor,
        currency: quote.currency,
        idempotencyKey: input.idempotencyKey,
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CheckoutError('This checkout was already submitted', 'duplicate')
      }
      throw error
    }

    return { orderId: order.id }
  })

  // Only now, with the order durably written and capacity held, do we ask
  // the provider for money. The reverse order would risk a charge with no
  // order behind it.
  let intent
  try {
    intent = await provider.createIntent({
      orderId,
      orderNumber,
      amountMinor: quote.totalMinor,
      currency: quote.currency,
      // مفتاح المزوّد لكل طلب: إعادة المحاولة بعد فشل تُنشئ طلباً جديداً، ولو
      // أُعيد مفتاح النموذج نفسه مع جسم مختلف لرفضه Stripe.
      idempotencyKey: `order:${orderId}`,
      customer: input.customer,
      returnUrl: input.returnUrl,
      statementDescriptor: 'BALI TRIPS',
    })
  } catch (error) {
    // لم تُنشأ جلسة دفع: نحذف صف المفتاح (فتعيد ضغطة "ادفع" المحاولة بطلب جديد
    // بدل التحويل لطلب ميت) ونلغي الطلب لتعود السعة فوراً.
    await db.delete(payments).where(eq(payments.idempotencyKey, input.idempotencyKey))
    await cancelUnpaidOrder(orderId, orderNumber, 'payment session could not be created').catch(
      (cleanupError: unknown) =>
        console.error('[checkout] cleanup after a failed intent', { orderId, cleanupError }),
    )
    throw error
  }

  await db
    .update(payments)
    .set({
      providerPaymentId: intent.providerPaymentId,
      status: intent.status,
      rawPayload: intent.raw as object,
    })
    .where(eq(payments.idempotencyKey, input.idempotencyKey))

  return {
    orderId,
    orderNumber,
    quote,
    payment: { providerPaymentId: intent.providerPaymentId, nextAction: intent.nextAction },
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function loadNameSnapshots(tx: Tx, quote: Quote): Promise<Map<string, Localized>> {
  const out = new Map<string, Localized>()

  const byKind = (kind: string) =>
    quote.lines.filter((l) => l.kind === kind && l.refId).map((l) => l.refId as string)

  const [a, i, p, v] = await Promise.all([
    byKind('activity').length
      ? tx
          .select({ id: activities.id, name: activities.name })
          .from(activities)
          .where(inArray(activities.id, byKind('activity')))
      : Promise.resolve([]),
    byKind('itinerary').length
      ? tx
          .select({ id: itineraries.id, name: itineraries.name })
          .from(itineraries)
          .where(inArray(itineraries.id, byKind('itinerary')))
      : Promise.resolve([]),
    byKind('package').length
      ? tx
          .select({ id: packages.id, name: packages.name })
          .from(packages)
          .where(inArray(packages.id, byKind('package')))
      : Promise.resolve([]),
    tx
      .select({ vehicleClass: driverVehicles.vehicleClass, label: driverVehicles.label })
      .from(driverVehicles),
  ])

  for (const row of [...a, ...i, ...p]) if (row.name) out.set(row.id, row.name)
  const planIds = byKind('plan')
  if (planIds.length > 0) {
    const planRows = await tx
      .select({ id: plans.id, name: plans.name })
      .from(plans)
      .where(inArray(plans.id, planIds))
    for (const row of planRows) out.set(row.id, row.name)
  }
  // Driver lines carry no catalog id, so key the snapshot by kind.
  const driverLine = quote.lines.find((l) => l.kind === 'driver')
  if (driverLine?.vehicleClass) {
    const vehicle = v.find((x) => x.vehicleClass === driverLine.vehicleClass)
    if (vehicle?.label) out.set('driver', vehicle.label)
  }

  return out
}

/**
 * Human-facing reference, e.g. BT-2026-0184.
 *
 * Drawn from a Postgres sequence rather than counting existing rows:
 * `count(*) + 1` is a classic collision under concurrency, and orders.
 * order_number carries a UNIQUE constraint that would reject the loser.
 * nextval is atomic and never hands the same value to two callers.
 */
async function nextOrderNumber(): Promise<string> {
  const year = new Date().getUTCFullYear()
  const rows = await db.execute<{ n: string }>(sql`select nextval('order_number_seq') as n`)
  const raw = rows[0]?.n
  if (raw === undefined) {
    throw new CheckoutError('Could not allocate an order number', 'order_number_failed')
  }
  return `BT-${year}-${String(raw).padStart(4, '0')}`
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null)?.code
  const causeCode = (error as { cause?: { code?: unknown } } | null)?.cause?.code
  return code === '23505' || causeCode === '23505'
}

/**
 * يغلق جلسات الدفع غير المدفوعة لطلبات العميل المعلّقة. أفضل جهد: فشل الإغلاق
 * لا يمنع الدفع الجديد (الطلب القديم ينتهي وحده بمهمة capacity.release-expired).
 */
async function closeOpenCheckouts(userId: string, currentKey: string): Promise<void> {
  const open = await db
    .select({
      id: payments.id,
      provider: payments.provider,
      providerPaymentId: payments.providerPaymentId,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, 'pending'),
        // `processing` = دفع قيد التسوية (تحويل مؤجل): المال في الطريق، لا يُغلق.
        eq(payments.status, 'requires_action'),
        // ضغطة مزدوجة بنفس المفتاح لا تُغلق طلب الضغطة الأولى.
        ne(payments.idempotencyKey, currentKey),
      ),
    )
  if (open.length === 0) return
  const provider = getPaymentProvider()
  for (const row of open) {
    if (row.providerPaymentId === null || row.provider !== provider.name) continue
    try {
      const closed = (await provider.cancelIntent?.(row.providerPaymentId)) ?? false
      if (!closed) continue
      await db.update(payments).set({ status: 'cancelled' }).where(eq(payments.id, row.id))
      // الطلب القديم يُلغى فوراً وتعود سعته — فيصل إشعار انتهاء الجلسة من
      // المزوّد على طلب ملغى أصلاً، فلا "فشل الدفع" مضلّل للعميل.
      await cancelUnpaidOrder(
        row.orderId,
        row.orderNumber,
        'superseded by a newer checkout',
        'order.superseded',
      )
    } catch (error) {
      console.error('[checkout] could not close an earlier payment session', {
        paymentId: row.id,
        error,
      })
    }
  }
}
