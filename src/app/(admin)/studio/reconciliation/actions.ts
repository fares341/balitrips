'use server'

import { redirect } from 'next/navigation'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { getAdminI18n } from '../../_lib/i18n'
import { withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const PAGE = adminHref('/reconciliation')

/** Ask the worker to run the payment check now instead of waiting for the next sweep. */
export async function runReconcileNow(): Promise<void> {
  const session = await requireCapability('finance.read')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    const { enqueueReconcile } = await import('@/worker/queues')
    await enqueueReconcile({})
    await writeAudit({
      actor: session,
      action: 'reconcile.run_now',
      entityType: 'order',
      entityId: null,
      before: null,
      after: { requested: true },
    })
    outcome = { ok: t('recon.ok_queued') }
  } catch (error) {
    console.error('[reconciliation] could not queue the check', error)
    outcome = { err: t('recon.err_queue') }
  }
  redirect(withOutcome(PAGE, outcome))
}
