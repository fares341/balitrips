'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { isStudioRole } from '@/lib/auth/roles'
import { db } from '@/db'
import { customTripRequests, users } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fuuidOrNull, isUuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/** Phase 4: the staff member in charge of a custom-trip request. `crm.write`. */
export async function assignLead(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    if (!isUuid(id)) throw new Error(t('leads.err_no_request'))
    const assignedToUserId = fuuidOrNull(form, 'assignedToUserId', t('crm.assigned'))
    if (assignedToUserId !== null) {
      const [staff] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, assignedToUserId))
        .limit(1)
      if (!staff || !isStudioRole(staff.role)) throw new Error(t('crm.err_assignee'))
    }
    const [before] = await db
      .select({ assignedToUserId: customTripRequests.assignedToUserId })
      .from(customTripRequests)
      .where(eq(customTripRequests.id, id))
      .limit(1)
    if (!before) throw new Error(t('leads.err_no_request'))
    await db
      .update(customTripRequests)
      .set({ assignedToUserId })
      .where(eq(customTripRequests.id, id))
    await writeAudit({
      actor: session,
      action: 'custom_trip_request.assign',
      entityType: 'custom_trip_request',
      entityId: id,
      before,
      after: { assignedToUserId },
    })
    outcome = { ok: t('crm.ok_care') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(adminHref(`/leads/${id}`), outcome))
}
