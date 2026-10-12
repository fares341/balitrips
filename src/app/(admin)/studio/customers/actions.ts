'use server'

import { and, eq, gt, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { logActivity } from '@/lib/security/activity'
import { entitlements, plans, sessions, users } from '@/db/schema'
import { isPlaceholderEmail, normalizePhone, placeholderEmailFor } from '@/lib/auth/phone'
import { can, isElevated, isRole, ROLES, type Role } from '@/lib/auth/roles'
import { isEntitlementKind } from '@/lib/entitlements'
import { revokeFamilyMembersOf } from '@/lib/entitlements/family'
import { planExpiry } from '@/lib/entitlements/plans'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, freq, fstr, fuuid } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { clearAllVerifications, clearSessionVerification } from '../../_lib/two-factor'

/**
 * Customer and staff account administration.
 *
 * Two of these are genuinely dangerous and are written accordingly.
 *
 * **Role change revokes every session.** A role is read from the session on
 * every request, but Better Auth answers most of those reads from its cookie
 * cache, so a demoted admin would keep their capabilities until the cache
 * expired — an unbounded window during which someone you have just removed
 * still has the keys. Deleting their session rows closes it immediately, and
 * the two-factor markers keyed to those sessions go with them. The same
 * applies in the other direction: a promotion must not silently inherit a
 * session that never passed a second-factor challenge, because `roles.ts`
 * only requires one of elevated roles.
 *
 * **Delete is soft and preserves orders.** `getSession()` already treats
 * `users.deleted_at` as signed out, so the flag is enough to end access.
 * Hard-deleting would cascade through `carts`, `favorites` and `entitlements`
 * and — worse — orphan `orders.user_id`, destroying the financial record of
 * money the business actually took. Orders are kept deliberately: the
 * customer's contact details on each one are already a frozen snapshot, and a
 * tax authority and a card scheme both expect them to exist for years.
 */

type Outcome = { ok: string } | { err: string }

const detail = (id: string) => adminHref(`/customers/${id}`)

/**
 * Change a user's role.
 *
 * `roles.write` is admin-only, so staff cannot promote themselves. Self-
 * demotion is refused outright: an admin who removes their own last
 * capability locks the whole team out of the only screen that could restore
 * it, and there is no recovery path that does not involve psql.
 *
 * Those two rules together guarantee at least one admin always survives. A
 * can demote B, but then B no longer holds `roles.write` and cannot demote A;
 * and A cannot demote A. There is no sequence of calls that empties the role.
 */
export async function changeRole(userId: string, form: FormData): Promise<void> {
  const session = await requireCapability('roles.write')
  let outcome: Outcome

  try {
    const nextRole = freq(form, 'role', 'Role')
    if (!isRole(nextRole)) {
      throw new Error(`"${nextRole}" is not a role. Expected one of ${ROLES.join(', ')}.`)
    }

    if (userId === session.userId) {
      throw new Error(
        'You cannot change your own role. Ask another admin — a self-demotion here can lock everyone out.',
      )
    }

    const revoked = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!before) throw new Error('That account no longer exists')
      if (before.role === nextRole) throw new Error(`That account is already ${nextRole}.`)

      await tx.update(users).set({ role: nextRole }).where(eq(users.id, userId))

      // Sessions carry the OLD role until their cookie cache expires. Kill
      // them so the change takes effect on the next request, not eventually.
      const killed = await tx
        .delete(sessions)
        .where(eq(sessions.userId, userId))
        .returning({ id: sessions.id })

      await clearAllVerifications(userId, tx)

      await writeAudit(
        {
          actor: session,
          action: 'user.role',
          entityType: 'user',
          entityId: userId,
          before: { role: before.role, email: before.email },
          after: { role: nextRole, email: before.email, sessionsRevoked: killed.length },
        },
        tx,
      )

      return killed.length
    })

    outcome = {
      ok: `Role changed to ${nextRole}. ${revoked} session${revoked === 1 ? '' : 's'} revoked, so the change is in force now rather than whenever a cached session expired.`,
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(userId), outcome))
}

