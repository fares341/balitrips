'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import {
  couponRedemptions,
  crmTasks,
  customerNotes,
  customerTags,
  customTripRequests,
  entitlements,
  favorites,
  orders,
  supportTickets,
  users,
} from '@/db/schema'
import { checkMerge, tagsToMove } from '@/lib/crm/merge'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fuuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/**
 * Merge one customer account into another (admin only, `customers.merge`).
 *
 * Moves — never deletes — orders, access, trip requests, notes, tags, tasks,
 * tickets, saved items and coupon uses to the account kept. The other account
 * is switched off and marked as merged, so its page still says where
 * everything went. One transaction, both accounts locked, one audit row with
 * the counts.
 */
export async function mergeCustomers(form: FormData): Promise<void> {
  const session = await requireCapability('customers.merge')
  const { t } = await getAdminI18n()
  let target = adminHref('/duplicates')
  let outcome: { ok: string } | { err: string }
  try {
    const keepId = fuuid(form, 'keepId', t('dup.keep'))
    const dropId = fuuid(form, 'dropId', t('dup.drop'))

    const moved = await db.transaction(async (tx) => {
      const locked = await tx
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
          deletedAt: users.deletedAt,
          mergedIntoUserId: users.mergedIntoUserId,
        })
        .from(users)
        .where(inArray(users.id, [keepId, dropId]))
        .for('update')
      const keep = locked.find((row) => row.id === keepId)
      const drop = locked.find((row) => row.id === dropId)
      if (!keep || !drop) throw new Error(t('dup.err_gone'))
      const refusal = checkMerge(keep, drop)
      if (refusal !== null) throw new Error(t(`dup.err_${refusal}`))

      const count = async (rows: PromiseLike<readonly unknown[]>) => (await rows).length
      const counts = {
        orders: await count(
          tx
            .update(orders)
            .set({ userId: keepId })
            .where(eq(orders.userId, dropId))
            .returning({ id: orders.id }),
        ),
        entitlements: await count(
          tx
            .update(entitlements)
            .set({ userId: keepId })
            .where(eq(entitlements.userId, dropId))
            .returning({ id: entitlements.id }),
        ),
        requests: await count(
          tx
            .update(customTripRequests)
            .set({ userId: keepId })
            .where(eq(customTripRequests.userId, dropId))
            .returning({ id: customTripRequests.id }),
        ),
        notes: await count(
          tx
            .update(customerNotes)
            .set({ userId: keepId })
            .where(eq(customerNotes.userId, dropId))
            .returning({ id: customerNotes.id }),
        ),
        tasks: await count(
          tx
            .update(crmTasks)
            .set({ customerId: keepId })
            .where(eq(crmTasks.customerId, dropId))
            .returning({ id: crmTasks.id }),
        ),
        tickets: await count(
          tx
            .update(supportTickets)
            .set({ userId: keepId })
            .where(eq(supportTickets.userId, dropId))
            .returning({ id: supportTickets.id }),
        ),
        couponUses: await count(
          tx
            .update(couponRedemptions)
            .set({ userId: keepId })
            .where(eq(couponRedemptions.userId, dropId))
            .returning({ id: couponRedemptions.id }),
        ),
        tags: 0,
        favorites: 0,
      }

      const [keepTags, dropTags] = await Promise.all([
        tx
          .select({ tag: customerTags.tag })
          .from(customerTags)
          .where(eq(customerTags.userId, keepId)),
        tx
          .select({ tag: customerTags.tag })
          .from(customerTags)
          .where(eq(customerTags.userId, dropId)),
      ])
      const newTags = tagsToMove(
        keepTags.map((row) => row.tag),
        dropTags.map((row) => row.tag),
      )
      if (newTags.length > 0) {
        await tx
          .insert(customerTags)
          .values(newTags.map((tag) => ({ userId: keepId, tag, createdBy: session.userId })))
          .onConflictDoNothing()
      }
      counts.tags = newTags.length

      // Saved items the kept account does not already have.
      const favs = await tx
        .update(favorites)
        .set({ userId: keepId })
        .where(
          and(
            eq(favorites.userId, dropId),
            sql`not exists (select 1 from favorites f where f.user_id = ${keepId} and f.kind = ${favorites.kind} and f.ref_id = ${favorites.refId})`,
          ),
        )
        .returning({ refId: favorites.refId })
      counts.favorites = favs.length

      await tx
        .update(users)
        .set({ status: 'inactive', mergedIntoUserId: keepId })
        .where(eq(users.id, dropId))
      await tx.insert(customerNotes).values({
        userId: keepId,
        authorId: session.userId,
        body: t('dup.note_merged', { email: drop.email }),
      })
      await writeAudit(
        {
          actor: session,
          action: 'customer.merge',
          entityType: 'user',
          entityId: keepId,
          before: { mergedAccount: dropId, mergedEmail: drop.email },
          after: { keptAccount: keepId, moved: counts },
        },
        tx,
      )
      return counts
    })
    target = adminHref(`/customers/${keepId}`)
    outcome = { ok: t('dup.ok_merged', { orders: moved.orders }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}
