/**
 * Activity booking price — the v3 handoff formula, in one pure module.
 *
 *   total        = packageCost + Σ addonCost + driverCost
 *   packageCost  = per_group  ? ceil(people / group_max) × price
 *                : per_couple ? ceil(people / 2) × price     // "للزوجين"
 *                :              people × price
 *   addonCost    = per_person ? price × people
 *                : per_qty    ? price × min(qty, max_qty)
 *                :              price                      // per_booking
 *   driverCost   = vehicleFor(people).day_rate × days      // days = 1 unless multi-day
 *
 * Add-on rules:
 *   - in the package's `includes_addons` → included: shown, locked, not charged;
 *   - `only_packages` set and without the chosen package → rejected;
 *   - `requires_addon_id` not selected (or included) → rejected, and anything
 *     that depended on a rejected add-on is dropped with it;
 *   - `required` (a library add-on linked as required) → always added and
 *     charged when the package allows it, picked or not.
 *
 * Activities a package includes (`tier_included_activities`) are listed at
 * zero (`kind: 'included'`), one line each, so the order shows them.
 *
 * Used by three callers so they cannot disagree:
 *   - `buildQuote` (cart + checkout) — the copy that decides what is charged;
 *   - add-to-cart validation (`addActivityBooking`), which refuses a booking
 *     whose add-ons break a rule instead of storing it;
 *   - the activity page's live summary, for display only.
 *
 * No I/O, no Date.now(), no floats: amounts are integer minor units.
 */

import { daysBetweenInclusive, vehicleForPassengers, type VehicleClass } from '@/lib/booking-rules'

export type PackagePricing = 'per_person' | 'per_group' | 'per_couple'
export type AddonPricing = 'per_person' | 'per_booking' | 'per_qty'

export const PACKAGE_PRICINGS: readonly PackagePricing[] = ['per_person', 'per_group', 'per_couple']
export const ADDON_PRICINGS: readonly AddonPricing[] = ['per_person', 'per_booking', 'per_qty']

/**
 * A stored `activity_tiers.pricing_mode`, read tolerantly. Rows written before
 * migration 0013 said `per_guest` / `flat`; `flat` was one price for the whole
 * party, which is a `per_group` package whose group is the party.
 */
export function tierPricing(mode: string | null | undefined): PackagePricing {
  if (mode === 'per_couple') return 'per_couple'
  return mode === 'per_group' || mode === 'flat' ? 'per_group' : 'per_person'
}

/** People one unit of a `per_couple` package covers. */
export const COUPLE_SIZE = 2

export function addonPricing(mode: string | null | undefined): AddonPricing {
  return mode === 'per_person' || mode === 'per_qty' ? mode : 'per_booking'
}

/** What pricing needs to know about the chosen package. */
export interface PackageRule {
  /** `activity_tiers.id`; null for an activity sold at its own base price. */
  id: string | null
  priceMinor: number
  currency: string
  pricing: PackagePricing
  /** People one `per_group` unit covers. Null/invalid = the whole party is one unit. */
  groupMax: number | null
  /** Add-on ids that come with this package. */
  includesAddons: readonly string[]
}

export interface AddonRule {
  id: string
  priceMinor: number
  currency: string
  pricing: AddonPricing
  /** Ceiling for `per_qty`. Null = 1. */
  maxQty: number | null
  /** Package ids this add-on may be bought with. Empty = every package. */
  onlyPackages: readonly string[]
  requiresAddonId: string | null
  available: boolean
  /** Always added and charged (library link marked required). Absent = optional. */
  required?: boolean
}

export interface VehicleRate {
  vehicleClass: VehicleClass
  dayRateMinor: number
  currency: string
}

export interface AddonPick {
  id: string
  qty: number
}

export type AddonState =
  | { kind: 'selectable' }
  /** Comes with the package: checked, locked, free. */
  | { kind: 'included' }
  /** Switched off in the admin. */
  | { kind: 'unavailable' }
  /** `only_packages` excludes the chosen package. */
  | { kind: 'not_for_package' }
  /** Needs another add-on selected first. */
  | { kind: 'requires'; requiresAddonId: string }
  /** Always part of the booking and charged: checked, locked. */
  | { kind: 'required' }

export type AddonRejection =
  | 'unknown'
  | 'duplicate'
  | 'invalid_qty'
  | 'currency'
  | 'unavailable'
  | 'not_for_package'
  | 'requires'

export interface PriceLine {
  kind: 'package' | 'addon' | 'driver' | 'included'
  /**
   * Package / add-on id; the included activity's id; null for a base-price
   * activity and for the driver.
   */
  refId: string | null
  /** Included activity with its own slot: the time picked. */
  time?: string | null
  unitMinor: number
  quantity: number
  totalMinor: number
  /** An add-on that comes with the package: listed at zero. */
  included?: boolean
  vehicleClass?: VehicleClass
}

