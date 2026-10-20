/**
 * Phase 6: CSV imports against the database — building the preview's context
 * and applying a plan in one transaction.
 *
 * The preview is recomputed from the stored file every time it is shown, and
 * again inside the apply transaction (with the affected rows locked), so what
 * is applied is always what the database looks like at that moment — never a
 * stale preview from an hour ago.
 */

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { activityAvailability, activitySupplierOffers, externalProductMappings } from '@/db/schema'

import {
  availabilityKey,
  isApplied,
  planImport,
  readImportRows,
  type AvailabilityState,
  type ConflictPolicy,
  type ImportRow,
  type MappingState,
  type OfferState,
  type PlannedChange,
  type PlanSummary,
  type RowError,
} from './csv'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Reader = typeof db | Tx

export interface ImportPreview {
  rows: ImportRow[]
  errors: RowError[]
  changes: PlannedChange[]
  summary: PlanSummary
}

async function contextFor(
  reader: Reader,
  integrationId: string,
  supplierId: string,
  rows: readonly ImportRow[],
  policy: ConflictPolicy,
  lock: boolean,
) {
  const externalIds = [...new Set(rows.map((row) => row.externalId))]
  const mappingRows =
    externalIds.length === 0
      ? []
      : await reader
          .select({
            externalId: externalProductMappings.externalId,
            offerId: externalProductMappings.internalId,
            label: externalProductMappings.label,
            lastImportedAt: externalProductMappings.lastImportedAt,
          })
          .from(externalProductMappings)
          .where(
            and(
              eq(externalProductMappings.integrationId, integrationId),
              eq(externalProductMappings.internalKind, 'offer'),
              inArray(externalProductMappings.externalId, externalIds),
            ),
          )
  const mappings = new Map<string, MappingState>(mappingRows.map((row) => [row.externalId, row]))

  const offerIds = [...new Set(mappingRows.map((row) => row.offerId))]
  const offerQuery =
    offerIds.length === 0
      ? null
      : reader
          .select({
            id: activitySupplierOffers.id,
            activityId: activitySupplierOffers.activityId,
            costMinor: activitySupplierOffers.costMinor,
            currency: activitySupplierOffers.currency,
            updatedAt: activitySupplierOffers.updatedAt,
          })
          .from(activitySupplierOffers)
          .where(
            and(
              inArray(activitySupplierOffers.id, offerIds),
              // Only this connection's supplier's offers — a mapping can never
              // reach another supplier's costs.
              eq(activitySupplierOffers.supplierId, supplierId),
            ),
          )
  const offerRows =
    offerQuery === null ? [] : lock ? await offerQuery.for('update') : await offerQuery
  const offers = new Map<string, OfferState>(offerRows.map((row) => [row.id, row]))

  const activityIds = [...new Set(offerRows.map((row) => row.activityId))]
  const days = [
    ...new Set(rows.filter((row) => row.date !== null).map((row) => row.date as string)),
  ]
  const availabilityQuery =
    activityIds.length === 0 || days.length === 0
      ? null
      : reader
          .select({
            activityId: activityAvailability.activityId,
            day: activityAvailability.day,
            slot: activityAvailability.slot,
            capacity: activityAvailability.capacity,
            booked: activityAvailability.booked,
            isClosed: activityAvailability.isClosed,
            updatedAt: activityAvailability.updatedAt,
          })
          .from(activityAvailability)
          .where(
            and(
              inArray(activityAvailability.activityId, activityIds),
              inArray(activityAvailability.day, days),
            ),
          )
  const availabilityRows =
    availabilityQuery === null
      ? []
      : lock
        ? await availabilityQuery.for('update')
        : await availabilityQuery
  const availability = new Map<string, AvailabilityState>(
    availabilityRows.map((row) => [availabilityKey(row.activityId, row.day, row.slot), row]),
  )

  return { mappings, offers, availability, policy }
}

export async function previewImport(input: {
  integrationId: string
  supplierId: string
  body: string
  policy: ConflictPolicy
}): Promise<ImportPreview> {
  const { rows, errors } = readImportRows(input.body)
  const context = await contextFor(
    db,
    input.integrationId,
    input.supplierId,
    rows,
    input.policy,
    false,
  )
  const { changes, summary } = planImport(rows, context, errors.length)
  return { rows, errors, changes, summary }
}

/**
 * Apply inside `tx`. Returns the plan that was applied (recomputed under
 * lock). Only `create` and `update` rows are written; conflicts, kept rows,
 * unlinked ids and invalid lines are left for a person.
 */
export async function applyImport(
  tx: Tx,
  input: { integrationId: string; supplierId: string; body: string; policy: ConflictPolicy },
): Promise<ImportPreview> {
  const { rows, errors } = readImportRows(input.body)
  const context = await contextFor(
    tx,
    input.integrationId,
    input.supplierId,
    rows,
    input.policy,
    true,
  )
  const { changes, summary } = planImport(rows, context, errors.length)
  const at = new Date()

  for (const change of changes) {
    if (!isApplied(change) || !change.offerId) continue
    if (change.kind === 'product') {
      await tx
        .update(externalProductMappings)
        .set({ label: change.after?.label ?? null, updatedAt: at })
        .where(
          and(
            eq(externalProductMappings.integrationId, input.integrationId),
            eq(externalProductMappings.externalId, change.externalId),
          ),
        )
    } else if (change.kind === 'price') {
      await tx
        .update(activitySupplierOffers)
        .set({
          costMinor: change.after?.costMinor ?? 0,
          currency: change.after?.currency ?? 'USD',
          updatedAt: at,
        })
        .where(
          and(
            eq(activitySupplierOffers.id, change.offerId),
            eq(activitySupplierOffers.supplierId, input.supplierId),
          ),
        )
    } else if (change.activityId && change.date !== undefined) {
      await tx
        .insert(activityAvailability)
        .values({
          activityId: change.activityId,
          day: change.date,
          slot: change.slot ?? '',
          capacity: change.after?.capacity ?? null,
          isClosed: change.after?.closed ?? false,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: [
            activityAvailability.activityId,
            activityAvailability.day,
            activityAvailability.slot,
          ],
          // `booked` is never touched: places already sold stay sold.
          set: {
            capacity: change.after?.capacity ?? null,
            isClosed: change.after?.closed ?? false,
            updatedAt: at,
          },
        })
    }
  }

  // A linked id whose rows were all applied (or already equal) now counts as
  // imported at `at`; a later edit here (updatedAt > at) is what "changed
  // here" detects next time. An id with a conflict or a kept value is NOT
  // marked, so the same question is asked again on the next import.
  const open = new Set(
    changes
      .filter((change) => change.status === 'conflict' || change.status === 'kept')
      .map((change) => change.externalId),
  )
  const mentioned = [
    ...new Set(
      changes
        .filter((change) => change.offerId && !open.has(change.externalId))
        .map((change) => change.externalId),
    ),
  ]
  if (mentioned.length > 0) {
    await tx
      .update(externalProductMappings)
      .set({ lastImportedAt: at })
      .where(
        and(
          eq(externalProductMappings.integrationId, input.integrationId),
          inArray(externalProductMappings.externalId, mentioned),
        ),
      )
  }
  return { rows, errors, changes, summary }
}