/**
 * Refuse to let a non-admin end a colleague's session.
 *
 * Support staff genuinely need "sign this customer out" — a lost phone is the
 * everyday case, and gating it behind an admin makes it useless. But the same
 * button pointed at an admin account is a denial of service by someone who
 * cannot be promoted and cannot promote themselves: revoke in a loop and the
 * only person who could stop you is signed out.
 *
 * So the rule is asymmetric on purpose. Anyone with `customers.read` may end a
 * customer's session; ending an ELEVATED account's session needs
 * `roles.write`, which is admin-only.
 */
async function assertMayRevokeFor(
  actorRole: Role,
  targetRole: string,
  actorId: string,
  targetId: string,
): Promise<void> {
  if (!isRole(targetRole) || !isElevated(targetRole)) return
  // Signing yourself out is always allowed — it is the safe direction.
  if (actorId === targetId) return
  if (can(actorRole, 'roles.write')) return

  throw new Error(
    'Only an admin can end a staff or admin session. Ask an admin, or have the account sign out itself.',
  )
}

/** Sign one device out. Used when a customer reports a lost phone. */
export async function revokeSession(userId: string, form: FormData): Promise<void> {
  const session = await requireCapability('customers.read')
  let outcome: Outcome

  try {
    const sessionId = fuuid(form, 'sessionId', 'Session')

    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!target) throw new Error('That account no longer exists')
      await assertMayRevokeFor(session.role, target.role, session.userId, userId)

      const [before] = await tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
        .limit(1)

      // Scoped to the user in the WHERE clause rather than checked after the
      // read: without it, a forged `sessionId` would let a staff member end
      // any session in the system from a page they are allowed to open.
      if (!before) throw new Error('That session does not belong to this account')

      await tx.delete(sessions).where(eq(sessions.id, sessionId))
      await clearSessionVerification(sessionId, tx)

      await writeAudit(
        {
          actor: session,
          action: 'user.session_revoke',
          entityType: 'user',
          entityId: userId,
          before: {
            sessionId,
            ipAddress: before.ipAddress,
            userAgent: before.userAgent,
            expiresAt: before.expiresAt.toISOString(),
          },
          after: null,
        },
        tx,
      )
    })

    outcome = { ok: 'Session revoked.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(userId), outcome))
}

/** Sign every device out at once. */
export async function revokeAllSessions(userId: string): Promise<void> {
  const session = await requireCapability('customers.read')
  let outcome: Outcome

  try {
    const revoked = await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) throw new Error('That account no longer exists')

      await assertMayRevokeFor(session.role, user.role, session.userId, userId)

      const killed = await tx
        .delete(sessions)
        .where(eq(sessions.userId, userId))
        .returning({ id: sessions.id })

      await clearAllVerifications(userId, tx)

      await writeAudit(
        {
          actor: session,
          action: 'user.sessions_revoke_all',
          entityType: 'user',
          entityId: userId,
          before: { email: user.email, sessions: killed.length },
          after: { email: user.email, sessions: 0 },
        },
        tx,
      )

      return killed.length
    })

    outcome = { ok: `${revoked} session${revoked === 1 ? '' : 's'} revoked.` }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(userId), outcome))
}

/**
 * Erasure request (GDPR art. 17 / PDPL).
 *
 * Soft delete plus session revocation plus pseudonymisation of the directly
 * identifying columns. Orders are NOT touched: the lawful basis for keeping
 * them is a legal obligation, not consent, and the customer snapshot on each
 * order is a frozen record of a transaction that actually happened.
 *
 * The e-mail is rewritten rather than nulled, because `users_email_unique`
 * would otherwise refuse a second erasure, and because someone signing up
 * again with the same address must get a clean account rather than colliding
 * with a tombstone.
 */
