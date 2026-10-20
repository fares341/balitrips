/**
 * Catalogue facts the cart needs.
 *
 * Two things at once, from one round of queries:
 *
 *  1. a `CatalogSnapshot` for `buildQuote`, so the cart is priced by exactly
 *     the same pure function checkout uses — the cart never adds up numbers
 *     of its own, and never reads a price off the client;
 *  2. the *display* facts a line needs — localized name, 72px thumbnail,
 *     a link back to the product page, and the real per-item maximum.
 *
 * `@/lib/orders/checkout.ts` has a private loader of its own with the same
 * shape. That duplication is deliberate rather than accidental: checkout must
 * price against the catalogue at the instant of purchase inside its own
 * transaction, and the cart additionally needs names and images that checkout
 * has no use for. The important part — that both feed the *same* `buildQuote`
 * — is preserved. Unpublished and soft-deleted rows are omitted from the
 * snapshot identically in both, so `buildQuote` reports them as `unknown_item`
 * rather than quietly selling something withdrawn from sale.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  activityTiers,
  driverVehicles,
  itineraries,
  mapPlaces,
  media,
  packages,
} from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import type { VehicleClass } from '@/lib/booking-rules'
import { mediaUrl } from '@/lib/content/queries'
import { entityHref } from '@/lib/content/types'
import type { EntitlementSet } from '@/lib/entitlements'
import { canSeePlace } from '@/lib/entitlements'
import { loadPlansById, planPriceMap } from '@/lib/entitlements/plans'
import {
  customQuotePriceMap,
  customRequestName,
  loadPayableCustomQuotes,
} from '@/lib/orders/custom-request'
import { addonRules, loadActivityAddons } from '@/lib/booking/addons'
import { loadTierIncluded } from '@/lib/booking/included'
import { applyExtras, loadBookingExtras } from '@/lib/booking/extras'
import { BOOKABLE_STATUSES } from '@/lib/content/activity-status'
import type { CatalogSnapshot, QuoteRequestItem } from '@/lib/pricing/quote'
import { FEATURES } from '@/lib/features'
import { applyCoverageFacts } from '@/lib/pricing/coverage-facts'

const PUBLISHED = 'published'

/** Everything a cart line renders that is not stored on the line itself. */
export interface CartDisplay {
  name: Localized | null
  imageUrl: string | null
  imageAlt: Localized | null
  /** Locale-agnostic path back to the product page, or null when it has none. */
  href: string | null
  /**
   * Real upper bound for the quantity stepper.
   *
   * The handoff's cart stepper clamped nothing at all, so a guest could hold
   * the plus key and check out with 400 seats on a boat that holds twelve.
   */
  maxQuantity: number | null
}

export interface CartCatalog {
  snapshot: CatalogSnapshot
  /** Keyed by `${kind}:${refId}`, or `driver:${vehicleClass}` for drivers. */
  display: Map<string, CartDisplay>
  /**
   * Names for an activity line's breakdown, keyed by package (tier) id and
   * add-on id. Display only.
   */
  partNames: Map<string, Localized>
}

export function displayKey(kind: string, ref: string | null): string {
  return `${kind}:${ref ?? '-'}`
}

type MediaRow = { id: string; objectKey: string; alt: Localized | null; deletedAt: Date | null }

function imageOf(row: MediaRow | undefined): { url: string | null; alt: Localized | null } {
  // A soft-deleted image is no image rather than a dead URL; <Photo> already
  // renders a neutral placeholder for null.
  if (!row || row.deletedAt !== null) return { url: null, alt: null }
  return { url: mediaUrl(row.objectKey), alt: row.alt }
}

/**
 * Load pricing + display facts for one cart.
 *
 * @param items   The cart's rows, already shaped for `buildQuote`.
 * @param held    Entitlements of the viewer. Locked map places are shown by
 *                name only to someone who actually holds the entitlement —
 *                otherwise adding a place id by hand would be a way to read
 *                the names the map deliberately redacts.
 * @param userId  The cart's owner. Custom-itinerary quotes are priced only for
 *                the request's own customer; null prices none of them.
 */
