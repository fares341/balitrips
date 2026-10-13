'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { sessions, users } from '@/db/schema'
import { generateRecoveryCodes, generateSecret, sealSecret } from '@/lib/auth/totp'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { freq } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, localizeMessage, withOutcome } from '../../_lib/result'
import { requireElevated } from '../../_lib/session'
import {
  CHALLENGE_LOCK_MINUTES,
  clearChallengeFailures,
  consumeRecoveryCode,
  markSessionVerified,
  MAX_CHALLENGE_FAILURES,
  readSecret,
  reserveChallengeAttempt,
  storeRecoveryCodes,
  twoFactorStatus,
  verifyCodeOnce,
} from '../../_lib/two-factor'

/**
 * Enrolment and challenge.
 *
 * Every action here is gated on `requireElevated()` and NOT on
 * `requireCapability()`, which is the one deliberate exception in the admin:
 * `requireCapability()` enforces the second factor, and these are the actions
 * that let someone provide it. Gating them on it would lock every elevated
 * account out of the only screen that can unlock it.
 *
 * The exception is safe because each action is scoped to the caller's OWN
 * account — the user id comes from the session, never from the form — and
 * because it can only ever add a factor, never remove one. Resetting somebody
 * else's second factor is a different action, on the customers screen, behind
 * `roles.write`.
 */

const SECURITY = adminHref('/security')

export interface EnrolmentResult {
  ok: boolean
  message: string
  /**
   * Shown exactly once, in the response that created them. They are never
   * persisted in plain text and never travel in a URL, so there is nowhere
   * to retrieve them from afterwards.
   */
  codes?: string[]
}

/**
 * Start enrolment: mint a secret and park it, still disabled.
 *
 * `two_factor_enabled` stays false until a code proves the secret actually
 * reached an authenticator. Flipping it here would lock the account out of
 * its own admin the moment the operator closed the tab.
 */
export async function beginEnrolment(): Promise<void> {
  const session = await requireElevated()
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    const status = await twoFactorStatus(session.userId)
    if (status.enabled) throw new Error(t('security.err_already_active_account'))

    const secret = generateSecret()

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ twoFactorSecret: sealSecret(secret), twoFactorEnabled: false })
        .where(eq(users.id, session.userId))

      await writeAudit(
        {
          actor: session,
          action: 'two_factor.enrol_start',
          entityType: 'user',
          entityId: session.userId,
          // The secret itself is never written to the audit log: the log is
          // readable by every role with audit.read, and that would hand them
          // a working second factor for somebody else's account.
          before: { twoFactorEnabled: status.enabled, hasSecret: status.pending },
          after: { twoFactorEnabled: false, hasSecret: true },
        },
        tx,
      )
    })

    outcome = { ok: t('security.ok_scan') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(SECURITY, outcome))
}

/**
 * Confirm the pending secret, switch it on, and issue recovery codes.
 *
 * Returns rather than redirects, because the recovery codes exist only in
 * this response — a redirect would either lose them or have to carry them in
 * a query string, which lands them in the proxy's access log.
 */
export async function confirmEnrolment(
  _previous: EnrolmentResult | null,
  form: FormData,
): Promise<EnrolmentResult> {
  try {
    const session = await requireElevated()
    const { t } = await getAdminI18n()
    const status = await twoFactorStatus(session.userId)

    if (status.enabled) return { ok: false, message: t('security.err_already_active') }

    const secret = await readSecret(session.userId)
    if (secret === null) {
      return { ok: false, message: t('security.err_no_pending') }
    }

    const code = freq(form, 'code', t('security.code'))
    const verified = await verifyCodeOnce(session.userId, secret, code)
    if (!verified.ok) return { ok: false, message: t(verified.reason) }

    const codes = generateRecoveryCodes()

    await db.transaction(async (tx) => {
      await tx.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, session.userId))
      await storeRecoveryCodes(session.userId, codes, tx)

      await writeAudit(
        {
          actor: session,
          action: 'two_factor.enable',
          entityType: 'user',
          entityId: session.userId,
          before: { twoFactorEnabled: false, recoveryCodes: status.recoveryCodesRemaining },
          after: { twoFactorEnabled: true, recoveryCodes: codes.length },
        },
        tx,
      )
    })

    // The session that just proved the factor should not immediately be
    // challenged for it.
    await markSessionVerified(session.sessionId, session.userId)

    return {
      ok: true,
      message: t('security.ok_enabled'),
      codes,
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    // These forms render the message directly, not through <Flash>.
    return { ok: false, message: localizeMessage(errorMessage(error), (await getAdminI18n()).t) }
  }
}

