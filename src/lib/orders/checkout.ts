import { randomUUID } from 'node:crypto'

import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'

import { db } from '@/db'
import { loadPlansById, planPriceMap } from '@/lib/entitlements/plans'
import {
  activities,
  activityAddons,
  activityTiers,
  addonsLibrary,
  cartItems,
  customTripRequests,
  driverVehicles,
  itineraries,
  orderItems,
  orders,
  packages,
  payments,
  plans,
} from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import type { OrderItemOptions } from '@/db/schema'
import { addonRules, loadActivityAddons } from '@/lib/booking/addons'
import { loadTierIncluded } from '@/lib/booking/included'
import { includedOrderItems } from '@/lib/orders/included-items'
import { BOOKABLE_STATUSES } from '@/lib/content/activity-status'
import { reserveDriverCapacity } from '@/lib/availability/capacity'
import type { VehicleClass } from '@/lib/booking-rules'
import { assertBookingsOpen } from '@/lib/bookings-open'
import { getPaymentProvider } from '@/lib/payments'
import { cancelUnpaidOrder } from '@/lib/orders/expire'
import {
  customQuotePriceMap,
  customRequestName,
  loadPayableCustomQuotes,
} from '@/lib/orders/custom-request'
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
  /** Null for a guest checkout; `guestTokenHash` then identifies the buyer. */
  userId: string | null
  /** sha256 of the guest browser's `bt_guest` cookie. Required when `userId` is null. */
  guestTokenHash?: string | null
  /** What the browser displayed. A mismatch aborts rather than charges. */
  expectedTotalMinor: number
  customer: {
    email: string
    name: string
    phone?: string
    country?: string
    locale: string
    notes?: string
  }
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
async function loadCatalog(
  items: readonly QuoteRequestItem[],
  userId: string | null,
): Promise<CatalogSnapshot> {
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
          minGuests: activityTiers.minGuests,
          groupMax: activityTiers.groupMax,
          includesAddons: activityTiers.includesAddons,
          available: activityTiers.available,
          status: activityTiers.status,
        })
        .from(activityTiers)
        .where(and(inArray(activityTiers.id, tierIds), isNull(activityTiers.deletedAt)))
    : []
  const includedByTier = await loadTierIncluded(tierRows.map((row) => row.id))

  // Included activities are priced against their own slots and lead time, so
  // their facts join the snapshot too.
  const activityIds = [
    ...new Set([
      ...idsOf('activity'),
      ...tierRows.map((row) => row.activityId),
      ...[...includedByTier.values()].flat().map((entry) => entry.activityId),
    ]),
  ]
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
            multiDay: activities.multiDay,
            minGuests: activities.minGuests,
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
  const addonRows = await loadActivityAddons(activityRows.map((r) => r.id))
  const bookable = new Set<string>(BOOKABLE_STATUSES)
  // عروض الجداول المخصصة: للمالك وحده، مسعّرة وغير مدفوعة — وإلا unknown_item.
  const customRows = await loadPayableCustomQuotes(idsOf('custom'), userId)

  // Unpublished rows are omitted entirely, so buildQuote reports them as
  // unknown_item rather than quietly selling something withdrawn from sale.
  return {
    plans: planPriceMap(planRows),
    customRequests: customQuotePriceMap(customRows),
    activities: new Map(
      activityRows
        // Published and hidden (link-only) activities sell; unavailable ones do not.
        .filter((r) => bookable.has(r.status))
        .map((r) => [
          r.id,
          {
            priceMinor: r.priceMinor,
            currency: r.currency,
            maxGuests: r.maxGuests,
            leadTimeHours: r.leadTimeHours,
            timeSlots: r.timeSlots ?? [],
            multiDay: r.multiDay,
            minGuests: r.minGuests,
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
            pricingMode: r.pricingMode,
            groupMax: r.groupMax,
            maxGuests: r.maxGuests,
            minGuests: r.minGuests,
            includesAddons: r.includesAddons ?? [],
            available: r.available,
            includedActivities: includedByTier.get(r.id) ?? [],
          },
        ]),
    ),
    activityAddons: addonRules(addonRows),
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

  const guestTokenHash = input.userId === null ? (input.guestTokenHash ?? null) : null
  if (input.userId === null && guestTokenHash === null) {
    throw new CheckoutError('A guest checkout needs a guest token', 'no_owner')
  }

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
    options: r.options,
  }))

  const catalog = await loadCatalog(requestItems, input.userId)
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
  await closeOpenCheckouts({ userId: input.userId, guestTokenHash }, input.idempotencyKey)

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
        guestTokenHash,
        sourceCartId: input.cartId,
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

    // Ids chosen here so an included activity can point at its package line.
    const orderItemIds = new Map(quote.lines.map((line) => [line.itemId, randomUUID()]))

    await tx.insert(orderItems).values([
      ...quote.lines.map((line) => {
        const item = requestItems.find((i) => i.id === line.itemId)
        return {
          id: orderItemIds.get(line.itemId),
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
          options: orderItemOptions(line, item, nameByRef),
        }
      }),
      ...includedOrderItems(quote, requestItems, orderItemIds, order.id, nameByRef),
    ])

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

  // A package line is named "Activity — Package"; each part of its breakdown
  // keeps its own name (package, add-on) for the order page.
  const tierIds = byKind('activity_tier')
  if (tierIds.length > 0) {
    const tierRows = await tx
      .select({ id: activityTiers.id, name: activityTiers.name, activityName: activities.name })
      .from(activityTiers)
      .innerJoin(activities, eq(activities.id, activityTiers.activityId))
      .where(inArray(activityTiers.id, tierIds))
    for (const row of tierRows) {
      out.set(row.id, joinLocalized(row.activityName, row.name))
      out.set(`part:${row.id}`, row.name)
    }
  }
  const partIds = (kind: string) => [
    ...new Set(
      quote.lines.flatMap((l) =>
        (l.breakdown ?? []).filter((b) => b.kind === kind && b.refId).map((b) => b.refId as string),
      ),
    ),
  ]
  const addonIds = partIds('addon')
  if (addonIds.length > 0) {
    const [own, library] = await Promise.all([
      tx
        .select({ id: activityAddons.id, name: activityAddons.name })
        .from(activityAddons)
        .where(inArray(activityAddons.id, addonIds)),
      tx
        .select({ id: addonsLibrary.id, name: addonsLibrary.name })
        .from(addonsLibrary)
        .where(inArray(addonsLibrary.id, addonIds)),
    ])
    for (const row of [...own, ...library]) out.set(`part:${row.id}`, row.name)
  }
  const includedIds = partIds('included')
  if (includedIds.length > 0) {
    const rows = await tx
      .select({ id: activities.id, name: activities.name })
      .from(activities)
      .where(inArray(activities.id, includedIds))
    for (const row of rows) out.set(`part:${row.id}`, row.name)
  }
  const planIds = byKind('plan')
  if (planIds.length > 0) {
    const planRows = await tx
      .select({ id: plans.id, name: plans.name })
      .from(plans)
      .where(inArray(plans.id, planIds))
    for (const row of planRows) out.set(row.id, row.name)
  }
  const customIds = byKind('custom')
  if (customIds.length > 0) {
    const customRows = await tx
      .select({
        id: customTripRequests.id,
        startDate: customTripRequests.startDate,
        endDate: customTripRequests.endDate,
      })
      .from(customTripRequests)
      .where(inArray(customTripRequests.id, customIds))
    for (const row of customRows) out.set(row.id, customRequestName(row))
  }
  // Driver lines carry no catalog id, so key the snapshot by kind.
  const driverLine = quote.lines.find((l) => l.kind === 'driver')
  if (driverLine?.vehicleClass) {
    const vehicle = v.find((x) => x.vehicleClass === driverLine.vehicleClass)
    if (vehicle?.label) out.set('driver', vehicle.label)
  }

  return out
}

