import { lineTotalMinor, sumMinor } from '@/lib/money'
import {
  daysBetweenInclusive,
  isPastInBali,
  isValidDateRange,
  isBookableAt,
  vehicleForPassengers,
  type VehicleClass,
} from '@/lib/booking-rules'
import {
  isValidParty,
  priceBooking,
  tierPricing,
  type AddonRule,
  type PackageRule,
  type PriceLine,
} from '@/lib/booking/price'
import type { SeasonalPrice } from '@/lib/booking/seasonal'
import { checkAvailability, type AvailabilityRules } from '@/lib/availability/rules'

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

/** When an included activity takes place: at the package's time, or its own slot. */
export type IncludedTiming = 'same_slot' | 'own_slot'

export function includedTiming(value: string | null | undefined): IncludedTiming {
  return value === 'own_slot' ? 'own_slot' : 'same_slot'
}

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
  /**
   * Booking choices of an activity line (`cart_items.options`): add-on ids and
   * quantities, and the times picked for included activities with their own
   * slot. Never a price.
   */
  options?: {
    addons?: { id: string; qty: number }[]
    included?: { activityId: string; time: string | null }[]
    /** How many of `guests` are children / infants (phase 2). */
    children?: number
    infants?: number
    /** Itinerary: the audience chosen (display only, never priced). */
    audience?: string
    /** Itinerary: the level chosen (economy / mid / luxury), priced from the catalog. */
    tier?: string
  } | null
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
      /** «أقرب موعد للحجز» (migration 0037). Absent/null = hours rule only. */
      minAdvanceDays?: number | null
      /** 'HH:MM' Bali: after it, the earliest day moves one later. */
      bookingCutoff?: string | null
      timeSlots: string[]
      /** Booked as a date range (`activities.multi_day`). Absent = single day. */
      multiDay?: boolean
      /** Smallest party (`activities.min_guests`). Absent = 1. */
      minGuests?: number
      /**
       * Closed dates and places per departure (phase 2). Absent = unlimited
       * and always open, as before. A read: payment holds the places.
       */
      availability?: AvailabilityRules
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
      /**
       * `per_person` | `per_group` (the pre-0013 `per_guest` / `flat` are read
       * through `tierPricing`, so `flat` stays one price for the party).
       */
      pricingMode: string
      /** People one per_group unit covers. Null = the whole party is one unit. */
      groupMax?: number | null
      /** Null means "whatever the activity allows". */
      maxGuests: number | null
      /** Smallest party for this package. Null/absent = the activity's minimum. */
      minGuests?: number | null
      /** Add-on ids that come with this package. */
      includesAddons?: string[]
      /**
       * Other activities the package includes at no charge, in order. One that
       * is missing from `activities` (withdrawn) is simply not part of the sale.
       */
      includedActivities?: { activityId: string; timing: IncludedTiming }[]
      /** False = shown but not bookable. Absent = bookable. */
      available?: boolean
      /** Price per child, per_person only (phase 2). Null/absent = adult price. */
      childPriceMinor?: number | null
      /** Seasonal prices; the travel date picks one (phase 2). */
      seasons?: SeasonalPrice[]
    }
  >
  /**
   * Live add-ons per activity id (available or not — an unavailable one must
   * be *rejected*, not reported as unknown). Optional so a catalogue built for
   * carts without activities need not carry it.
   */
  activityAddons?: Map<string, AddonRule[]>
  itineraries: Map<
    string,
    {
      priceMinor: number
      currency: string
      version: number
      /** Buying it opens VIP (`map_access = vip_included` with `is_vip`). Phase 3. */
      grantsVip?: boolean
      /** Priced levels (client, Oct 2026). A chosen level not priced here is refused. */
      tierPrices?: Partial<Record<string, number>>
    }
  >
  /** الباقات المنشورة (`plans`). سعرها من هنا دائماً، لا من العميل. */
  plans: Map<
    string,
    {
      priceMinor: number
      currency: string
      /** `basic` | `map_access` | `vip` (phase 3: a VIP plan already covered is not charged). */
      kind?: string
    }
  >
  /**
   * عروض أسعار الجداول المخصصة القابلة للدفع: فقط ما يملكه المشتري، ومسعَّر،
   * وغير مدفوع. الغائب هنا → `unknown_item`. السعر من صف الطلب، لا من العميل.
   * اختياري كي لا يلزم كل من يبني كتالوجاً بلا بنود مخصصة بتمريره.
   */
  customRequests?: Map<string, { priceMinor: number; currency: string }>
  packages: Map<
    string,
    {
      priceMinor: number
      currency: string
      maxGuests: number
      pricingMode: 'flat' | 'per_guest'
      /**
       * Phase 3. Itineraries this package already pays for (its own
       * `itinerary_id`, and links priced `included` / `deducted_on_upgrade`):
       * the same itinerary in the cart is not charged twice.
       */
      coversItineraries?: string[]
      /** Itineraries whose earlier purchase is deducted (`deducted_on_upgrade`). */
      creditItineraries?: string[]
      /** VIP comes with the package: a VIP plan in the cart is not charged twice. */
      includesVip?: boolean
    }
  >
  /**
   * Phase 3: itineraries the buyer already paid for (settled, not refunded),
   * with what they paid, for `deducted_on_upgrade`. Absent = none.
   */
  ownedItineraries?: Map<string, { paidMinor: number; currency: string }>
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
  /**
   * Activity lines: package × units, then each add-on (included ones at zero).
   * `lineTotalMinor` is their sum; `unitPriceMinor` × `quantity` is the
   * package part only.
   */
  breakdown?: PriceLine[]
  /**
   * Phase 3: another line of the same cart already pays for this one (an
   * itinerary inside a package, a VIP plan that comes with a package or a VIP
   * itinerary). It costs 0 and is ordered under that line.
   */
  coveredBy?: string
  /**
   * Phase 3, package lines: the earlier purchase of an itinerary deducted
   * (`deducted_on_upgrade`). `lineTotalMinor` is already net of it.
   */
  credit?: { itineraryId: string; amountMinor: number }
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
  /** Fewer people than the activity or package accepts. */
  | 'guests_below_min'
  /** An included activity with its own time slot has no time picked. */
  | 'included_missing_time'
  /** The time picked for an included activity is not one of its slots, or has closed. */
  | 'included_invalid_time'
  | 'invalid_quantity'
  | 'currency_mismatch'
  /** An add-on that is unknown, unavailable, not for this package or missing its prerequisite. */
  | 'invalid_addon'
  /** The chosen package is switched off. */
  | 'package_unavailable'
  /** The activity does not run on that date (closed day or weekday). */
  | 'date_closed'
  /** Not enough places left on that date / departure. */
  | 'sold_out'
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

  applyCoverage(lines, catalog)

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

