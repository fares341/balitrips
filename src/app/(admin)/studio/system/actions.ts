'use server'

import { eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { errorEvents } from '@/db/schema'
import { deleteDeadLetter, retryDeadLetter, retryFailedJob } from '@/lib/monitoring/jobs'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fstr, fuuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/** Studio → System health actions (Phase 6). Admin only, audited. */

type Outcome = { ok: string } | { err: string }

const PAGE = adminHref('/system')

const QUEUE = /^[a-z][a-z0-9.-]{1,60}$/

export async function resolveError(form: FormData): Promise<void> {
  const session = await requireCapability('system.read')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const id = fuuid(form, 'id', t('sys.error'))
    const [row] = await db
      .update(errorEvents)
      .set({ resolvedAt: new Date() })
      .where(eq(errorEvents.id, id))
      .returning({ id: errorEvents.id, count: errorEvents.count })
    if (!row) throw new Error(t('sys.err_gone'))
    await writeAudit({
      actor: session,
      action: 'system.error_resolve',
      entityType: 'error_event',
      entityId: id,
      before: null,
      after: { count: row.count },
    })
    outcome = { ok: t('sys.ok_resolved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${PAGE}#errors`, outcome))
}

export async function resolveAllErrors(): Promise<void> {
  const session = await requireCapability('system.read')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const rows = await db
      .update(errorEvents)
      .set({ resolvedAt: new Date() })
      .where(isNull(errorEvents.resolvedAt))
      .returning({ id: errorEvents.id })
    await writeAudit({
      actor: session,
      action: 'system.error_resolve_all',
      entityType: 'error_event',
      before: null,
      after: { count: rows.length },
    })
    outcome = { ok: t('sys.ok_resolved_all', { count: rows.length }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${PAGE}#errors`, outcome))
}

/** Background job actions: run a dead letter again, delete it, or retry a failed job. */
export async function jobAction(form: FormData): Promise<void> {
  const session = await requireCapability('system.read')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const queue = fstr(form, 'queue') ?? ''
    const id = fuuid(form, 'id', t('sys.job'))
    const kind = fstr(form, 'kind')
    if (!QUEUE.test(queue)) throw new Error(t('sys.err_gone'))
    let done = false
    if (kind === 'retry_dead') done = await retryDeadLetter(queue, id)
    else if (kind === 'delete_dead') done = await deleteDeadLetter(queue, id)
    else if (kind === 'retry_failed') done = await retryFailedJob(queue, id)
    if (!done) throw new Error(t('sys.err_gone'))
    await writeAudit({
      actor: session,
      action: `system.job_${kind}`,
      entityType: 'job',
      entityId: id,
      before: null,
      after: { queue },
    })
    outcome = { ok: t(`sys.ok_${kind}`) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${PAGE}#jobs`, outcome))
}