export async function deleteCustomer(userId: string, form: FormData): Promise<void> {
  const session = await requireCapability('customers.export')
  let outcome: Outcome

  try {
    const reason = fstr(form, 'reason')
    const confirmation = freq(form, 'confirm', 'Confirmation')

    if (userId === session.userId) {
      throw new Error('You cannot delete your own account from here.')
    }

    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1)

      if (!before) throw new Error('That account is already deleted, or no longer exists')

      // Typing the address is the whole confirmation step: a bare "are you
      // sure" is clicked through, and this action cannot be undone from the
      // UI.
      if (confirmation.trim().toLowerCase() !== before.email.toLowerCase()) {
        throw new Error('Type the account’s e-mail address exactly to confirm the deletion.')
      }

      const deletedAt = new Date()

      await tx
        .update(users)
        .set({
          deletedAt,
          // Pseudonymised, not blanked: the row has to stay unique and has to
          // stay joinable from orders, so the id survives and the personal
          // data does not.
          email: `deleted+${userId}@invalid.local`,
          name: null,
          phone: null,
          phoneNormalized: null,
          country: null,
          image: null,
          twoFactorEnabled: false,
          twoFactorSecret: null,
        })
        .where(eq(users.id, userId))

      await tx.delete(sessions).where(eq(sessions.userId, userId))
      await clearAllVerifications(userId, tx)

      await writeAudit(
        {
          actor: session,
          action: 'user.delete',
          entityType: 'user',
          entityId: userId,
          before: {
            email: before.email,
            name: before.name,
            phone: before.phone,
            country: before.country,
            role: before.role,
            deletedAt: null,
          },
          after: {
            email: `deleted+${userId}@invalid.local`,
            name: null,
            phone: null,
            country: null,
            role: before.role,
            deletedAt: deletedAt.toISOString(),
            reason,
            ordersPreserved: true,
          },
        },
        tx,
      )
    })

    outcome = {
      ok: 'Account erased and signed out everywhere. Order history is preserved — it is a financial record, not consent-based data.',
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(userId), outcome))
}

/** Reverse a soft delete. The personal columns are gone for good. */
export async function restoreCustomer(userId: string): Promise<void> {
  const session = await requireCapability('customers.export')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!before) throw new Error('That account no longer exists')
      if (before.deletedAt === null) throw new Error('That account is not deleted')

      await tx.update(users).set({ deletedAt: null }).where(eq(users.id, userId))

      await writeAudit(
        {
          actor: session,
          action: 'user.restore',
          entityType: 'user',
          entityId: userId,
          before: { deletedAt: before.deletedAt.toISOString() },
          after: { deletedAt: null },
        },
        tx,
      )
    })

    outcome = {
      ok: 'Account restored. Its name, phone and e-mail were pseudonymised on deletion and cannot be recovered — the customer must set them again.',
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(userId), outcome))
}

/**
 * تعديل بيانات العميل من لوحة التحكم (الوثيقة: "تحديث بيانات المستخدم").
 * للمدير فقط. تغيير البريد يتحقق من عدم تكراره، ويُنهي الجلسات لأن البريد هو
 * هوية الدخول.
 */
