/**
 * Merging two customer accounts — the safety rules, as a pure function.
 *
 * A merge MOVES things from the account being merged away to the account
 * kept: orders, purchases' access, trip requests, notes, tags, tasks and
 * support tickets. It never deletes an order or a payment, and it never
 * deletes the merged-away account either — that one is switched off and
 * marked `merged_into_user_id`, so the history stays readable and the audit
 * log can answer "where did this order go".
 */

export interface MergeSide {
  id: string
  role: string
  status: string
  deletedAt: Date | null
  mergedIntoUserId: string | null
}

export type MergeRefusal = 'same_account' | 'staff_account' | 'deleted' | 'already_merged'

/** The tables a merge moves, in the order it moves them. */
export const MERGE_STEPS = [
  'orders',
  'entitlements',
  'custom_trip_requests',
  'customer_notes',
  'customer_tags',
  'crm_tasks',
  'support_tickets',
  'favorites',
] as const

export function checkMerge(keep: MergeSide, drop: MergeSide): MergeRefusal | null {
  if (keep.id === drop.id) return 'same_account'
  // Staff and admin accounts carry permissions; folding one into another (or a
  // customer into one) would move access, not history. Never.
  if (keep.role !== 'customer' || drop.role !== 'customer') return 'staff_account'
  if (keep.deletedAt !== null || drop.deletedAt !== null) return 'deleted'
  if (keep.mergedIntoUserId !== null || drop.mergedIntoUserId !== null) return 'already_merged'
  return null
}

/** Tags of the dropped account the kept one does not have yet (the rest would collide). */
export function tagsToMove(keepTags: readonly string[], dropTags: readonly string[]): string[] {
  const have = new Set(keepTags)
  return [...new Set(dropTags)].filter((tag) => !have.has(tag))
}
