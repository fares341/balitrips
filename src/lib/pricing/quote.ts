import { lineTotalMinor, sumMinor } from '@/lib/money'
import {
  daysBetweenInclusive,
  isPastInBali,
  isValidDateRange,
  isWithinLeadTime,
  vehicleForPassengers,
  type VehicleClass,
} from '@/lib/booking-rules'

/**
 * Server-authoritative pricing.
 *
 * The client sends WHAT it wants (ids, quantities, dates) and never HOW
 * MUCH it costs. Every total is recomputed here from catalog data, and the
 * result is compared against what the client displayed. The prototype
 * carried `price` in each cart item and summed it in the browser, which
 * means anyone could have booked a $500 package for $1.
 *
 * This module is pure: it takes already-loaded catalog rows and returns a
 * quote. Loading and locking happen in the caller's transaction.
 */

/**
 * `activity_tier` is a service level of one activity (Basic, Couples,
 * Premium), priced in its own right. It is a separate kind rather than an
 * activity line carrying a tier id, so that snapshotUnitPrice resolves the
 * price from the tier row the same way every other kind resolves from its own
 * catalogue row -- and so adding it here makes the compiler list every place
 * that must learn about it.
 */
export type CartItemKind =
  | 'activity'
  | 'activity_tier'
  | 'driver'
  | 'itinerary'
  | 'package'
  | 'place'
  | 'plan'
  /** جدول مخصص مدفوع (الوثيقة 13.1): `refId` = `custom_trip_requests.id`. */
  | 'custom'

export interface QuoteRequestItem {
  id: string
  kind: CartItemKind
  refId: string | null
  quantity: number
  travelDate: string | null
  travelTime: string | null
  guests: number | null
  endDate: string | null
  parentItemId: string | null
}

/** The catalog facts pricing needs, already loaded from the database. */
export interface CatalogSnapshot {
  activities: Map<
    string,
    {
      priceMinor: number
      currency: string
      maxGuests: number
      leadTimeHours: number
      timeSlots: string[]
    }
  >
  /**
   * Service levels of an activity. `activityId` is carried so a tier line can
   * be validated against its parent's departure times, lead time and cap --
   * a tier is a price, not a different tour, and must not be bookable at a
   * time the activity itself refuses.
   */
  activityTiers: Map<
    string,
    {
      activityId: string
      priceMinor: number
      currency: string
      pricingMode: 'flat' | 'per_guest'
      /** Null means "whatever the activity allows". */
      maxGuests: number | null
    }
  >
  itineraries: Map<string, { priceMinor: number; currency: string; version: number }>
  /** الباقات المنشورة (`plans`). سعرها من هنا دائماً، لا من العميل. */
  plans: Map<string, { priceMinor: number; currency: string }>
  /**
   * عروض أسعار الجداول المخصصة القابلة للدفع: فقط ما يملكه المشتري، ومسعَّر،
   * وغير مدفوع. الغائب هنا → `unknown_item`. السعر من صف الطلب، لا من العميل.
   * اختياري كي لا يلزم كل من يبني كتالوجاً بلا بنود مخصصة بتمريره.
   */
  customRequests?: Map<string, { priceMinor: number; currency: string }>
  packages: Map<
    string,
    { priceMinor: number; currency: string; maxGuests: number; pricingMode: 'flat' | 'per_guest' }
  >
  vehicles: Map<VehicleClass, { dayRateMinor: number; currency: string; maxPassengers: number }>
}

export interface QuoteLine {
  itemId: string
  kind: CartItemKind
  refId: string | null
  unitPriceMinor: number
  quantity: number
  lineTotalMinor: number
  currency: string
  /** Set for itineraries so the order pins the version bought. */
  refVersion?: number
  vehicleClass?: VehicleClass
}

export type QuoteIssueCode =
  | 'unknown_item'
  | 'missing_date'
  | 'missing_time'
  | 'date_in_past'
  | 'invalid_date_range'
  | 'lead_time_passed'
  | 'invalid_time_slot'
  | 'guests_exceed_max'
  | 'invalid_quantity'
  | 'currency_mismatch'
  /**
   * A cart line whose kind this engine does not price.
   *
   * Should be unreachable -- CartItemKind is exhaustive and the switch now
   * covers it -- but it exists so an unhandled kind FAILS rather than
   * disappears. See the default clause in buildQuote.
   */
  | 'unsupported_kind'

export interface QuoteIssue {
  itemId: string
  code: QuoteIssueCode
  detail?: string
}

