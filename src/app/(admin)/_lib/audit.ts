import { db } from '@/db'
import { auditLog } from '@/db/schema'

import type { AdminSession } from './session'

/**
 * The audit trail.
 *
 * Every mutation the admin performs writes one row: who, what, which entity,
 * and the fields that actually changed. Refunds, entitlement grants and role
 * changes are the ones that matter most — "who gave this account map access"
 * has to be answerable months later, and a payment dispute is won with
 * timestamped evidence, not recollection.
 *
 * Written inside the same transaction as the change wherever a transaction
 * exists, so a rolled-back mutation cannot leave a phantom audit row.
 */

/** A Drizzle transaction handle, as `db.transaction` hands it to its callback. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type AuditRecord = Record<string, unknown>

export interface AuditEntry {
  actor: AdminSession
  /** Verb-ish and stable, e.g. `activity.publish`, `order.refund`. */
  action: string
  entityType: string
  entityId?: string | null
  before?: AuditRecord | null
  after?: AuditRecord | null
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/**
 * Narrow two snapshots to the keys that differ.
 *
 * Storing whole rows makes the log unreadable — a one-character copy edit
 * would bury the price change three rows below it. Storing only the delta
 * makes "what changed" the thing you can actually see.
 */
export function diffRecords(
  before: AuditRecord | null | undefined,
  after: AuditRecord | null | undefined,
): { before: AuditRecord | null; after: AuditRecord | null } {
  if (!before) return { before: null, after: after ?? null }
  if (!after) return { before: before ?? null, after: null }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const beforeDelta: AuditRecord = {}
  const afterDelta: AuditRecord = {}

  for (const key of keys) {
    if (stable(before[key]) === stable(after[key])) continue
    beforeDelta[key] = before[key] ?? null
    afterDelta[key] = after[key] ?? null
  }

  return { before: beforeDelta, after: afterDelta }
}

/** Write one audit row. Pass `tx` whenever the mutation has a transaction. */
export async function writeAudit(entry: AuditEntry, tx?: Tx): Promise<void> {
  const delta = diffRecords(entry.before, entry.after)

  const values = {
    actorId: entry.actor.userId,
    action: entry.action.slice(0, 64),
    entityType: entry.entityType.slice(0, 64),
    entityId: entry.entityId ?? null,
    before: delta.before,
    after: delta.after,
    ipAddress: entry.actor.ipAddress,
  }

  if (tx) await tx.insert(auditLog).values(values)
  else await db.insert(auditLog).values(values)
}
