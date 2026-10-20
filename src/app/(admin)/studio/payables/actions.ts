'use server'

import { eq, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { orderItems, orders, supplierSettlements, suppliers } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fcurrency, fdate, fstr, fuuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { payableWhere } from './queries'

type Outcome = { ok: string } | { err: string }

const LIST = adminHref('/payables')

/**
 * Put a supplier's unpaid lines (one currency, optionally a travel-date
 * period) into a new payment run. The lines are locked while they are
 * counted, so two runs can never include the same line.
 */
export async function createSettlement(form: FormData): Promise<void> {
  const session = await requireCapability('suppliers.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const supplierId = fuuid(form, 'supplierId', t('pay.supplier'))
    const currency = fcurrency(form, 'currency')
    const from = fdate(form, 'from', t('pay.from'))
    const to = fdate(form, 'to', t('pay.to'))
    if (from && to && from > to) throw new Error(t('pay.err_period'))
    const notes = (fstr(form, 'notes') ?? '').trim().slice(0, 2000) || null

    const created = await db.transaction(async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.id, supplierId))
        .limit(1)
      if (!supplier) throw new Error(t('sup.err_gone'))
      const lines = await tx
        .select({
          id: orderItems.id,
          costMinor: orderItems.costMinor,
          travelDate: orderItems.travelDate,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(payableWhere({ supplierId, currency, from, to }))
        .for('update', { of: orderItems })
      if (lines.length === 0) throw new Error(t('pay.err_nothing'))
      const total = lines.reduce((sum, line) => sum + (line.costMinor ?? 0), 0)
      const dates = lines
        .map((line) => line.travelDate)
        .filter((day): day is string => day !== null)
        .sort()
      const today = new Date().toISOString().slice(0, 10)
      const [row] = await tx
        .insert(supplierSettlements)
        .values({
          supplierId,
          periodFrom: from ?? dates[0] ?? today,
          periodTo: to ?? dates[dates.length - 1] ?? today,
          totalMinor: total,
          currency,
          status: 'draft',
          notes,
          createdBy: session.userId,
        })
        .returning()
      if (!row) throw new Error(t('pay.err_nothing'))
      await tx
        .update(orderItems)
        .set({ settlementId: row.id })
        .where(
          inArray(
            orderItems.id,
            lines.map((line) => line.id),
          ),
        )
      await writeAudit(
        {
          actor: session,
          action: 'supplier_settlement.create',
          entityType: 'supplier_settlement',
          entityId: row.id,
          before: null,
          after: { ...row, lines: lines.length },
        },
        tx,
      )
      return { count: lines.length }
    })
    outcome = { ok: t('pay.ok_created', { count: created.count }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(LIST, outcome))
}

/** draft → sent → paid. Paid needs the transfer reference. Draft can be undone. */
export async function setSettlementStatus(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('suppliers.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const next = fstr(form, 'status') ?? ''
    const reference = (fstr(form, 'reference') ?? '').trim().slice(0, 128) || null
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(supplierSettlements)
        .where(eq(supplierSettlements.id, id))
        .for('update')
        .limit(1)
      if (!before) throw new Error(t('pay.err_gone'))
      if (before.status === 'paid') throw new Error(t('pay.err_already_paid'))
      if (next === 'delete') {
        if (before.status !== 'draft') throw new Error(t('pay.err_only_draft'))
        await tx
          .update(orderItems)
          .set({ settlementId: null })
          .where(eq(orderItems.settlementId, id))
        await tx.delete(supplierSettlements).where(eq(supplierSettlements.id, id))
      } else if (next === 'sent' || next === 'paid') {
        if (next === 'paid' && reference === null) throw new Error(t('pay.err_reference'))
        await tx
          .update(supplierSettlements)
          .set({
            status: next,
            ...(next === 'paid' ? { paidAt: new Date(), reference } : {}),
            ...(next === 'sent' && reference !== null ? { reference } : {}),
            updatedAt: new Date(),
          })
          .where(eq(supplierSettlements.id, id))
      } else {
        throw new Error(t('pay.err_status'))
      }
      await writeAudit(
        {
          actor: session,
          action: `supplier_settlement.${next}`,
          entityType: 'supplier_settlement',
          entityId: id,
          before,
          after: { status: next, reference },
        },
        tx,
      )
    })
    outcome = { ok: t(next === 'delete' ? 'pay.ok_deleted' : 'pay.ok_status') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(LIST, outcome))
}
