/**
 * Grant rules that need no database — pure, unit-tested (phase 3).
 */

/**
 * Which plan lines of a paid order grant access — pure. One grant per plan
 * (a plan never counts twice in one order), none for a plan line under an
 * itinerary line (see `grantOrderPlans`).
 */
export function grantablePlanLines<T extends { plan: { id: string }; parentItemId: string | null }>(
  lines: readonly T[],
  itineraryLineIds: ReadonlySet<string>,
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const line of lines) {
    if (line.parentItemId !== null && itineraryLineIds.has(line.parentItemId)) continue
    if (seen.has(line.plan.id)) continue
    seen.add(line.plan.id)
    out.push(line)
  }
  return out
}

interface LineState {
  id: string
  lineTotalMinor: number
  refundedMinor: number
  fulfilmentStatus: string
  parentItemId: string | null
}

/**
 * Is a paid order line still paid for — pure? Not refunded or cancelled, and:
 * a priced line not fully refunded; a free line (a package's child, a line the
 * cart found already paid for) as long as the line it hangs under is live.
 * A free line under nothing (a saved place) paid for nothing, and never
 * counts — exactly as "refunded < total" read it before phase 3.
 */
export function isLineLive<T extends LineState>(row: T, lines: readonly T[], depth = 0): boolean {
  if (row.fulfilmentStatus === 'refunded' || row.fulfilmentStatus === 'cancelled') return false
  if (row.lineTotalMinor > 0) return row.refundedMinor < row.lineTotalMinor
  if (row.parentItemId === null || depth > 4) return false
  const parent = lines.find((other) => other.id === row.parentItemId)
  return parent === undefined ? false : isLineLive(parent, lines, depth + 1)
}
