'use server'

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { isStudioRole } from '@/lib/auth/roles'
import { db } from '@/db'
import { customerNotes, customerTags, users } from '@/db/schema'
import { isCrmStage, normalizeTag } from '@/lib/crm/stage'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { freq, fstr, fuuidOrNull, isUuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/**
 * Customer relationship (phase 4): notes, tags, stage, the staff member in
 * charge, and recording a customer's request to stop offers. `crm.write`
 * (staff and admin). Notes and tags are internal and never shown to the
 * customer or sent to any marketing tool.
 */

type Outcome = { ok: string } | { err: string }

const back = (userId: string) => adminHref(`/customers/${userId}`)

async function run(
  userId: string,
  work: (session: Awaited<ReturnType<typeof requireCapability>>) => Promise<string>,
): Promise<void> {
  const session = await requireCapability('crm.write')
  let outcome: Outcome
  try {
    if (!isUuid(userId)) throw new Error('Unknown customer')
    outcome = { ok: await work(session) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${back(userId)}#crm`, outcome))
}

async function customerExists(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  return row !== undefined
}

export async function addCustomerNote(userId: string, form: FormData): Promise<void> {
  const { t } = await getAdminI18n()
  await run(userId, async (session) => {
    const body = freq(form, 'body', t('crm.note')).slice(0, 4000)
    if (!(await customerExists(userId))) throw new Error(t('crm.err_gone'))
    const [row] = await db
      .insert(customerNotes)
      .values({ userId, authorId: session.userId, body })
      .returning({ id: customerNotes.id })
    await writeAudit({
      actor: session,
      action: 'customer.note_add',
      entityType: 'user',
      entityId: userId,
      before: null,
      after: { noteId: row?.id ?? null },
    })
    return t('crm.ok_note')
  })
}

export async function addCustomerTag(userId: string, form: FormData): Promise<void> {
  const { t } = await getAdminI18n()
  await run(userId, async (session) => {
    const tag = normalizeTag(fstr(form, 'tag') ?? '')
    if (tag === null) throw new Error(t('crm.err_tag'))
    if (!(await customerExists(userId))) throw new Error(t('crm.err_gone'))
    await db
      .insert(customerTags)
      .values({ userId, tag, createdBy: session.userId })
      .onConflictDoNothing({ target: [customerTags.userId, customerTags.tag] })
    await writeAudit({
      actor: session,
      action: 'customer.tag_add',
      entityType: 'user',
      entityId: userId,
      before: null,
      after: { tag },
    })
    return t('crm.ok_tag')
  })
}

export async function removeCustomerTag(userId: string, tag: string): Promise<void> {
  const { t } = await getAdminI18n()
  await run(userId, async (session) => {
    await db
      .delete(customerTags)
      .where(and(eq(customerTags.userId, userId), eq(customerTags.tag, tag)))
    await writeAudit({
      actor: session,
      action: 'customer.tag_remove',
      entityType: 'user',
      entityId: userId,
      before: { tag },
      after: null,
    })
    return t('crm.ok_tag_removed')
  })
}

export async function setCustomerCare(userId: string, form: FormData): Promise<void> {
  const { t } = await getAdminI18n()
  await run(userId, async (session) => {
    const assignedToUserId = fuuidOrNull(form, 'assignedToUserId', t('crm.assigned'))
    const rawStage = fstr(form, 'crmStage')
    const crmStage = rawStage !== null && isCrmStage(rawStage) ? rawStage : null
    if (assignedToUserId !== null) {
      const [staff] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, assignedToUserId))
        .limit(1)
      if (!staff || !isStudioRole(staff.role)) throw new Error(t('crm.err_assignee'))
    }
    const [before] = await db
      .select({ assignedToUserId: users.assignedToUserId, crmStage: users.crmStage })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!before) throw new Error(t('crm.err_gone'))
    await db.update(users).set({ assignedToUserId, crmStage }).where(eq(users.id, userId))
    await writeAudit({
      actor: session,
      action: 'customer.care_update',
      entityType: 'user',
      entityId: userId,
      before,
      after: { assignedToUserId, crmStage },
    })
    return t('crm.ok_care')
  })
}

/**
 * The customer asked (by phone, e-mail, in person) to stop receiving offers.
 * Staff may record a withdrawal; they can never record consent on someone's
 * behalf — that only comes from the customer's own tick.
 */
export async function withdrawMarketingConsent(userId: string): Promise<void> {
  const { t } = await getAdminI18n()
  await run(userId, async (session) => {
    await db
      .update(users)
      .set({
        marketingConsent: false,
        marketingConsentAt: new Date(),
        marketingConsentSource: 'staff_withdrawal',
      })
      .where(eq(users.id, userId))
    await writeAudit({
      actor: session,
      action: 'customer.consent_withdraw',
      entityType: 'user',
      entityId: userId,
      before: { marketingConsent: true },
      after: { marketingConsent: false },
    })
    return t('crm.ok_consent_withdrawn')
  })
}