export async function updateCustomerProfile(userId: string, form: FormData): Promise<void> {
  const session = await requireCapability('roles.write')
  let outcome: Outcome

  try {
    const name = (fstr(form, 'name') ?? '').trim().slice(0, 128)
    let email = freq(form, 'email', 'Email').trim().toLowerCase()
    const phoneRaw = (fstr(form, 'phone') ?? '').trim()
    const countryRaw = (fstr(form, 'country') ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 256) {
      throw new Error('Enter a valid e-mail address.')
    }
    if (phoneRaw !== '' && !/^[+0-9][0-9 ()./-]{4,31}$/.test(phoneRaw)) {
      throw new Error('Enter the phone in international format, e.g. +971 50 123 4567.')
    }
    if (countryRaw !== '' && !/^[A-Za-z]{2}$/.test(countryRaw)) {
      throw new Error('Country must be a two-letter code, e.g. AE.')
    }

    const revoked = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!before) throw new Error('That account no longer exists')

      // Phone-only accounts carry a reserved placeholder address that follows
      // the number. Staff may replace it with a real e-mail, never invent one.
      const phoneForPlaceholder = normalizePhone(phoneRaw)
      if (isPlaceholderEmail(email)) {
        if (!isPlaceholderEmail(before.email) || email !== before.email.toLowerCase()) {
          throw new Error('That e-mail domain is reserved for phone-only accounts.')
        }
        if (phoneForPlaceholder === null) {
          throw new Error(
            'This account signs in with its mobile number only — add a real e-mail before removing the number.',
          )
        }
        email = placeholderEmailFor(phoneForPlaceholder)
      }

      if (email !== before.email) {
        const [taken] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(sql`lower(${users.email}) = ${email}`, ne(users.id, userId)))
          .limit(1)
        if (taken) throw new Error('Another account already uses that e-mail.')
      }

      const phoneNormalized = normalizePhone(phoneRaw)
      if (phoneNormalized !== null) {
        const [owner] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.phoneNormalized, phoneNormalized), ne(users.id, userId)))
          .limit(1)
        if (owner) throw new Error('Another account already uses that mobile number.')
      }
      const next = {
        name: name === '' ? null : name,
        email,
        phone: phoneRaw === '' ? null : phoneRaw,
        phoneNormalized,
        // رقم جديد = غير مُتحقق منه بعد.
        ...(phoneNormalized !== before.phoneNormalized ? { phoneVerifiedAt: null } : {}),
        country: countryRaw === '' ? null : countryRaw.toUpperCase(),
      }
      await tx.update(users).set(next).where(eq(users.id, userId))

      let killed = 0
      if (email !== before.email) {
        const rows = await tx
          .delete(sessions)
          .where(eq(sessions.userId, userId))
          .returning({ id: sessions.id })
        killed = rows.length
        await clearAllVerifications(userId, tx)
      }

      await writeAudit(
        {
          actor: session,
          action: 'user.profile',
          entityType: 'user',
          entityId: userId,
          before: {
            name: before.name,
            email: before.email,
            phone: before.phone,
            country: before.country,
          },
          after: { ...next, sessionsRevoked: killed },
        },
        tx,
      )
      return killed
    })

    outcome = {
      ok:
        revoked > 0
          ? `Profile updated. E-mail changed, so ${revoked} session(s) were signed out.`
          : 'Profile updated.',
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(userId), outcome))
}

/**
 * تفعيل/تعطيل الحساب (الوثيقة: "تفعيل/تعطيل الحساب"، "تفعيل الحساب عند مراجعة
 * الإدارة"). مختلف عن الحظر: لا مدة ولا سبب أمني — إيقاف إداري يُرفع يدوياً.
 * التعطيل يُنهي كل الجلسات فوراً.
 */
export async function setAccountActive(userId: string, form: FormData): Promise<void> {
  const session = await requireCapability('security.write')
  let outcome: Outcome
  try {
    const active = fstr(form, 'active') === 'true'
    if (!active && userId === session.userId) throw new Error('You cannot deactivate yourself.')
    const killed = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!before) throw new Error('That account no longer exists')
      if (before.status === 'banned') {
        throw new Error('This account is banned. Lift the ban from the Protection panel instead.')
      }
      // إعادة التفعيل ترفع أيضاً "التعليق لحين المراجعة" (suspended) وتمسح سببه.
      await tx
        .update(users)
        .set(
          active
            ? { status: 'active', banReason: null, bannedUntil: null }
            : { status: 'inactive' },
        )
        .where(eq(users.id, userId))
      let ended = 0
      if (!active) {
        const rows = await tx
          .delete(sessions)
          .where(eq(sessions.userId, userId))
          .returning({ id: sessions.id })
        ended = rows.length
        await clearAllVerifications(userId, tx)
      }
      await writeAudit(
        {
          actor: session,
          action: active
            ? before.status === 'suspended'
              ? 'user.unsuspend'
              : 'user.activate'
            : 'user.deactivate',
          entityType: 'user',
          entityId: userId,
          before: { status: before.status },
          after: { status: active ? 'active' : 'inactive', sessionsEnded: ended },
        },
        tx,
      )
      return ended
    })
    if (active) {
      await logActivity({
        action: 'unbanned',
        userId,
        details: { by: session.userId, reason: 'reactivated by admin' },
      })
    }
    outcome = {
      ok: active
        ? 'Account activated.'
        : `Account deactivated. ${killed} session(s) ended; it cannot sign in until reactivated.`,
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(userId), outcome))
}