export async function loadCartCatalog(
  items: readonly QuoteRequestItem[],
  held: EntitlementSet,
  userId: string | null = null,
): Promise<CartCatalog> {
  const idsOf = (kind: string): string[] => [
    ...new Set(
      items.filter((i) => i.kind === kind && i.refId !== null).map((i) => i.refId as string),
    ),
  ]

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
          childPriceMinor: activityTiers.childPriceMinor,
          groupMax: activityTiers.groupMax,
          includesAddons: activityTiers.includesAddons,
          available: activityTiers.available,
          status: activityTiers.status,
        })
        .from(activityTiers)
        .where(and(inArray(activityTiers.id, tierIds), isNull(activityTiers.deletedAt)))
    : []
  const includedByTier = await loadTierIncluded(tierRows.map((row) => row.id))

  const activityIds = [
    ...new Set([
      ...idsOf('activity'),
      ...tierRows.map((row) => row.activityId),
      ...[...includedByTier.values()].flat().map((entry) => entry.activityId),
    ]),
  ]
  const itineraryIds = idsOf('itinerary')
  const packageIds = idsOf('package')
  const placeIds = idsOf('place')
  const planRowsPromise = loadPlansById(idsOf('plan'))
  const customRowsPromise = loadPayableCustomQuotes(idsOf('custom'), userId)

  const [activityRows, itineraryRows, packageRows, placeRows, vehicleRows] = await Promise.all([
    activityIds.length
      ? db
          .select({
            id: activities.id,
            slug: activities.slug,
            name: activities.name,
            priceMinor: activities.priceMinor,
            currency: activities.currency,
            maxGuests: activities.maxGuests,
            leadTimeHours: activities.leadTimeHours,
            timeSlots: activities.timeSlots,
            multiDay: activities.multiDay,
            minGuests: activities.minGuests,
            status: activities.status,
            heroImageId: activities.heroImageId,
          })
          .from(activities)
          .where(
            and(
              inArray(activities.id, activityIds),
              isNull(activities.deletedAt),
              // فعالية مؤرَّخة انتهت لا تُباع (نفس قاعدة صفحة الفعاليات: النهاية، أو يوم
              // بعد البداية بلا نهاية). غير المؤرَّخة دائماً متاحة.
              sql`coalesce(${activities.eventEndsAt}, ${activities.eventStartsAt} + interval '1 day', 'infinity'::timestamptz) >= now()`,
            ),
          )
      : Promise.resolve([]),
    itineraryIds.length
      ? db
          .select({
            id: itineraries.id,
            slug: itineraries.slug,
            name: itineraries.name,
            priceMinor: itineraries.priceMinor,
            currency: itineraries.currency,
            version: itineraries.version,
            status: itineraries.status,
            heroImageId: itineraries.heroImageId,
          })
          .from(itineraries)
          .where(and(inArray(itineraries.id, itineraryIds), isNull(itineraries.deletedAt)))
      : Promise.resolve([]),
    packageIds.length
      ? db
          .select({
            id: packages.id,
            slug: packages.slug,
            name: packages.name,
            priceMinor: packages.priceMinor,
            currency: packages.currency,
            maxGuests: packages.maxGuests,
            pricingMode: packages.pricingMode,
            status: packages.status,
            heroImageId: packages.heroImageId,
          })
          .from(packages)
          .where(and(inArray(packages.id, packageIds), isNull(packages.deletedAt)))
      : Promise.resolve([]),
    placeIds.length
      ? db
          .select({
            id: mapPlaces.id,
            slug: mapPlaces.slug,
            name: mapPlaces.name,
            isFree: mapPlaces.isFree,
            requiredEntitlement: mapPlaces.requiredEntitlement,
            isHiddenGem: mapPlaces.isHiddenGem,
            status: mapPlaces.status,
            heroImageId: mapPlaces.heroImageId,
          })
          .from(mapPlaces)
          .where(and(inArray(mapPlaces.id, placeIds), isNull(mapPlaces.deletedAt)))
      : Promise.resolve([]),
    db
      .select({
        vehicleClass: driverVehicles.vehicleClass,
        label: driverVehicles.label,
        dayRateMinor: driverVehicles.dayRateMinor,
        currency: driverVehicles.currency,
        maxPassengers: driverVehicles.maxPassengers,
      })
      .from(driverVehicles),
  ])

  const heroIds = [
    ...new Set(
      [...activityRows, ...itineraryRows, ...packageRows, ...placeRows]
        .map((row) => row.heroImageId)
        .filter((id): id is string => id !== null),
    ),
  ]

  const mediaRows = heroIds.length
    ? await db
        .select({
          id: media.id,
          objectKey: media.objectKey,
          alt: media.alt,
          deletedAt: media.deletedAt,
        })
        .from(media)
        .where(inArray(media.id, heroIds))
    : []

  const mediaById = new Map(mediaRows.map((row) => [row.id, row]))
  const heroFor = (heroImageId: string | null) =>
    imageOf(heroImageId === null ? undefined : mediaById.get(heroImageId))

  const display = new Map<string, CartDisplay>()

  for (const row of activityRows) {
    const image = heroFor(row.heroImageId)
    display.set(displayKey('activity', row.id), {
      name: row.name,
      imageUrl: image.url,
      imageAlt: image.alt,
      href: entityHref('activity', row.slug),
      maxQuantity: row.maxGuests,
    })
  }

  for (const row of itineraryRows) {
    const image = heroFor(row.heroImageId)
    display.set(displayKey('itinerary', row.id), {
      name: row.name,
      imageUrl: image.url,
      imageAlt: image.alt,
      href: entityHref('itinerary', row.slug),
      // A downloadable plan is bought once; the stepper is not offered.
      maxQuantity: 1,
    })
  }

  for (const row of packageRows) {
    const image = heroFor(row.heroImageId)
    display.set(displayKey('package', row.id), {
      name: row.name,
      imageUrl: image.url,
      imageAlt: image.alt,
      href: entityHref('package', row.slug),
      maxQuantity: row.maxGuests,
    })
  }

  for (const row of placeRows) {
    const visible = canSeePlace(row, held)
    const image = visible ? heroFor(row.heroImageId) : { url: null, alt: null }
    display.set(displayKey('place', row.id), {
      // Withholding the name from someone who has not unlocked the place is
      // the same rule the map applies; the page falls back to the group label.
      name: visible ? row.name : null,
      imageUrl: image.url,
      imageAlt: image.alt,
      href: visible ? entityHref('place', row.slug) : null,
      maxQuantity: 1,
    })
  }

  // A package line reads as its activity: "Nusa Dua Water Sports", with the
  // package itself named in the breakdown underneath.
  const activityById = new Map(activityRows.map((row) => [row.id, row]))
  const partNames = new Map<string, Localized>()
  for (const row of tierRows) {
    partNames.set(row.id, row.name)
    const parent = activityById.get(row.activityId)
    if (!parent) continue
    const image = heroFor(parent.heroImageId)
    display.set(displayKey('activity_tier', row.id), {
      name: parent.name,
      imageUrl: image.url,
      imageAlt: image.alt,
      href: entityHref('activity', parent.slug),
      maxQuantity: Math.min(row.maxGuests ?? parent.maxGuests, parent.maxGuests),
    })
  }

  const addonRows = await loadActivityAddons(activityRows.map((row) => row.id))
  for (const list of addonRows.values()) for (const row of list) partNames.set(row.id, row.name)
  // Included activities appear in a package's breakdown under their own name.
  for (const row of activityRows) if (!partNames.has(row.id)) partNames.set(row.id, row.name)
  const bookable = new Set<string>(BOOKABLE_STATUSES)

  const planRows = await planRowsPromise
  for (const row of planRows) {
    display.set(displayKey('plan', row.id), {
      name: row.name,
      imageUrl: null,
      imageAlt: null,
      href: '/plans',
      maxQuantity: 1,
    })
  }

  const customRows = await customRowsPromise
  for (const row of customRows) {
    display.set(displayKey('custom', row.id), {
      name: customRequestName(row),
      imageUrl: null,
      imageAlt: null,
      href: '/account/schedules',
      maxQuantity: 1,
    })
  }

  for (const row of vehicleRows) {
    display.set(displayKey('driver', row.vehicleClass), {
      name: row.label,
      imageUrl: null,
      imageAlt: null,
      // No link while the driver page is switched off (lib/features.ts).
      href: FEATURES.driver ? '/driver' : null,
      // Quantity for a driver line is days, derived from the date range.
      maxQuantity: null,
    })
  }

  const snapshot: CatalogSnapshot = {
    plans: planPriceMap(planRows),
    customRequests: customQuotePriceMap(customRows),
    activities: new Map(
      activityRows
        // Published and hidden (link-only) activities sell; unavailable ones do not.
        .filter((row) => bookable.has(row.status))
        .map((row) => [
          row.id,
          {
            priceMinor: row.priceMinor,
            currency: row.currency,
            maxGuests: row.maxGuests,
            leadTimeHours: row.leadTimeHours,
            timeSlots: row.timeSlots ?? [],
            multiDay: row.multiDay,
            minGuests: row.minGuests,
          },
        ]),
    ),
    activityTiers: new Map(
      tierRows
        .filter((row) => row.status === PUBLISHED)
        .map((row) => [
          row.id,
          {
            activityId: row.activityId,
            priceMinor: row.priceMinor,
            currency: row.currency,
            pricingMode: row.pricingMode,
            groupMax: row.groupMax,
            maxGuests: row.maxGuests,
            minGuests: row.minGuests,
            includesAddons: row.includesAddons ?? [],
            available: row.available,
            childPriceMinor: row.childPriceMinor,
            includedActivities: includedByTier.get(row.id) ?? [],
          },
        ]),
    ),
    activityAddons: addonRules(addonRows),
    itineraries: new Map(
      itineraryRows
        .filter((row) => row.status === PUBLISHED)
        .map((row) => [
          row.id,
          { priceMinor: row.priceMinor, currency: row.currency, version: row.version },
        ]),
    ),
    packages: new Map(
      packageRows
        .filter((row) => row.status === PUBLISHED)
        .map((row) => [
          row.id,
          {
            priceMinor: row.priceMinor,
            currency: row.currency,
            maxGuests: row.maxGuests,
            pricingMode: row.pricingMode === 'per_guest' ? 'per_guest' : 'flat',
          },
        ]),
    ),
    vehicles: new Map(
      vehicleRows.map((row) => [
        row.vehicleClass as VehicleClass,
        {
          dayRateMinor: row.dayRateMinor,
          currency: row.currency,
          maxPassengers: row.maxPassengers,
        },
      ]),
    ),
  }

  applyExtras(
    snapshot,
    await loadBookingExtras(
      activityRows.map((row) => row.id),
      tierRows.map((row) => row.id),
    ),
  )
  // Phase 3: what already pays for what (package ⊃ itinerary, VIP), and credits.
  await applyCoverageFacts(snapshot, items, userId)

  return { snapshot, display, partNames }
}

