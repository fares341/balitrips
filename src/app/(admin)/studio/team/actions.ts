'use server'

import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { sessions, users } from '@/db/schema'
import { getPathname } from '@/i18n/routing'
import { canAssignRole, isRole, TEAM_ROLES, type Role } from '@/lib/auth/roles'
import { auth } from '@/lib/auth/server'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit, type Tx } from '../../_lib/audit'
import { fstr, fuuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability, type AdminSession } from '../../_lib/session'
import { clearAllVerifications } from '../../_lib/two-factor'
import type { Translate } from '../../_i18n'

/**
 * Studio → Team & permissions (Phase 6).
 *
 * Every action here:
 *  - needs `users.manage` (admin only) — checked first, on the server;
 *  - refuses escalation: the actor must already hold every capability of
 *    both the account's current role and the new one (`canAssignRole`);
 *  - never acts on the actor's own account (no self-demotion, no self-lockout);
 *  - never leaves the system without an active admin;
 *  - ends the account's sessions on any change, so the new role (or the
 *    deactivation) applies on the next request rather than when a cookie
 *    cache expires — and clears its two-factor markers;
 *  - writes an audit row in the same transaction.
 */

type Outcome = { ok: string } | { err: string }

const PAGE = adminHref('/team')

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Lock the admin set, then count active admins other than `exceptId`. */
async function otherActiveAdmins(tx: Tx, exceptId: string): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('team:admins'))`)
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.role, 'admin'),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        ne(users.id, exceptId),
      ),
    )
  return row?.n ?? 0
}

async function endSessions(tx: Tx, userId: string): Promise<number> {
  const killed = await tx
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id })
  await clearAllVerifications(userId, tx)
  return killed.length
}

function roleFrom(form: FormData, t: Translate): Role {
  const value = fstr(form, 'role') ?? ''
  if (!isRole(value)) throw new Error(t('team.err_role'))
  return value
}

async function loadTarget(tx: Tx, userId: string, session: AdminSession, t: Translate) {
  if (userId === session.userId) throw new Error(t('team.err_self'))
  const [row] = await tx
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for('update')
  if (!row || row.deletedAt !== null) throw new Error(t('team.err_gone'))
  if (!isRole(row.role) || !canAssignRole(session.role, row.role)) {
    throw new Error(t('team.err_escalation'))
  }
  return { ...row, role: row.role as Role }
}

/** Ask Better Auth for a "set your password" link (the reset e-mail). */
async function sendPasswordLink(email: string): Promise<boolean> {
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: getPathname({ href: '/reset-password', locale: 'ar' }) },
      headers: await headers(),
    })
    return true
  } catch (error) {
    console.error('[team] could not send the password link', error)
    return false
  }
}

/**
 * Add someone to the team. An existing customer account with that e-mail is
 * given the role (they keep their password and history); otherwise a new
 * account is created with no password, and Better Auth's reset e-mail lets
 * the person choose one. Two-factor setup is required at their first Studio
 * visit, as for everyone on the team.
 */
export async function inviteMember(form: FormData): Promise<void> {
  const session = await requireCapability('users.manage')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const email = (fstr(form, 'email') ?? '').trim().toLowerCase()
    if (!EMAIL.test(email) || email.length > 256) throw new Error(t('team.err_email'))
    const name = (fstr(form, 'name') ?? '').trim().slice(0, 128) || null
    const role = roleFrom(form, t)
    if (!(TEAM_ROLES as readonly string[]).includes(role)) throw new Error(t('team.err_role'))
    if (!canAssignRole(session.role, role)) throw new Error(t('team.err_escalation'))

    const created = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: users.id, role: users.role, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
        .for('update')
      if (existing && existing.deletedAt !== null) throw new Error(t('team.err_deleted'))
      if (existing && existing.role !== 'customer') throw new Error(t('team.err_already'))

      if (existing) {
        await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, existing.id))
        const revoked = await endSessions(tx, existing.id)
        await writeAudit(
          {
            actor: session,
            action: 'team.add_existing',
            entityType: 'user',
            entityId: existing.id,
            before: { role: existing.role, email },
            after: { role, email, sessionsRevoked: revoked },
          },
          tx,
        )
        return false
      }

      const [row] = await tx
        .insert(users)
        .values({ email, name, role, locale: 'ar', status: 'active' })
        .returning({ id: users.id })
      if (!row) throw new Error(t('team.err_gone'))
      await writeAudit(
        {
          actor: session,
          action: 'team.invite',
          entityType: 'user',
          entityId: row.id,
          before: null,
          after: { role, email, name },
        },
        tx,
      )
      return true
    })

    if (created) {
      const sent = await sendPasswordLink(email)
      outcome = {
        ok: sent ? t('team.ok_invited', { email }) : t('team.ok_invited_no_mail', { email }),
      }
    } else {
      outcome = { ok: t('team.ok_added_existing', { email, role: t(`shell.role_${role}`) }) }
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}

export async function changeMemberRole(form: FormData): Promise<void> {
  const session = await requireCapability('users.manage')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const userId = fuuid(form, 'userId', t('team.member'))
    const role = roleFrom(form, t)
    if (!canAssignRole(session.role, role)) throw new Error(t('team.err_escalation'))

    const revoked = await db.transaction(async (tx) => {
      const target = await loadTarget(tx, userId, session, t)
      if (target.role === role) throw new Error(t('team.err_same_role'))
      if (target.role === 'admin' && (await otherActiveAdmins(tx, target.id)) === 0) {
        throw new Error(t('team.err_last_admin'))
      }
      await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, target.id))
      const killed = await endSessions(tx, target.id)
      await writeAudit(
        {
          actor: session,
          action: 'user.role',
          entityType: 'user',
          entityId: target.id,
          before: { role: target.role, email: target.email },
          after: { role, email: target.email, sessionsRevoked: killed },
        },
        tx,
      )
      return killed
    })
    outcome = { ok: t('team.ok_role', { role: t(`shell.role_${role}`), count: revoked }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}

/** Deactivate (sign-in refused, sessions ended) or reactivate a team account. */
export async function setMemberActive(form: FormData): Promise<void> {
  const session = await requireCapability('users.manage')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const userId = fuuid(form, 'userId', t('team.member'))
    const active = form.get('active') === 'true'

    await db.transaction(async (tx) => {
      const target = await loadTarget(tx, userId, session, t)
      if (!active && target.role === 'admin' && (await otherActiveAdmins(tx, target.id)) === 0) {
        throw new Error(t('team.err_last_admin'))
      }
      const status = active ? 'active' : 'inactive'
      if (target.status === status) return
      await tx
        .update(users)
        .set({
          status,
          ...(active ? { bannedUntil: null, banReason: null } : { banReason: 'team: deactivated' }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, target.id))
      const killed = active ? 0 : await endSessions(tx, target.id)
      await writeAudit(
        {
          actor: session,
          action: active ? 'team.reactivate' : 'team.deactivate',
          entityType: 'user',
          entityId: target.id,
          before: { status: target.status, email: target.email },
          after: { status, email: target.email, sessionsRevoked: killed },
        },
        tx,
      )
    })
    outcome = { ok: t(active ? 'team.ok_reactivated' : 'team.ok_deactivated') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}

/** Send the "set your password" e-mail again (an invitation link lasts an hour). */
export async function resendInvite(form: FormData): Promise<void> {
  const session = await requireCapability('users.manage')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const userId = fuuid(form, 'userId', t('team.member'))
    const target = await db.transaction((tx) => loadTarget(tx, userId, session, t))
    const sent = await sendPasswordLink(target.email)
    await writeAudit({
      actor: session,
      action: 'team.resend_invite',
      entityType: 'user',
      entityId: target.id,
      before: null,
      after: { email: target.email, sent },
    })
    outcome = sent
      ? { ok: t('team.ok_resent', { email: target.email }) }
      : { err: t('team.err_mail') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}
