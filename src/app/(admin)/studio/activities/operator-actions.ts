'use server'

/**
 * «المشغّل» — the operator who runs an activity, its contract and the AI
 * contract summary (owner, Oct 2026). Staff only: opening the editor needs
 * `content.write`, and everything here also needs `prices.write` (the contract
 * carries net prices and commissions — not for a content editor).
 */

import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { activities, activityOperators } from '@/db/schema'
import { readSetting } from '@/app/(admin)/_lib/settings'
import { baseUrl, hasApiKey, modelsFor } from '@/lib/assistant/config'
import { streamCompletion } from '@/lib/assistant/openrouter'
import { can } from '@/lib/auth/roles'
import { extractPdfText } from '@/lib/contracts/pdf-text'
import {
  ContractStorageMissing,
  isPdf,
  MAX_CONTRACT_BYTES,
  readContract,
  storeContract,
} from '@/lib/contracts/storage'
import { parseSummary, summaryPrompt } from '@/lib/contracts/summary'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fstr } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability, type AdminSession } from '../../_lib/session'

const page = (id: string) => adminHref(`/activities/${id}?tab=operator`)

async function gate(): Promise<AdminSession> {
  const session = await requireCapability('content.write')
  if (!can(session.role, 'prices.write')) {
    const { t } = await getAdminI18n()
    throw new Error(t('oo.op_err_role'))
  }
  return session
}

async function run(id: string, work: () => Promise<string>): Promise<void> {
  let outcome: ActionOutcome
  try {
    outcome = { ok: await work() }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(page(id), outcome))
}

async function ensureActivity(id: string): Promise<void> {
  const [row] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.id, id))
    .limit(1)
  if (!row) throw new Error('Activity not found')
}

function text(form: FormData, name: string, max: number): string {
  return (fstr(form, name) ?? '').trim().slice(0, max)
}

export async function saveOperator(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  await run(id, async () => {
    if (!can(session.role, 'prices.write')) throw new Error(t('oo.op_err_role'))
    await ensureActivity(id)
    const values = {
      name: text(form, 'opName', 200),
      contactPerson: text(form, 'opContact', 200),
      phone: text(form, 'opPhone', 40),
      email: text(form, 'opEmail', 200),
      commissionNotes: text(form, 'opCommission', 4000),
      cancellationTerms: text(form, 'opCancellation', 4000),
      updatedAt: new Date(),
    }
    if (values.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      throw new Error(t('oo.op_err_email'))
    }
    await db
      .insert(activityOperators)
      .values({ activityId: id, ...values })
      .onConflictDoUpdate({ target: activityOperators.activityId, set: values })
    await writeAudit({
      actor: session,
      action: 'activity.operator_save',
      entityType: 'activity',
      entityId: id,
      before: null,
      after: { name: values.name },
    })
    return t('oo.op_ok_saved')
  })
}

export async function uploadContract(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  await run(id, async () => {
    if (!can(session.role, 'prices.write')) throw new Error(t('oo.op_err_role'))
    await ensureActivity(id)
    const file = form.get('contract')
    if (!(file instanceof File) || file.size === 0) throw new Error(t('oo.op_err_choose'))
    if (file.size > MAX_CONTRACT_BYTES) throw new Error(t('oo.op_err_large'))
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isPdf(bytes)) throw new Error(t('oo.op_err_pdf'))
    const key = `contracts/${id}/${randomUUID()}.pdf`
    try {
      await storeContract(key, bytes)
    } catch (error) {
      if (error instanceof ContractStorageMissing) throw new Error(t('oo.op_err_storage'))
      throw error
    }
    const filename = (file.name || 'contract.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 200)
    const values = {
      contractKey: key,
      contractFilename: filename,
      contractBytes: bytes.byteLength,
      contractUploadedAt: new Date(),
      contractUploadedBy: session.userId,
      // A new contract: the old summary no longer describes it.
      contractSummary: null,
      summaryModel: null,
      summaryAt: null,
      updatedAt: new Date(),
    }
    await db
      .insert(activityOperators)
      .values({ activityId: id, ...values })
      .onConflictDoUpdate({ target: activityOperators.activityId, set: values })
    await writeAudit({
      actor: session,
      action: 'activity.contract_upload',
      entityType: 'activity',
      entityId: id,
      before: null,
      after: { filename, bytes: bytes.byteLength },
    })
    return t('oo.op_ok_uploaded')
  })
}

export async function removeContract(id: string): Promise<void> {
  const session = await gate()
  const { t } = await getAdminI18n()
  await run(id, async () => {
    await db
      .update(activityOperators)
      .set({
        contractKey: null,
        contractFilename: null,
        contractBytes: null,
        contractUploadedAt: null,
        contractUploadedBy: null,
        contractSummary: null,
        summaryModel: null,
        summaryAt: null,
        updatedAt: new Date(),
      })
      .where(eq(activityOperators.activityId, id))
    await writeAudit({
      actor: session,
      action: 'activity.contract_remove',
      entityType: 'activity',
      entityId: id,
      before: null,
      after: null,
    })
    return t('oo.op_ok_removed')
  })
}

/** «تلخيص العقد»: PDF text → OpenRouter → a structured Arabic summary. */
export async function summarizeContract(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  await run(id, async () => {
    if (!can(session.role, 'prices.write')) throw new Error(t('oo.op_err_role'))
    if (!hasApiKey()) throw new Error(t('oo.op_err_no_ai'))
    const [operator] = await db
      .select({ key: activityOperators.contractKey })
      .from(activityOperators)
      .where(eq(activityOperators.activityId, id))
      .limit(1)
    if (!operator?.key) throw new Error(t('oo.op_err_no_contract'))
    const bytes = await readContract(operator.key)
    if (!bytes) throw new Error(t('oo.op_err_read'))
    let contractText = ''
    try {
      contractText = await extractPdfText(bytes)
    } catch (error) {
      console.error('[contracts] PDF text extraction failed', { activityId: id, error })
      throw new Error(t('oo.op_err_read'))
    }
    if (contractText.replace(/\s/g, '').length < 40) throw new Error(t('oo.op_err_scanned'))

    const settings = await readSetting('assistant')
    const models = modelsFor(settings)
    const prompt = summaryPrompt(contractText)
    const result = await streamCompletion({
      apiKey: (process.env.OPENROUTER_API_KEY ?? '').trim(),
      baseUrl: baseUrl(),
      models,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      maxTokens: 1800,
    })
    if (!result.ok) throw new Error(t('oo.op_err_ai', { code: result.error ?? 'provider' }))
    const summary = parseSummary(result.acc.text)
    if (!summary) throw new Error(t('oo.op_err_ai', { code: 'format' }))
    await db
      .update(activityOperators)
      .set({
        contractSummary: summary,
        summaryModel: models[0].slice(0, 120),
        summaryAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(activityOperators.activityId, id))
    await writeAudit({
      actor: session,
      action: 'activity.contract_summary',
      entityType: 'activity',
      entityId: id,
      before: null,
      after: { model: models[0] },
    })
    return t('oo.op_ok_summary')
  })
}
