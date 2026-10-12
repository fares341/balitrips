'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { contactMessages, customTripRequests } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fenum } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { CONTACT_STATUSES, TRIP_STATUSES } from '../../_lib/lead-statuses'
import { requireCapability } from '../../_lib/session'
import { notifyRequestStatus } from './notify'

const LIST = adminHref('/leads')

type Outcome = { ok: string } | { err: string }

/**
 * Move a custom trip request along the pipeline.
 *
 * The prototype captured none of this — the custom-trip form collected
 * dates, travellers, budget and interests and threw all of it away, so a
 * high-intent lead left no record at all.
 */
export async function setTripRequestStatus(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('leads.read')
  let outcome: Outcome

  try {
    const status = fenum(form, 'status', TRIP_STATUSES, 'new')

    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(customTripRequests)
        .where(eq(customTripRequests.id, id))
        .limit(1)

      if (!before) throw new Error('That request no longer exists')

      const [after] = await tx
        .update(customTripRequests)
        .set({ status })
        .where(eq(customTripRequests.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: 'custom_trip_request.status',
          entityType: 'custom_trip_request',
          entityId: id,
          before: { status: before.status },
          after: { status: after?.status ?? status },
        },
        tx,
      )
    })

    await notifyRequestStatus(id, status)
    outcome = { ok: `Request marked ${status}.` }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function setContactMessageStatus(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('leads.read')
  let outcome: Outcome

  try {
    const status = fenum(form, 'status', CONTACT_STATUSES, 'new')

    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(contactMessages)
        .where(eq(contactMessages.id, id))
        .limit(1)

      if (!before) throw new Error('That message no longer exists')

      const [after] = await tx
        .update(contactMessages)
        .set({ status })
        .where(eq(contactMessages.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: 'contact_message.status',
          entityType: 'contact_message',
          entityId: id,
          before: { status: before.status },
          after: { status: after?.status ?? status },
        },
        tx,
      )
    })

    outcome = { ok: `Message marked ${status}.` }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(`${LIST}?tab=contact`, outcome))
}