export interface Quote {
  lines: QuoteLine[]
  subtotalMinor: number
  totalMinor: number
  currency: string
  issues: QuoteIssue[]
  /** A quote with issues must never be charged. */
  ok: boolean
}

export function buildQuote(
  items: readonly QuoteRequestItem[],
  catalog: CatalogSnapshot,
  now: Date = new Date(),
): Quote {
  const lines: QuoteLine[] = []
  const issues: QuoteIssue[] = []

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      issues.push({ itemId: item.id, code: 'invalid_quantity' })
      continue
    }
    // الضيوف يحددون الكمية في التسعير "للفرد": صفر أو سالب = سطر مجاني.
    if (item.guests !== null && (!Number.isInteger(item.guests) || item.guests < 1)) {
      issues.push({ itemId: item.id, code: 'invalid_quantity' })
      continue
    }

    switch (item.kind) {
      case 'activity':
        priceActivity(item, catalog, now, lines, issues)
        break
      case 'activity_tier':
        priceActivityTier(item, catalog, now, lines, issues)
        break
      case 'driver':
        priceDriver(item, catalog, now, lines, issues)
        break
      case 'itinerary':
        priceItinerary(item, catalog, lines, issues)
        break
      case 'package':
        pricePackage(item, catalog, now, lines, issues)
        break
      case 'plan':
        pricePlan(item, catalog, lines, issues)
        break
      case 'custom':
        priceCustom(item, catalog, lines, issues)
        break
      case 'place':
        // Saved places are free but still belong on the confirmed
        // itinerary, so they produce a zero-value line rather than nothing.
        lines.push({
          itemId: item.id,
          kind: 'place',
          refId: item.refId,
          unitPriceMinor: 0,
          quantity: 1,
          lineTotalMinor: 0,
          currency: inferCurrency(catalog),
        })
        break
      default:
        /**
         * Refuse rather than ignore.
         *
         * Without this the switch silently skipped any kind it did not know:
         * no line, no issue, no contribution to the total. A cart could hold
         * an item the customer could see and expected to pay for, and check
         * out at a price that did not include it. Nothing threw, nothing
         * logged, and the first evidence would be a revenue shortfall nobody
         * could explain.
         *
         * Adding a member to CartItemKind now surfaces as a blocked checkout
         * with a named issue, which is loud, immediate and safe.
         */
        issues.push({
          itemId: item.id,
          code: 'unsupported_kind',
          detail: String(item.kind),
        })
        break
    }
  }

  const currencies = new Set(lines.map((l) => l.currency))
  if (currencies.size > 1) {
    issues.push({
      itemId: '*',
      code: 'currency_mismatch',
      detail: [...currencies].join(', '),
    })
  }

  const subtotalMinor = sumMinor(lines.map((l) => l.lineTotalMinor))

  return {
    lines,
    subtotalMinor,
    // No tax or fees at launch. When they arrive they are added HERE, on
    // the server, never assembled in the browser.
    totalMinor: subtotalMinor,
    currency: lines[0]?.currency ?? inferCurrency(catalog),
    issues,
    ok: issues.length === 0,
  }
}

function priceActivity(
  item: QuoteRequestItem,
  catalog: CatalogSnapshot,
  now: Date,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  const activity = item.refId ? catalog.activities.get(item.refId) : undefined
  if (!activity) {
    issues.push({ itemId: item.id, code: 'unknown_item' })
    return
  }
  if (!item.travelDate) {
    issues.push({ itemId: item.id, code: 'missing_date' })
    return
  }
  if (!item.travelTime) {
    issues.push({ itemId: item.id, code: 'missing_time' })
    return
  }
  if (isPastInBali(item.travelDate, now)) {
    issues.push({ itemId: item.id, code: 'date_in_past' })
    return
  }
  if (
    activity.timeSlots.length > 0 &&
    !activity.timeSlots.map(toHourMinute).includes(toHourMinute(item.travelTime))
  ) {
    issues.push({ itemId: item.id, code: 'invalid_time_slot', detail: item.travelTime })
    return
  }
  if (!isWithinLeadTime(item.travelDate, item.travelTime, activity.leadTimeHours, now)) {
    issues.push({ itemId: item.id, code: 'lead_time_passed' })
    return
  }
  if (item.quantity > activity.maxGuests) {
    issues.push({ itemId: item.id, code: 'guests_exceed_max', detail: String(activity.maxGuests) })
    return
  }

  lines.push({
    itemId: item.id,
    kind: 'activity',
    refId: item.refId,
    unitPriceMinor: activity.priceMinor,
    quantity: item.quantity,
    lineTotalMinor: lineTotalMinor(activity.priceMinor, item.quantity),
    currency: activity.currency,
  })
}