function joinLocalized(a: Localized, b: Localized): Localized {
  const out = {} as Localized
  for (const key of Object.keys(a) as (keyof Localized)[]) {
    const left = a[key] ?? ''
    const right = b[key] ?? ''
    out[key] = left && right ? `${left} — ${right}` : left || right
  }
  return out
}

/** The add-ons bought and the priced breakdown, frozen with names. */
function orderItemOptions(
  line: Quote['lines'][number],
  item: QuoteRequestItem | undefined,
  names: Map<string, Localized>,
): OrderItemOptions | null {
  if (!line.breakdown) return null
  return {
    addons: item?.options?.addons ?? [],
    ...(item?.options?.included && item.options.included.length > 0
      ? { included: item.options.included }
      : {}),
    lines: line.breakdown
      .filter((part) => part.kind !== 'driver')
      .map((part) => ({
        kind: part.kind === 'package' || part.kind === 'included' ? part.kind : 'addon',
        refId: part.refId,
        name: part.refId === null ? null : (names.get(`part:${part.refId}`) ?? null),
        unitMinor: part.unitMinor,
        quantity: part.quantity,
        totalMinor: part.totalMinor,
        ...(part.included ? { included: true } : {}),
        ...(part.kind === 'included' ? { time: part.time ?? null } : {}),
      })),
  }
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

/** Whose earlier checkouts to close: an account, or a guest browser. */
interface CheckoutOwner {
  userId: string | null
  guestTokenHash: string | null
}

/**
 * يغلق جلسات الدفع غير المدفوعة لطلبات العميل المعلّقة. أفضل جهد: فشل الإغلاق
 * لا يمنع الدفع الجديد (الطلب القديم ينتهي وحده بمهمة capacity.release-expired).
 *
 * v3: a failed attempt no longer cancels its order (the customer may retry the
 * same order), so a traveller who instead starts a fresh checkout would leave
 * the failed order holding capacity until the sweep. Those are superseded
 * here too — `cancelUnpaidOrder` refuses any order with money still in play.
 */
async function closeOpenCheckouts(owner: CheckoutOwner, currentKey: string): Promise<void> {
  const ownedBy =
    owner.userId !== null
      ? eq(orders.userId, owner.userId)
      : owner.guestTokenHash !== null
        ? and(isNull(orders.userId), eq(orders.guestTokenHash, owner.guestTokenHash))
        : null
  if (ownedBy === null || ownedBy === undefined) return

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
        ownedBy,
        eq(orders.status, 'pending'),
        // `processing` = دفع قيد التسوية (تحويل مؤجل): المال في الطريق، لا يُغلق.
        eq(payments.status, 'requires_action'),
        // ضغطة مزدوجة بنفس المفتاح لا تُغلق طلب الضغطة الأولى.
        ne(payments.idempotencyKey, currentKey),
      ),
    )
  if (open.length > 0) {
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

  // Earlier orders whose every attempt failed: still pending, still holding
  // capacity. The order of a concurrent press with the same key is excluded.
  const stale = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(
      and(
        ownedBy,
        eq(orders.status, 'pending'),
        sql`not exists (select 1 from ${payments} p where p.order_id = ${orders.id} and p.idempotency_key = ${currentKey})`,
      ),
    )
  for (const row of stale) {
    await cancelUnpaidOrder(
      row.id,
      row.orderNumber,
      'superseded by a newer checkout',
      'order.superseded',
    ).catch((error: unknown) =>
      console.error('[checkout] could not supersede an earlier order', { orderId: row.id, error }),
    )
  }
}