/**
 * Answer the challenge for this session.
 *
 * Accepts either a TOTP code or one recovery code. A spent recovery code is
 * removed, and using one is audited loudly: it means somebody lost a phone,
 * and it is also what an attacker who obtained a printed code would do.
 */
export async function answerChallenge(form: FormData): Promise<void> {
  const session = await requireElevated()
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    const secret = await readSecret(session.userId)
    const status = await twoFactorStatus(session.userId)
    if (secret === null || !status.enabled) {
      throw new Error(t('security.err_not_set_up'))
    }

    const submitted = freq(form, 'code', t('security.code'))
    const looksLikeRecovery = /[A-Za-z]/.test(submitted)

    // المحاولة تُحجز (تُعدّ) قبل فحص الرمز، تحت قفل: طلبات متوازية كانت تمر
    // كلها من فحص "مقفل؟" قبل أن يُسجَّل أي خطأ. النجاح يصفّر العدّاد.
    const attempt = await reserveChallengeAttempt(session.userId)
    if (attempt > MAX_CHALLENGE_FAILURES) {
      throw new Error(t('security.err_locked', { minutes: CHALLENGE_LOCK_MINUTES }))
    }

    // رمز خاطئ: عند بلوغ الحد تُنهى هذه الجلسة ويُسجَّل القفل.
    const failed = async (message: string): Promise<never> => {
      if (attempt >= MAX_CHALLENGE_FAILURES) {
        await db.delete(sessions).where(eq(sessions.id, session.sessionId))
        await writeAudit({
          actor: session,
          action: 'two_factor.locked',
          entityType: 'user',
          entityId: session.userId,
          before: null,
          after: { failures: attempt, lockMinutes: CHALLENGE_LOCK_MINUTES },
        })
      }
      throw new Error(message)
    }

    if (looksLikeRecovery) {
      const accepted = await consumeRecoveryCode(session.userId, submitted)
      if (!accepted) {
        await failed(t('security.err_bad_recovery'))
      }

      await writeAudit({
        actor: session,
        action: 'two_factor.recovery_used',
        entityType: 'user',
        entityId: session.userId,
        before: { recoveryCodesRemaining: status.recoveryCodesRemaining },
        after: { recoveryCodesRemaining: status.recoveryCodesRemaining - 1 },
      })
    } else {
      const verified = await verifyCodeOnce(session.userId, secret, submitted)
      if (!verified.ok) await failed(t(verified.reason))
    }

    await clearChallengeFailures(session.userId)
    await markSessionVerified(session.sessionId, session.userId)

    await writeAudit({
      actor: session,
      action: 'two_factor.challenge_pass',
      entityType: 'session',
      entityId: null,
      before: null,
      after: { sessionId: session.sessionId, method: looksLikeRecovery ? 'recovery' : 'totp' },
    })
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
    redirect(withOutcome(SECURITY, outcome))
  }

  redirect(withOutcome(adminHref(''), { ok: t('security.ok_session_verified') }))
}

/** Replace the recovery codes. The previous set stops working immediately. */
export async function regenerateRecoveryCodes(
  _previous: EnrolmentResult | null,
  form: FormData,
): Promise<EnrolmentResult> {
  try {
    const session = await requireElevated()
    const { t } = await getAdminI18n()
    const status = await twoFactorStatus(session.userId)
    if (!status.enabled) return { ok: false, message: t('security.err_finish_setup') }

    const secret = await readSecret(session.userId)
    if (secret === null) return { ok: false, message: t('security.err_no_secret') }

    // Re-proving possession of the authenticator matters here: an attacker
    // sitting on a hijacked session would otherwise mint themselves a set of
    // permanent bypass codes.
    const verified = await verifyCodeOnce(
      session.userId,
      secret,
      freq(form, 'code', t('security.code')),
    )
    if (!verified.ok) return { ok: false, message: t(verified.reason) }

    const codes = generateRecoveryCodes()

    await db.transaction(async (tx) => {
      await storeRecoveryCodes(session.userId, codes, tx)
      await writeAudit(
        {
          actor: session,
          action: 'two_factor.recovery_regenerate',
          entityType: 'user',
          entityId: session.userId,
          before: { recoveryCodes: status.recoveryCodesRemaining },
          after: { recoveryCodes: codes.length },
        },
        tx,
      )
    })

    return {
      ok: true,
      message: t('security.ok_regenerated'),
      codes,
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    // These forms render the message directly, not through <Flash>.
    return { ok: false, message: localizeMessage(errorMessage(error), (await getAdminI18n()).t) }
  }
}
