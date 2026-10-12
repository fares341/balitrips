'use server'

import { randomUUID } from 'node:crypto'

import { and, eq, isNull, max, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { customTripDocuments, customTripRequests, users } from '@/db/schema'
import { notifyUser } from '@/lib/notify'
import { isStorageConfigured, uploadPrivate } from '@/lib/storage'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fstr, fuuid } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/**
 * إدارة طلب الجدول المخصص: ملاحظات داخلية، ربط بحساب، رفع PDF، سحب نسخة.
 *
 * الرفع يذهب إلى التخزين الخاص بمفتاح لا يمكن تخمينه
 * (`custom-trips/<request>/<uuid>.pdf`). العميل لا يرى المفتاح أبداً: الملف
 * يُسلَّم مختوماً بالعلامة المائية عبر `/account/custom/[docId]/…`.
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024
const detail = (id: string) => adminHref(`/leads/${id}`)

async function run(back: string, body: () => Promise<string>): Promise<never> {
  let outcome: ActionOutcome
  try {
    outcome = { ok: await body() }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(back, outcome))
}

export async function saveRequestNotes(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  await run(detail(id), async () => {
    const adminNotes = fstr(form, 'adminNotes')?.slice(0, 5000) ?? null
    const [row] = await db
      .update(customTripRequests)
      .set({ adminNotes })
      .where(eq(customTripRequests.id, id))
      .returning({ id: customTripRequests.id })
    if (!row) throw new Error('That request no longer exists')
    await writeAudit({
      actor,
      action: 'custom_trip_request.notes',
      entityType: 'custom_trip_request',
      entityId: id,
      before: null,
      after: { length: adminNotes?.length ?? 0 },
    })
    return 'Notes saved.'
  })
}

/**
 * ربط طلب ضيف بحساب. بالبريد، مطابقة تامة (بأحرف صغيرة). صاحب البريد هو
 * صاحب الطلب: لا خطر في تسليم الملف لصاحب العنوان الذي طُلب منه.
 */
export async function linkRequestToUser(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  await run(detail(id), async () => {
    const email = (fstr(form, 'email') ?? '').trim().toLowerCase()
    if (!email.includes('@')) throw new Error('Enter the account e-mail.')
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1)
    if (!user)
      throw new Error(
        `No account with ${email}. Ask the traveller to sign up with that address first.`,
      )
    await db
      .update(customTripRequests)
      .set({ userId: user.id })
      .where(eq(customTripRequests.id, id))
    await writeAudit({
      actor,
      action: 'custom_trip_request.link',
      entityType: 'custom_trip_request',
      entityId: id,
      before: null,
      after: { userId: user.id, email },
    })
    return `Linked to ${email}. Uploaded plans now appear in their account.`
  })
}

/** يتحقق أن البايتات PDF فعلاً — امتداد الملف ونوعه المعلن يكذبان أحياناً. */
function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
}

export async function uploadCustomPdf(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  await run(detail(id), async () => {
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a PDF to upload.')
    if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is larger than 20 MB.')
    if (!isStorageConfigured() && process.env.NODE_ENV === 'production') {
      throw new Error('Object storage is not configured; nothing can be delivered.')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isPdf(bytes)) throw new Error('That file is not a PDF.')

    const [request] = await db
      .select()
      .from(customTripRequests)
      .where(eq(customTripRequests.id, id))
      .limit(1)
    if (!request) throw new Error('That request no longer exists')

    const objectKey = `custom-trips/${id}/${randomUUID()}.pdf`
    if (isStorageConfigured()) {
      await uploadPrivate({ key: objectKey, body: bytes, contentType: 'application/pdf' })
    } else {
      // تطوير محلي: public/ كما يفعل مسار الجداول. لا يحدث في الإنتاج (أعلاه).
      const { mkdir, writeFile } = await import('node:fs/promises')
      const path = await import('node:path')
      const target = path.join(process.cwd(), 'public', objectKey)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes)
    }

    const [{ latest = 0 } = {}] = await db
      .select({ latest: max(customTripDocuments.version) })
      .from(customTripDocuments)
      .where(eq(customTripDocuments.requestId, id))
    const filename = (file.name || 'plan.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 200)

    const [doc] = await db
      .insert(customTripDocuments)
      .values({
        requestId: id,
        objectKey,
        filename,
        bytes: bytes.byteLength,
        version: (latest ?? 0) + 1,
        uploadedBy: actor.userId,
      })
      .returning({ id: customTripDocuments.id, version: customTripDocuments.version })

    // رفع النسخة يعني أن الجدول بانتظار رد العميل، ما لم يكن مكتملاً.
    if (request.status !== 'completed') {
      await db
        .update(customTripRequests)
        .set({ status: 'waiting_customer' })
        .where(eq(customTripRequests.id, id))
    }
    await writeAudit({
      actor,
      action: 'custom_trip_document.upload',
      entityType: 'custom_trip_request',
      entityId: id,
      before: null,
      after: { documentId: doc?.id, version: doc?.version, bytes: bytes.byteLength },
    })

    if (request.userId) {
      await notifyUser(
        request.userId,
        'custom_pdf_ready',
        { name: request.name ?? '' },
        '/account/schedules',
      )
      return `Version ${doc?.version} uploaded. The traveller has been notified.`
    }
    return `Version ${doc?.version} uploaded. This request is not linked to an account yet — link it so the traveller can open the plan.`
  })
}

export async function withdrawCustomPdf(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  await run(detail(id), async () => {
    const documentId = fuuid(form, 'documentId', 'Document')
    const [row] = await db
      .update(customTripDocuments)
      .set({ withdrawnAt: sql`now()` })
      .where(
        and(
          eq(customTripDocuments.id, documentId),
          eq(customTripDocuments.requestId, id),
          isNull(customTripDocuments.withdrawnAt),
        ),
      )
      .returning({ version: customTripDocuments.version })
    if (!row) throw new Error('That version is not active')
    await writeAudit({
      actor,
      action: 'custom_trip_document.withdraw',
      entityType: 'custom_trip_request',
      entityId: id,
      before: { documentId },
      after: { withdrawn: true },
    })
    return `Version ${row.version} withdrawn. The traveller can no longer open it.`
  })
}