function positiveInt(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null
}

function assertPeople(people: number): void {
  if (!Number.isInteger(people) || people < 1) {
    throw new RangeError(`people must be a positive integer, got ${people}`)
  }
}

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

/** Units charged: people for per_person, groups for per_group, couples for per_couple. */
export function packageUnits(
  pkg: Pick<PackageRule, 'pricing' | 'groupMax'>,
  people: number,
): number {
  assertPeople(people)
  if (pkg.pricing === 'per_person') return people
  if (pkg.pricing === 'per_couple') return Math.ceil(people / COUPLE_SIZE)
  const groupMax = positiveInt(pkg.groupMax)
  return groupMax === null ? 1 : Math.ceil(people / groupMax)
}

export function packageCostMinor(
  pkg: Pick<PackageRule, 'pricing' | 'groupMax' | 'priceMinor'>,
  people: number,
): number {
  return pkg.priceMinor * packageUnits(pkg, people)
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

/** The multiplier an add-on is charged at. */
export function addonUnits(
  addon: Pick<AddonRule, 'pricing' | 'maxQty'>,
  people: number,
  qty: number,
): number {
  assertPeople(people)
  if (addon.pricing === 'per_person') return people
  if (addon.pricing === 'per_booking') return 1
  const max = positiveInt(addon.maxQty) ?? 1
  const wanted = positiveInt(qty) ?? 1
  return Math.min(wanted, max)
}

export function addonCostMinor(
  addon: Pick<AddonRule, 'pricing' | 'maxQty' | 'priceMinor'>,
  people: number,
  qty: number,
): number {
  return addon.priceMinor * addonUnits(addon, people, qty)
}

/**
 * The state of one add-on given the package and what else is selected.
 * `selected` should contain the picked ids; included ones count as selected
 * for `requires` (a prerequisite that comes with the package is satisfied).
 */
export function addonState(
  addon: AddonRule,
  pkg: Pick<PackageRule, 'id' | 'includesAddons'>,
  selected: ReadonlySet<string>,
): AddonState {
  if (pkg.includesAddons.includes(addon.id)) return { kind: 'included' }
  if (!addon.available) return { kind: 'unavailable' }
  if (addon.onlyPackages.length > 0 && (pkg.id === null || !addon.onlyPackages.includes(pkg.id))) {
    return { kind: 'not_for_package' }
  }
  if (
    addon.requiresAddonId !== null &&
    !selected.has(addon.requiresAddonId) &&
    !pkg.includesAddons.includes(addon.requiresAddonId)
  ) {
    return { kind: 'requires', requiresAddonId: addon.requiresAddonId }
  }
  if (addon.required === true) return { kind: 'required' }
  return { kind: 'selectable' }
}

export interface AddonResolution {
  /** Charged add-ons, quantities normalised (1 unless per_qty, clamped to max). */
  accepted: AddonPick[]
  /** Picked or not, these come with the package. */
  included: string[]
  rejected: { id: string; reason: AddonRejection }[]
}

/**
 * Apply every rule to a requested selection.
 *
 * Runs to a fixed point so a chain collapses completely: rejecting "photos"
 * drops "video" (requires photos), which drops "video edit" (requires video).
 */
export function resolveAddons(
  catalog: readonly AddonRule[],
  pkg: PackageRule,
  picks: readonly AddonPick[],
): AddonResolution {
  const byId = new Map(catalog.map((addon) => [addon.id, addon]))
  const rejected: AddonResolution['rejected'] = []
  const seen = new Set<string>()
  let candidates: { addon: AddonRule; qty: number }[] = []

  for (const pick of picks) {
    if (seen.has(pick.id)) {
      rejected.push({ id: pick.id, reason: 'duplicate' })
      continue
    }
    seen.add(pick.id)
    const addon = byId.get(pick.id)
    if (!addon) {
      rejected.push({ id: pick.id, reason: 'unknown' })
      continue
    }
    if (pkg.includesAddons.includes(addon.id)) continue // included, never charged
    if (!Number.isInteger(pick.qty) || pick.qty < 1) {
      rejected.push({ id: pick.id, reason: 'invalid_qty' })
      continue
    }
    if (addon.currency !== pkg.currency) {
      rejected.push({ id: pick.id, reason: 'currency' })
      continue
    }
    candidates.push({ addon, qty: pick.qty })
  }

  // Required add-ons join the booking whether or not they were picked; the
  // fixed point below still drops one the package does not allow.
  for (const addon of catalog) {
    if (addon.required !== true || seen.has(addon.id)) continue
    if (pkg.includesAddons.includes(addon.id) || addon.currency !== pkg.currency) continue
    const state = addonState(addon, pkg, new Set())
    if (state.kind !== 'required') continue
    candidates.push({ addon, qty: 1 })
  }

  for (;;) {
    const selected = new Set(candidates.map((c) => c.addon.id))
    const next: typeof candidates = []
    for (const candidate of candidates) {
      const state = addonState(candidate.addon, pkg, selected)
      if (state.kind === 'selectable' || state.kind === 'required') next.push(candidate)
      else
        rejected.push({
          id: candidate.addon.id,
          reason: state.kind === 'requires' ? 'requires' : (state.kind as AddonRejection),
        })
    }
    if (next.length === candidates.length) break
    candidates = next
  }

  return {
    accepted: candidates.map(({ addon, qty }) => ({
      id: addon.id,
      qty: addon.pricing === 'per_qty' ? Math.min(qty, positiveInt(addon.maxQty) ?? 1) : 1,
    })),
    included: catalog.filter((a) => pkg.includesAddons.includes(a.id)).map((a) => a.id),
    rejected,
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/** The handoff's `vehicleFor(n)`: 1-4 sedan, 5-7 SUV, 8+ van. */
export function vehicleFor(people: number): VehicleClass {
  return vehicleForPassengers(people)
}

/** Days a driver is hired for an activity: 1, or the whole range when multi-day. */
export function driverDays(multiDay: boolean, start: string, end: string | null): number {
  if (!multiDay || end === null || end === '') return 1
  return daysBetweenInclusive(start, end)
}

export function driverCostMinor(vehicle: Pick<VehicleRate, 'dayRateMinor'>, days: number): number {
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`days must be ≥ 1, got ${days}`)
  return vehicle.dayRateMinor * days
}

// ---------------------------------------------------------------------------
// Whole booking
// ---------------------------------------------------------------------------

export interface BookingPriceInput {
  pkg: PackageRule
  addons: readonly AddonRule[]
  picks: readonly AddonPick[]
  people: number
  /**
   * Activities that come with the package, in display order. Listed at zero;
   * `time` is the slot picked for one with its own time (else null).
   */
  included?: readonly { activityId: string; time: string | null }[]
  /** Omit or null when no driver is wanted. */
  driver?: { vehicles: readonly VehicleRate[]; days: number } | null
}

export interface BookingPrice {
  lines: PriceLine[]
  packageMinor: number
  addonsMinor: number
  driverMinor: number
  totalMinor: number
  currency: string
  resolution: AddonResolution
  /** The class `vehicleFor(people)` picked, whether or not a driver is on. */
  vehicleClass: VehicleClass
  /** A driver was asked for but no rate exists in the package's currency. */
  driverUnavailable: boolean
}

export function priceBooking(input: BookingPriceInput): BookingPrice {
  const { pkg, people } = input
  assertPeople(people)

  const units = packageUnits(pkg, people)
  const packageMinor = pkg.priceMinor * units
  const lines: PriceLine[] = [
    {
      kind: 'package',
      refId: pkg.id,
      unitMinor: pkg.priceMinor,
      quantity: units,
      totalMinor: packageMinor,
    },
  ]

  for (const included of input.included ?? []) {
    lines.push({
      kind: 'included',
      refId: included.activityId,
      unitMinor: 0,
      quantity: people,
      totalMinor: 0,
      included: true,
      time: included.time,
    })
  }

  const resolution = resolveAddons(input.addons, pkg, input.picks)
  const byId = new Map(input.addons.map((addon) => [addon.id, addon]))

  for (const id of resolution.included) {
    const addon = byId.get(id)
    if (!addon) continue
    lines.push({
      kind: 'addon',
      refId: id,
      unitMinor: 0,
      quantity: 1,
      totalMinor: 0,
      included: true,
    })
  }

  let addonsMinor = 0
  for (const pick of resolution.accepted) {
    const addon = byId.get(pick.id)
    if (!addon) continue
    const quantity = addonUnits(addon, people, pick.qty)
    const totalMinor = addon.priceMinor * quantity
    addonsMinor += totalMinor
    lines.push({
      kind: 'addon',
      refId: addon.id,
      unitMinor: addon.priceMinor,
      quantity,
      totalMinor,
    })
  }

  const vehicleClass = vehicleFor(people)
  let driverMinor = 0
  let driverUnavailable = false
  if (input.driver) {
    const rate = input.driver.vehicles.find(
      (v) => v.vehicleClass === vehicleClass && v.currency === pkg.currency,
    )
    if (rate) {
      driverMinor = driverCostMinor(rate, input.driver.days)
      lines.push({
        kind: 'driver',
        refId: null,
        unitMinor: rate.dayRateMinor,
        quantity: input.driver.days,
        totalMinor: driverMinor,
        vehicleClass,
      })
    } else {
      driverUnavailable = true
    }
  }

  return {
    lines,
    packageMinor,
    addonsMinor,
    driverMinor,
    totalMinor: packageMinor + addonsMinor + driverMinor,
    currency: pkg.currency,
    resolution,
    vehicleClass,
    driverUnavailable,
  }
}
