'use server'

import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { entitlements, users } from '@/db/schema'
import { revokeFamilyMembersOf } from '@/lib/entitlements/family'
import { notifyPlanActivated } from '@/lib/notify/plans'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fenum, freq, fstr, fuuid } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const LIST = adminHref('/entitlements')

const KINDS = ['map_access', 'vip'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Outcome = { ok: string } | { err: string }

/**
 * Grant access by hand.
 *
 * Used for support recoveries and comped accounts. Every grant records the
 * staff member who made it — "who gave this account the map" has to be
 * answerable months later, which is why `grantedByActorId` exists alongside
 * `grantedByOrderId`.
 */
export async function grantEntitlement(form: FormData): Promise<void> {
  const session = await requireCapability('entitlements.grant')
  let outcome: Outcome

  try {
    const email = freq(form, 'email', 'Customer email').toLowerCase()
    const kind = fenum(form, 'kind', KINDS, 'map_access')
    const expiresAtRaw = fstr(form, 'expiresAt')
    const reason = fstr(form, 'reason')

    let expiresAt: Date | null = null
    if (expiresAtRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAtRaw)) {
        throw new Error('Expiry must be a date (YYYY-MM-DD), or blank for lifetime')
      }
      expiresAt = new Date(`${expiresAtRaw}T23:59:59Z`)
    }

    const granted = await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1)

      if (!user) throw new Error(`No account exists for ${email}`)

      const [existing] = await tx
        .select({ id: entitlements.id })
        .from(entitlements)
        .where(
          and(
            eq(entitlements.userId, user.id),
            eq(entitlements.kind, kind),
            isNull(entitlements.revokedAt),
            // منتهية الصلاحية لا تمنع منحاً جديداً.
            or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date())),
          ),
        )
        .limit(1)

      if (existing) throw new Error(`${email} already has an active "${kind}" entitlement`)

      const [row] = await tx
        .insert(entitlements)
        .values({
          userId: user.id,
          kind,
          grantedByActorId: session.userId,
          // NULL expiry is lifetime, which is what the plan copy describes.
          expiresAt,
          revokedReason: null,
        })
        .returning()

      await writeAudit(
        {
          actor: session,
          action: 'entitlement.grant',
          entityType: 'entitlement',
          entityId: row?.id ?? null,
          before: null,
          after: { ...row, email, reason },
        },
        tx,
      )
      return row ? { userId: user.id, entitlementId: row.id } : null
    })

    // بعد الالتزام: داخل الموقع + بريد + واتساب (لمن وافق).
    if (granted) {
      await notifyPlanActivated(granted.userId, { kind, entitlementId: granted.entitlementId })
    }
    outcome = { ok: `Granted ${kind} to ${email}.` }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

/**
 * Revoke, never delete.
 *
 * The grant is an audit record; removing the row would erase the fact that
 * access was ever given. `loadEntitlements()` reads `revokedAt`, so access
 * disappears on the very next request rather than when a token expires.
 */
export async function revokeEntitlement(form: FormData): Promise<void> {
  const session = await requireCapability('entitlements.grant')
  let outcome: Outcome
  // "سحب" من صفحة العميل يعود إليها (حقل `customerId` اختياري).
  const customerId = fstr(form, 'customerId')
  const back = customerId && UUID.test(customerId) ? adminHref(`/customers/${customerId}`) : LIST

  try {
    const id = fuuid(form, 'entitlementId', 'Entitlement')
    const reason = fstr(form, 'reason') ?? `revoked by ${session.email}`

    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(entitlements).where(eq(entitlements.id, id)).limit(1)
      if (!before) throw new Error('That entitlement no longer exists')
      if (before.revokedAt) throw new Error('That entitlement is already revoked')

      const [after] = await tx
        .update(entitlements)
        .set({ revokedAt: new Date(), revokedReason: reason })
        .where(eq(entitlements.id, id))
        .returning()
      // باقة عائلية: الأفراد يحملون نسخاً منفصلة — تُسحب معها.
      await revokeFamilyMembersOf(tx, id, `owner revoked: ${reason}`)

      await writeAudit(
        {
          actor: session,
          action: 'entitlement.revoke',
          entityType: 'entitlement',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = { ok: 'Entitlement revoked. Access is gone on the next request.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(back, outcome))
}