function priceDriver(
  item: QuoteRequestItem,
  catalog: CatalogSnapshot,
  now: Date,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  if (!item.travelDate) {
    issues.push({ itemId: item.id, code: 'missing_date' })
    return
  }
  const endDate = item.endDate ?? item.travelDate
  if (!isValidDateRange(item.travelDate, endDate)) {
    issues.push({ itemId: item.id, code: 'invalid_date_range' })
    return
  }
  if (isPastInBali(item.travelDate, now)) {
    issues.push({ itemId: item.id, code: 'date_in_past' })
    return
  }

  const passengers = item.guests ?? 1
  const vehicleClass = vehicleForPassengers(passengers)
  const vehicle = catalog.vehicles.get(vehicleClass)
  if (!vehicle) {
    issues.push({ itemId: item.id, code: 'unknown_item', detail: vehicleClass })
    return
  }

  // Days are derived, never taken from the client. The prototype hardcoded
  // days: 1 when a driver was added from an activity page, regardless of
  // the actual date range.
  const days = daysBetweenInclusive(item.travelDate, endDate)

  lines.push({
    itemId: item.id,
    kind: 'driver',
    refId: item.refId,
    unitPriceMinor: vehicle.dayRateMinor,
    quantity: days,
    lineTotalMinor: lineTotalMinor(vehicle.dayRateMinor, days),
    currency: vehicle.currency,
    vehicleClass,
  })
}

function priceItinerary(
  item: QuoteRequestItem,
  catalog: CatalogSnapshot,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  const itinerary = item.refId ? catalog.itineraries.get(item.refId) : undefined
  if (!itinerary) {
    issues.push({ itemId: item.id, code: 'unknown_item' })
    return
  }
  // A downloadable plan is bought once; quantity is meaningless.
  lines.push({
    itemId: item.id,
    kind: 'itinerary',
    refId: item.refId,
    unitPriceMinor: itinerary.priceMinor,
    quantity: 1,
    lineTotalMinor: itinerary.priceMinor,
    currency: itinerary.currency,
    refVersion: itinerary.version,
  })
}

function pricePlan(
  item: QuoteRequestItem,
  catalog: CatalogSnapshot,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  const plan = item.refId ? catalog.plans.get(item.refId) : undefined
  if (!plan) {
    issues.push({ itemId: item.id, code: 'unknown_item' })
    return
  }
  // باقة واحدة لكل طلب؛ الكمية لا معنى لها.
  lines.push({
    itemId: item.id,
    kind: 'plan',
    refId: item.refId,
    unitPriceMinor: plan.priceMinor,
    quantity: 1,
    lineTotalMinor: plan.priceMinor,
    currency: plan.currency,
  })
}

function priceCustom(
  item: QuoteRequestItem,
  catalog: CatalogSnapshot,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  const request = item.refId ? catalog.customRequests?.get(item.refId) : undefined
  if (!request || !Number.isSafeInteger(request.priceMinor) || request.priceMinor <= 0) {
    issues.push({ itemId: item.id, code: 'unknown_item' })
    return
  }
  // عرض سعر واحد يُدفع مرة واحدة؛ الكمية لا معنى لها.
  lines.push({
    itemId: item.id,
    kind: 'custom',
    refId: item.refId,
    unitPriceMinor: request.priceMinor,
    quantity: 1,
    lineTotalMinor: request.priceMinor,
    currency: request.currency,
  })
}

function pricePackage(
  item: QuoteRequestItem,
  catalog: CatalogSnapshot,
  now: Date,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  const pkg = item.refId ? catalog.packages.get(item.refId) : undefined
  if (!pkg) {
    issues.push({ itemId: item.id, code: 'unknown_item' })
    return
  }
  if (!item.travelDate) {
    issues.push({ itemId: item.id, code: 'missing_date' })
    return
  }
  if (isPastInBali(item.travelDate, now)) {
    issues.push({ itemId: item.id, code: 'date_in_past' })
    return
  }

  const guests = item.guests ?? 1
  if (guests > pkg.maxGuests) {
    issues.push({ itemId: item.id, code: 'guests_exceed_max', detail: String(pkg.maxGuests) })
    return
  }

  /**
   * Resolves the prototype's pricing contradiction: it collected guests and
   * a date, displayed "from $X", then charged a flat $X and discarded both
   * into a display-only string. pricingMode now says explicitly which is
   * meant, and guests survive as structured data either way.
   */
  const quantity = pkg.pricingMode === 'per_guest' ? guests : 1

  lines.push({
    itemId: item.id,
    kind: 'package',
    refId: item.refId,
    unitPriceMinor: pkg.priceMinor,
    quantity,
    lineTotalMinor: lineTotalMinor(pkg.priceMinor, quantity),
    currency: pkg.currency,
  })
}