/**
 * Never charge for the same thing twice (phase 3), in place:
 *
 *  1. an itinerary that a package line in the cart already includes → 0,
 *     `coveredBy` that package;
 *  2. a VIP plan when a package line includes VIP, or an itinerary line opens
 *     VIP → 0, `coveredBy` it; the same plan twice → the second is 0;
 *  3. a package that deducts an itinerary the buyer already owns (and that is
 *     not also in this cart — then rule 1 already did it) → minus what was
 *     paid for it, never below 0, in the same currency only.
 *
 * Pure and order-independent: the covering line is found by scanning every
 * line, so "package then itinerary" and "itinerary then package" agree.
 */
export function applyCoverage(lines: QuoteLine[], catalog: CatalogSnapshot): void {
  const cover = (line: QuoteLine, by: QuoteLine) => {
    line.coveredBy = by.itemId
    line.unitPriceMinor = 0
    line.lineTotalMinor = 0
    line.quantity = 1
  }
  const packageLines = lines.filter((line) => line.kind === 'package' && line.refId !== null)
  const packageOf = (line: QuoteLine) => catalog.packages.get(line.refId ?? '')

  for (const line of lines) {
    if (line.kind !== 'itinerary' || line.refId === null) continue
    const by = packageLines.find((pkg) =>
      (packageOf(pkg)?.coversItineraries ?? []).includes(line.refId as string),
    )
    if (by) cover(line, by)
  }

  const seenPlans = new Map<string, QuoteLine>()
  for (const line of lines) {
    if (line.kind !== 'plan' || line.refId === null) continue
    const earlier = seenPlans.get(line.refId)
    if (earlier) {
      cover(line, earlier)
      continue
    }
    seenPlans.set(line.refId, line)
    if (catalog.plans.get(line.refId)?.kind !== 'vip') continue
    const byPackage = packageLines.find((pkg) => packageOf(pkg)?.includesVip === true)
    const byItinerary = lines.find(
      (other) =>
        other.kind === 'itinerary' &&
        other.refId !== null &&
        catalog.itineraries.get(other.refId)?.grantsVip === true,
    )
    const by = byPackage ?? byItinerary
    if (by) cover(line, by)
  }

  const inCart = new Set(
    lines.filter((line) => line.kind === 'itinerary' && line.refId).map((line) => line.refId),
  )
  for (const line of packageLines) {
    const pkg = packageOf(line)
    for (const itineraryId of pkg?.creditItineraries ?? []) {
      if (inCart.has(itineraryId)) continue
      const owned = catalog.ownedItineraries?.get(itineraryId)
      if (!owned || owned.currency !== line.currency || owned.paidMinor <= 0) continue
      const amountMinor = Math.min(owned.paidMinor, line.lineTotalMinor)
      if (amountMinor <= 0) continue
      line.lineTotalMinor -= amountMinor
      line.credit = { itineraryId, amountMinor }
      break
    }
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
  if (!activity || !item.refId) {
    issues.push({ itemId: item.id, code: 'unknown_item' })
    return
  }
  // The activity sold at its own price: a per-person "package" with no id,
  // so add-ons restricted to named packages are refused for it.
  priceActivityBooking(
    item,
    item.refId,
    activity,
    {
      id: null,
      priceMinor: activity.priceMinor,
      currency: activity.currency,
      pricing: 'per_person',
      groupMax: null,
      includesAddons: [],
    },
    activity.maxGuests,
    activity.minGuests ?? 1,
    [],
    catalog,
    now,
    lines,
    issues,
  )
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
  // A level picked by the buyer is priced from the catalog, never the client;
  // a level that is not (or no longer) on sale cannot be paid for.
  const tier = item.options?.tier
  let unitPriceMinor = itinerary.priceMinor
  if (tier !== undefined) {
    const priced = itinerary.tierPrices?.[tier]
    if (typeof priced !== 'number' || priced <= 0) {
      issues.push({ itemId: item.id, code: 'unknown_item' })
      return
    }
    unitPriceMinor = priced
  }
  // A downloadable plan is bought once; quantity is meaningless.
  lines.push({
    itemId: item.id,
    kind: 'itinerary',
    refId: item.refId,
    unitPriceMinor,
    quantity: 1,
    lineTotalMinor: unitPriceMinor,
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
 * Price one package (service level) of an activity.
 *
 * Every rule the activity enforces still applies -- a Premium package of the
 * sunrise hike is the same hike, leaving at the same times, closing to
 * bookings at the same hour. Only the price, the pricing mode, the included
 * add-ons and the party-size cap come from the package.
 */
function priceActivityTier(
  item: QuoteRequestItem,
  catalog: CatalogSnapshot,
  now: Date,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  const tier = item.refId ? catalog.activityTiers.get(item.refId) : undefined
  if (!tier || !item.refId) {
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
  if (tier.available === false) {
    issues.push({ itemId: item.id, code: 'package_unavailable' })
    return
  }
  // The tier may cap the party tighter than the activity -- a couples tier at
  // two on a tour that seats twenty -- but never looser.
  const cap = Math.min(tier.maxGuests ?? activity.maxGuests, activity.maxGuests)
  const min = tier.minGuests ?? activity.minGuests ?? 1
  priceActivityBooking(
    item,
    tier.activityId,
    activity,
    {
      id: item.refId,
      priceMinor: tier.priceMinor,
      currency: tier.currency,
      pricing: tierPricing(tier.pricingMode),
      groupMax: tier.groupMax ?? null,
      includesAddons: tier.includesAddons ?? [],
      childPriceMinor: tier.childPriceMinor ?? null,
      seasons: tier.seasons ?? [],
    },
    cap,
    min,
    tier.includedActivities ?? [],
    catalog,
    now,
    lines,
    issues,
  )
}

type ActivityFacts = CatalogSnapshot['activities'] extends Map<string, infer V> ? V : never

/**
 * The shared half of an activity line, plain or packaged: date (or range),
 * time slot, lead time, party cap, then `priceBooking` — the handoff formula
 * — for the package and its add-ons. The driver is NOT priced here: it is its
 * own linked line (`kind: 'driver'`, `parentItemId`) priced by `priceDriver`
 * over the same dates, so fleet capacity keeps being reserved per vehicle.
 */
function priceActivityBooking(
  item: QuoteRequestItem,
  activityId: string,
  activity: ActivityFacts,
  pkg: PackageRule,
  cap: number,
  min: number,
  includedSpec: readonly { activityId: string; timing: IncludedTiming }[],
  catalog: CatalogSnapshot,
  now: Date,
  lines: QuoteLine[],
  issues: QuoteIssue[],
): void {
  if (!item.travelDate) {
    issues.push({ itemId: item.id, code: 'missing_date' })
    return
  }
  if (isPastInBali(item.travelDate, now)) {
    issues.push({ itemId: item.id, code: 'date_in_past' })
    return
  }
  if (activity.multiDay === true) {
    // A multi-day activity is a range; both ends are required and ordered.
    if (!item.endDate || !isValidDateRange(item.travelDate, item.endDate)) {
      issues.push({ itemId: item.id, code: 'invalid_date_range' })
      return
    }
  }
  // A time is required only when the activity has fixed departures.
  if (activity.timeSlots.length > 0) {
    if (!item.travelTime) {
      issues.push({ itemId: item.id, code: 'missing_time' })
      return
    }
    if (!activity.timeSlots.map(toHourMinute).includes(toHourMinute(item.travelTime))) {
      issues.push({ itemId: item.id, code: 'invalid_time_slot', detail: item.travelTime })
      return
    }
  }
  // No slot: the lead time counts from the start of the day, the earliest
  // the operator could be asked to turn up.
  // The day rule («أقرب موعد للحجز», Bali calendar + cutoff) and the hours
  // rule are both enforced here, so a date forged past the calendar is refused.
  if (!isBookableAt(item.travelDate, item.travelTime ?? '00:00', activity, now)) {
    issues.push({ itemId: item.id, code: 'lead_time_passed' })
    return
  }

  const people = item.guests ?? item.quantity
  if (people > cap) {
    issues.push({ itemId: item.id, code: 'guests_exceed_max', detail: String(cap) })
    return
  }
  if (people < min) {
    issues.push({ itemId: item.id, code: 'guests_below_min', detail: String(min) })
    return
  }
  const children = item.options?.children ?? 0
  const infants = item.options?.infants ?? 0
  if (!isValidParty(people, children, infants)) {
    issues.push({ itemId: item.id, code: 'invalid_quantity', detail: 'party' })
    return
  }
  // Places and closed dates (phase 2). Counted on the departure: the first
  // day of a multi-day activity, at its time.
  if (activity.availability) {
    const verdict = checkAvailability(
      activity.availability,
      item.travelDate,
      item.travelTime,
      people,
    )
    if (!verdict.ok) {
      issues.push({
        itemId: item.id,
        code: verdict.reason === 'closed' ? 'date_closed' : 'sold_out',
        detail: String(verdict.remaining),
      })
      return
    }
  }

  // Included activities: same date; own-slot ones need a valid time of theirs.
  const travelDate = item.travelDate
  const timesPicked = item.options?.included ?? []
  const included: { activityId: string; time: string | null }[] = []
  for (const spec of includedSpec) {
    const facts = catalog.activities.get(spec.activityId)
    if (!facts) continue
    if (spec.timing !== 'own_slot' || facts.timeSlots.length === 0) {
      included.push({ activityId: spec.activityId, time: null })
      continue
    }
    const picked = timesPicked.find((entry) => entry.activityId === spec.activityId)?.time ?? null
    if (!picked) {
      issues.push({ itemId: item.id, code: 'included_missing_time', detail: spec.activityId })
      return
    }
    const time = toHourMinute(picked)
    if (
      !facts.timeSlots.map(toHourMinute).includes(time) ||
      !isBookableAt(travelDate, time, facts, now)
    ) {
      issues.push({
        itemId: item.id,
        code: 'included_invalid_time',
        detail: `${spec.activityId}:${picked}`,
      })
      return
    }
    included.push({ activityId: spec.activityId, time })
  }
  // An included activity needs its own place on the day too.
  for (const entry of included) {
    const facts = catalog.activities.get(entry.activityId)
    if (!facts?.availability) continue
    const verdict = checkAvailability(
      facts.availability,
      travelDate,
      entry.time ?? item.travelTime,
      people,
    )
    if (!verdict.ok) {
      issues.push({
        itemId: item.id,
        code: verdict.reason === 'closed' ? 'date_closed' : 'sold_out',
        detail: entry.activityId,
      })
      return
    }
  }

  const picks = item.options?.addons ?? []
  const price = priceBooking({
    pkg,
    addons: catalog.activityAddons?.get(activityId) ?? [],
    picks,
    people,
    included,
    travelDate,
    children,
    infants,
  })
  // Refuse rather than silently drop: the traveller saw these add-ons in the
  // summary, and charging less than shown is as wrong as charging more.
  const firstRejected = price.resolution.rejected[0]
  if (firstRejected) {
    issues.push({
      itemId: item.id,
      code: 'invalid_addon',
      detail: `${firstRejected.id}:${firstRejected.reason}`,
    })
    return
  }

  const packageLine = price.lines[0]
  lines.push({
    itemId: item.id,
    kind: item.kind,
    refId: item.refId,
    // The season's price on the travel date, when one applies.
    unitPriceMinor: price.unitPriceMinor,
    quantity: packageLine?.quantity ?? 1,
    lineTotalMinor: price.totalMinor,
    currency: pkg.currency,
    breakdown: price.lines,
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