/**
 * "تغيير الباقة" (الوثيقة 21.2): منح باقة يدوياً بلا طلب — نفس ما يمنحه الشراء
 * (النوع، حد الأجهزة، المدة ← تاريخ الانتهاء، والباقة)، ومعه `grantedByActorId`
 * كي يبقى "من منح هذا الحساب الباقة" قابلاً للإجابة. "استبدال" يسحب أولاً صلاحيات
 * الباقات الحيّة الحالية (ونسخ أفراد العائلة منها). مسجَّل في التدقيق.
 */
export async function grantPlanToCustomer(userId: string, form: FormData): Promise<void> {
  const session = await requireCapability('entitlements.grant')
  let outcome: Outcome
  try {
    const planId = fuuid(form, 'planId', 'Plan')
    const replace = fbool(form, 'replace')
    const reason = fstr(form, 'reason')?.slice(0, 500) ?? null

    const summary = await db.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: users.id, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      if (!account) throw new Error('That account no longer exists')
      if (account.deletedAt) throw new Error('This account has been erased.')

      const [plan] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, planId), isNull(plans.deletedAt)))
        .limit(1)
      if (!plan) throw new Error('That plan no longer exists')
      if (!isEntitlementKind(plan.entitlementKind)) {
        throw new Error(`Plan has an unknown access kind "${plan.entitlementKind}".`)
      }

      const now = new Date()
      let revoked: string[] = []
      if (replace) {
        const rows = await tx
          .update(entitlements)
          .set({
            revokedAt: now,
            revokedReason: `replaced by plan ${plan.slug} (${session.email})`,
          })
          .where(
            and(
              eq(entitlements.userId, userId),
              isNotNull(entitlements.planId),
              // A family seat shared by someone else belongs to that owner's
              // plan; replacing this customer's own plan must not take it away.
              isNull(entitlements.sharedByUserId),
              isNull(entitlements.revokedAt),
              or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
            ),
          )
          .returning({ id: entitlements.id })
        revoked = rows.map((row) => row.id)
        for (const id of revoked) {
          await revokeFamilyMembersOf(tx, id, `owner plan replaced by ${session.email}`)
        }
      }

      const [row] = await tx
        .insert(entitlements)
        .values({
          userId,
          kind: plan.entitlementKind,
          planId: plan.id,
          deviceLimit: plan.deviceLimit,
          grantedByActorId: session.userId,
          grantedByOrderId: null,
          startsAt: now,
          expiresAt: planExpiry(plan.durationDays, now),
        })
        .returning()

      await writeAudit(
        {
          actor: session,
          action: 'entitlement.grant_plan',
          entityType: 'user',
          entityId: userId,
          before: replace ? { revokedEntitlementIds: revoked } : null,
          after: { ...row, plan: plan.slug, reason },
        },
        tx,
      )
      return { slug: plan.slug, revoked: revoked.length }
    })

    outcome = {
      ok:
        `Granted plan ${summary.slug}.` +
        (summary.revoked > 0 ? ` ${summary.revoked} previous plan grant(s) revoked.` : ''),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(userId), outcome))
}
