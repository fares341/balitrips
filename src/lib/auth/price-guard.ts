import { can, type Role } from './roles'

/**
 * The `prices.write` guard, shared by every server action that stores a price
 * or a cost (package and child prices, itinerary and package prices, add-on
 * prices, plan prices, supplier costs, vehicle day rates, seasonal prices).
 *
 * The rule is the one the package editor has had since Phase 6: a role
 * without `prices.write` may save everything else on the form, but the save
 * is refused when any price field differs from what is stored. The Studio
 * renders those fields read-only for such a role, so an ordinary save posts
 * the stored values back and passes; only a tampered or stale form fails.
 *
 * A new row has nothing stored: pass `before = null` and every price field
 * that carries a value (anything but null, undefined or 0) counts as a change.
 */

export type PriceFields = Record<string, unknown>

/** Two stored values are the same price: null and undefined are one; arrays and objects by content. */
function samePrice(a: unknown, b: unknown): boolean {
  const left = a === undefined ? null : a
  const right = b === undefined ? null : b
  if (left === right) return true
  if (left === null || right === null) return false
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  // A currency typed in lower case is the same currency.
  if (typeof left === 'string' && typeof right === 'string') {
    return left.trim().toUpperCase() === right.trim().toUpperCase()
  }
  return false
}

function emptyPrice(value: unknown): boolean {
  return value === null || value === undefined || value === 0 || value === ''
}

/** The price fields of `after` that differ from `before` (all set ones when `before` is null). */
export function changedPriceFields(
  before: PriceFields | null,
  after: PriceFields,
  keys: readonly string[],
): string[] {
  return keys.filter((key) =>
    before === null ? !emptyPrice(after[key]) : !samePrice(before[key], after[key]),
  )
}

/** May `role` store `after` over `before`? Always yes with `prices.write`. */
export function mayStorePrices(
  role: Role,
  before: PriceFields | null,
  after: PriceFields,
  keys: readonly string[],
): boolean {
  if (can(role, 'prices.write')) return true
  return changedPriceFields(before, after, keys).length === 0
}

export class PriceChangeError extends Error {
  constructor(
    message: string,
    readonly fields: string[],
  ) {
    super(message)
    this.name = 'PriceChangeError'
  }
}

/**
 * Throws `PriceChangeError(message)` when `role` lacks `prices.write` and a
 * price field changes. `message` is the plain, translated sentence the Studio
 * shows (`team.err_prices`).
 */
export function assertPriceChangeAllowed(
  role: Role,
  before: PriceFields | null,
  after: PriceFields,
  keys: readonly string[],
  message: string,
): void {
  if (can(role, 'prices.write')) return
  const changed = changedPriceFields(before, after, keys)
  if (changed.length > 0) throw new PriceChangeError(message, changed)
}

/** For actions that only create or remove a priced row: refused outright without `prices.write`. */
export function assertMayWritePrices(role: Role, message: string): void {
  if (!can(role, 'prices.write')) throw new PriceChangeError(message, [])
}
