/**
 * Merging a guest's trip into their account's: which of the account's lines
 * the incoming ones replace.
 *
 * The same thing can be in both carts — the itinerary added last week while
 * signed in, and again just now before signing in at checkout. Moving every
 * line across would list it twice and charge it twice. The line from this
 * visit wins (it carries today's choices: level, devices, party size); the
 * account's older copy goes, with any driver linked to it.
 *
 * Pure, so the rule is unit-tested without a database.
 */

/** Bought once whatever was picked with it: the product is the booking. */
const ONE_PER_CART: readonly string[] = ['itinerary', 'plan', 'custom', 'place']

export interface MergeLine {
  id: string
  kind: string
  refId: string | null
  travelDate: string | null
  travelTime: string | null
  endDate: string | null
  vehicleClass: string | null
  parentItemId: string | null
  options: {
    addons?: { id: string; qty: number }[]
    included?: { activityId: string; time: string | null }[]
  } | null
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** What makes two top-level lines the same booking. */
function bookingKey(line: MergeLine): string {
  const base = [line.kind, line.refId ?? '']
  if (ONE_PER_CART.includes(line.kind)) return JSON.stringify(base)
  const addons = (line.options?.addons ?? []).map((a) => `${a.id}×${a.qty}`).sort(byText)
  const included = (line.options?.included ?? [])
    .filter((entry) => entry.time !== null && entry.time !== '')
    .map((entry) => `${entry.activityId}@${entry.time}`)
    .sort(byText)
  return JSON.stringify([
    ...base,
    line.travelDate ?? '',
    (line.travelTime ?? '').slice(0, 5),
    line.endDate ?? '',
    line.vehicleClass ?? '',
    addons,
    included,
  ])
}

/**
 * Ids of the account's lines to drop before the incoming lines move in:
 * every top-level line that is the same booking as an incoming one, and the
 * lines linked to it.
 */
export function supersededLineIds(
  owned: readonly MergeLine[],
  incoming: readonly MergeLine[],
): string[] {
  const arriving = new Set(
    incoming.filter((line) => line.parentItemId === null).map((line) => bookingKey(line)),
  )
  const parents = owned
    .filter((line) => line.parentItemId === null && arriving.has(bookingKey(line)))
    .map((line) => line.id)
  const children = owned
    .filter((line) => line.parentItemId !== null && parents.includes(line.parentItemId))
    .map((line) => line.id)
  return [...parents, ...children]
}