/**
 * Price one service level of an activity.
 *
 * Every rule the activity enforces still applies -- a Premium tier of the
 * sunrise hike is the same hike, leaving at the same times, closing to
 * bookings at the same hour. Only the price and the party-size cap come from
 * the tier. Re-deriving that validation here instead of reusing the activity's
 * would have let the two drift, and the way that shows up is a tier bookable
 * at a time the tour does not run.
 */
function priceActivityTier(
  item: QuoteRequestItem,
  catalog: CatalogSnapshot,
  now: Date,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  const tier = item.refId ? catalog.activityTiers.get(item.refId) : undefined
  if (!tier) {
    issues.push({ itemId: item.id, code: 'unknown_item' })
    return
  }
  // An unpublished or deleted parent takes its tiers with it: selling a level
  // of a tour that is no longer offered is worse than showing nothing.
  const activity = catalog.activities.get(tier.activityId)
  if (!activity) {
    issues.push({ itemId: item.id, code: 'unknown_item' })
    return
  }
  if (!item.travelDate) {
    issues.push({ itemId: item.id, code: 'missing_date' })
    return
  }
  if (!item.travelTime) {
    issues.push({ itemId: item.id, code: 'missing_time' })
    return
  }
  if (isPastInBali(item.travelDate, now)) {
    issues.push({ itemId: item.id, code: 'date_in_past' })
    return
  }
  if (
    activity.timeSlots.length > 0 &&
    !activity.timeSlots.map(toHourMinute).includes(toHourMinute(item.travelTime))
  ) {
    issues.push({ itemId: item.id, code: 'invalid_time_slot', detail: item.travelTime })
    return
  }
  if (!isWithinLeadTime(item.travelDate, item.travelTime, activity.leadTimeHours, now)) {
    issues.push({ itemId: item.id, code: 'lead_time_passed' })
    return
  }

  // The tier may cap the party tighter than the activity -- a couples tier at
  // two on a tour that seats twenty -- but never looser.
  const cap = Math.min(tier.maxGuests ?? activity.maxGuests, activity.maxGuests)
  const guests = item.guests ?? item.quantity
  if (guests > cap) {
    issues.push({ itemId: item.id, code: 'guests_exceed_max', detail: String(cap) })
    return
  }

  const quantity = tier.pricingMode === 'per_guest' ? guests : 1

  lines.push({
    itemId: item.id,
    kind: 'activity_tier',
    refId: item.refId,
    unitPriceMinor: tier.priceMinor,
    quantity,
    lineTotalMinor: lineTotalMinor(tier.priceMinor, quantity),
    currency: tier.currency,
  })
}

/**
 * Normalise a clock time to `HH:mm` for comparison.
 *
 * The two sides of this comparison disagree on format, and the mismatch made
 * every activity with fixed departures unbookable. `activities.time_slots` is
 * authored as `HH:mm` ("09:00") and the booking form posts the same, but
 * `cart_items.travel_time` is a Postgres `time` column and reads back as
 * `HH:mm:ss` ("09:00:00"). Comparing the raw strings never matched, so the
 * cart reported `invalid_time_slot` with nothing the traveller could change.
 *
 * Normalising here rather than at the column keeps it correct regardless of
 * which side a caller supplies, including a driver adapter that returns
 * seconds or a form that omits them.
 */
function toHourMinute(time: string): string {
  const [hours = '', minutes = ''] = time.trim().split(':')
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
}

function inferCurrency(catalog: CatalogSnapshot): string {
  const first =
    catalog.activities.values().next().value ?? catalog.itineraries.values().next().value
  return first?.currency ?? 'USD'
}

/**
 * Guard for checkout: the amount the browser displayed must equal what the
 * server computed. A mismatch means stale pricing (an admin edited it while
 * the item sat in a cart) or tampering — either way, do not charge.
 */
export function quoteMatchesExpectation(quote: Quote, expectedTotalMinor: number): boolean {
  return quote.ok && quote.totalMinor === expectedTotalMinor
}