/**
 * Price snapshot written on the cart row at add time.
 *
 * Display continuity only — `unit_price_minor` is NOT NULL and the schema is
 * explicit that the server recomputes from the catalogue at checkout and
 * rejects mismatches. Nothing reads this value to decide what to charge.
 */
export async function snapshotUnitPrice(
  kind: string,
  refId: string | null,
  vehicleClass: string | null,
  userId: string | null = null,
): Promise<{ priceMinor: number; currency: string | null }> {
  if (kind === 'driver') {
    if (vehicleClass === null) return { priceMinor: 0, currency: null }
    const rows = await db
      .select({ priceMinor: driverVehicles.dayRateMinor, currency: driverVehicles.currency })
      .from(driverVehicles)
      .where(eq(driverVehicles.vehicleClass, vehicleClass))
      .limit(1)
    const row = rows[0]
    return row
      ? { priceMinor: row.priceMinor, currency: row.currency }
      : { priceMinor: 0, currency: null }
  }

  if (refId === null) return { priceMinor: 0, currency: null }

  if (kind === 'activity') {
    const rows = await db
      .select({ priceMinor: activities.priceMinor, currency: activities.currency })
      .from(activities)
      .where(eq(activities.id, refId))
      .limit(1)
    const row = rows[0]
    return row ?? { priceMinor: 0, currency: null }
  }

  if (kind === 'activity_tier') {
    const rows = await db
      .select({ priceMinor: activityTiers.priceMinor, currency: activityTiers.currency })
      .from(activityTiers)
      .where(eq(activityTiers.id, refId))
      .limit(1)
    const row = rows[0]
    return row ?? { priceMinor: 0, currency: null }
  }

  if (kind === 'itinerary') {
    const rows = await db
      .select({ priceMinor: itineraries.priceMinor, currency: itineraries.currency })
      .from(itineraries)
      .where(eq(itineraries.id, refId))
      .limit(1)
    const row = rows[0]
    return row ?? { priceMinor: 0, currency: null }
  }

  if (kind === 'package') {
    const rows = await db
      .select({ priceMinor: packages.priceMinor, currency: packages.currency })
      .from(packages)
      .where(eq(packages.id, refId))
      .limit(1)
    const row = rows[0]
    return row ?? { priceMinor: 0, currency: null }
  }

  if (kind === 'plan') {
    const [row] = await loadPlansById([refId])
    return row
      ? { priceMinor: row.priceMinor, currency: row.currency }
      : { priceMinor: 0, currency: null }
  }

  if (kind === 'custom') {
    const [row] = await loadPayableCustomQuotes([refId], userId)
    return row
      ? { priceMinor: row.priceMinor, currency: row.currency }
      : { priceMinor: 0, currency: null }
  }

  // Saved places are free but still belong on the confirmed itinerary.
  return { priceMinor: 0, currency: null }
}
