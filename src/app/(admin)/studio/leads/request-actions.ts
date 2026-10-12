'use server'

import { randomUUID } from 'node:crypto'

import { and, eq, isNull, max, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { absoluteUrl } from '@/app/[locale]/_meta'
import { db } from '@/db'
import { customTripDocuments, customTripRequests, users } from '@/db/schema'
import { defaultLocale, isLocale } from '@/i18n/config'
import { can } from '@/lib/auth/roles'
import { formatMoney } from '@/lib/money'
import { notifyUser } from '@/lib/notify'
import { toWhatsappNumber } from '@/lib/notify/whatsapp'
import { isStorageConfigured, uploadPrivate } from '@/lib/storage'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fcurrency, fintOrNull, fstr, fuuid } from '../../_lib/form'
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
 * ربط طلب ضيف بحساب: فقط بالحساب الذي يحمل بريد الطلب نفسه (مطابقة بأحرف
 * صغيرة)، وفقط إن لم يُربط بعد. صاحب البريد هو صاحب الطلب.
 */
export async function linkRequestToUser(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  await run(detail(id), async () => {
    const email = (fstr(form, 'email') ?? '').trim().toLowerCase()
    if (!email.includes('@')) throw new Error('Enter the account e-mail.')
    // الطلب موجود، غير مربوط بعد، وبريده هو البريد المُدخل. غير ذلك كان يربط
    // خطة رحلة شخص (اسمه وتواريخه) بحساب آخر بخطأ كتابة واحد.
    const [request] = await db
      .select({ userId: customTripRequests.userId, email: customTripRequests.email })
      .from(customTripRequests)
      .where(eq(customTripRequests.id, id))
      .limit(1)
    if (!request) throw new Error('That request no longer exists.')
    if (request.userId !== null) throw new Error('This request is already linked to an account.')
    if ((request.email ?? '').trim().toLowerCase() !== email) {
      throw new Error(
        `The request was sent from ${request.email ?? 'no e-mail'}. Link it only to the account with that same address.`,
      )
    }
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1)
    if (!user)
      throw new Error(
        `No account with ${email}. Ask the traveller to sign up with that address first.`,
      )
    const linked = await db
      .update(customTripRequests)
      .set({ userId: user.id })
      .where(and(eq(customTripRequests.id, id), isNull(customTripRequests.userId)))
      .returning({ id: customTripRequests.id })
    if (linked.length === 0) throw new Error('This request was linked meanwhile.')
    await writeAudit({
      actor,
      action: 'custom_trip_request.link',
      entityType: 'custom_trip_request',
      entityId: id,
      before: { userId: null },
      after: { userId: user.id, email },
    })
    return `Linked to ${email}. Uploaded plans now appear in their account.`
  })
}

/* --------------------------------------------------------------------------
   عرض السعر (الوثيقة 13.1 "جدول مخصص")
   -------------------------------------------------------------------------- */

/**
 * تحديد سعر الجدول المخصص. قرار تجاري: لمن يملك `config.write` أو
 * `orders.refund` (المدير)، لا لكل من يقرأ الطلبات. فارغ = سحب العرض.
 *
 * لا يُعدَّل بعد الدفع: الطلب المدفوع لقطة لما دُفع. تعديل عرض لم يُدفع بينما هو
 * في سلة العميل آمن — السلة والدفع يقرآن السعر من هنا من جديد، و`price_changed`
 * يرفض الدفع إن تغيّر بعد عرضه.
 */
export async function setCustomQuote(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  await run(detail(id), async () => {
    if (!can(actor.role, 'config.write') && !can(actor.role, 'orders.refund')) {
      throw new Error('Only managers (orders or configuration rights) can set a price.')
    }
    const minor = fintOrNull(form, 'quoteMinor', 'Price')
    if (minor !== null && minor <= 0)
      throw new Error('Price must be above zero, or blank to clear.')
    const currency = minor === null ? null : fcurrency(form, 'quoteCurrency')

    const [before] = await db
      .select({
        userId: customTripRequests.userId,
        name: customTripRequests.name,
        quoteMinor: customTripRequests.quoteMinor,
        quoteCurrency: customTripRequests.quoteCurrency,
        paidOrderId: customTripRequests.paidOrderId,
        status: customTripRequests.status,
        locale: users.locale,
      })
      .from(customTripRequests)
      .leftJoin(users, eq(users.id, customTripRequests.userId))
      .where(eq(customTripRequests.id, id))
      .limit(1)
    if (!before) throw new Error('That request no longer exists')
    if (before.paidOrderId !== null)
      throw new Error('This request is already paid; the price is final.')
    if (minor !== null && (before.status === 'cancelled' || before.status === 'completed')) {
      throw new Error(`This request is ${before.status}; reopen it before quoting.`)
    }

    const [after] = await db
      .update(customTripRequests)
      .set({
        quoteMinor: minor,
        quoteCurrency: currency,
        quotedAt: minor === null ? null : new Date(),
      })
      .where(and(eq(customTripRequests.id, id), isNull(customTripRequests.paidOrderId)))
      .returning({ id: customTripRequests.id })
    if (!after) throw new Error('This request was paid meanwhile; the price is final.')

    await writeAudit({
      actor,
      action: minor === null ? 'custom_trip_request.quote_clear' : 'custom_trip_request.quote',
      entityType: 'custom_trip_request',
      entityId: id,
      before: { quoteMinor: before.quoteMinor, quoteCurrency: before.quoteCurrency },
      after: { quoteMinor: minor, quoteCurrency: currency },
    })

    if (minor === null || currency === null)
      return 'Price cleared. The traveller can no longer pay.'
    if (before.userId === null) {
      return 'Price saved. This request is not linked to an account yet — link it so the traveller can see and pay it.'
    }
    const locale = before.locale !== null && isLocale(before.locale) ? before.locale : defaultLocale
    await notifyUser(
      before.userId,
      'custom_quote',
      { name: before.name ?? '', amount: formatMoney(minor, currency, locale) },
      '/account/schedules',
    )
    return 'Price saved. The traveller has been notified and can pay from their account.'
  })
}

/* --------------------------------------------------------------------------
   الإرسال عبر واتساب (الوثيقة 4.4)
   -------------------------------------------------------------------------- */

type WhatsappTarget =
  | { ok: true; userId: string; name: string; link: string }
  | { ok: false; reason: string }

/**
 * هل يمكن إرسال هذه النسخة لصاحب الطلب على واتساب؟ الطلب مربوط بحساب، والحساب
 * وافق على واتساب وله رقم دولي صالح، والنسخة غير مسحوبة. الرابط صفحة العرض
 * المحمية في حسابه — لا رابط ملف مباشر أبداً.
 */
async function whatsappTarget(requestId: string, documentId: string): Promise<WhatsappTarget> {
  const [row] = await db
    .select({
      userId: customTripRequests.userId,
      name: customTripRequests.name,
      optIn: users.whatsappOptIn,
      phone: users.phone,
      locale: users.locale,
      withdrawnAt: customTripDocuments.withdrawnAt,
    })
    .from(customTripDocuments)
    .innerJoin(customTripRequests, eq(customTripRequests.id, customTripDocuments.requestId))
    .leftJoin(users, eq(users.id, customTripRequests.userId))
    .where(
      and(eq(customTripDocuments.id, documentId), eq(customTripDocuments.requestId, requestId)),
    )
    .limit(1)
  if (!row) return { ok: false, reason: 'That version does not belong to this request.' }
  if (row.withdrawnAt !== null) return { ok: false, reason: 'That version is withdrawn.' }
  if (row.userId === null) {
    return { ok: false, reason: 'This request is not linked to an account — link it first.' }
  }
  if (row.optIn !== true) {
    return { ok: false, reason: 'The traveller has not opted in to WhatsApp messages.' }
  }
  if (toWhatsappNumber(row.phone) === null) {
    return {
      ok: false,
      reason: 'The traveller has no international phone number (+country code) on their account.',
    }
  }
  const locale = row.locale !== null && isLocale(row.locale) ? row.locale : defaultLocale
  return {
    ok: true,
    userId: row.userId,
    name: row.name ?? '',
    link: absoluteUrl(`/account/custom/${documentId}/view`, locale),
  }
}

async function sendPdfWhatsapp(
  target: Extract<WhatsappTarget, { ok: true }>,
  documentId: string,
  override: { email?: boolean } = {},
): Promise<boolean> {
  const notificationId = await notifyUser(
    target.userId,
    'pdf_ready_whatsapp',
    { name: target.name, link: target.link },
    `/account/custom/${documentId}/view`,
    { whatsapp: true, ...override },
  )
  return notificationId !== null
}

export async function sendCustomPdfWhatsapp(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  await run(detail(id), async () => {
    const documentId = fuuid(form, 'documentId', 'Document')
    const target = await whatsappTarget(id, documentId)
    if (!target.ok) throw new Error(target.reason)
    if (!(await sendPdfWhatsapp(target, documentId))) {
      throw new Error('The WhatsApp message could not be queued. Try again shortly.')
    }
    await writeAudit({
      actor,
      action: 'custom_trip_document.whatsapp',
      entityType: 'custom_trip_request',
      entityId: id,
      before: null,
      after: { documentId },
    })
    return 'Queued on WhatsApp with a link to the plan in their account.'
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
      // "أرسل أيضاً على واتساب": رسالة واحدة برابط صفحة العرض المحمية (+ داخل
      // الموقع + البريد). بدونه: الإشعار المعتاد بلا واتساب.
      const alsoWhatsapp = fbool(form, 'alsoWhatsapp')
      const target = alsoWhatsapp && doc ? await whatsappTarget(id, doc.id) : null
      if (target?.ok && doc && (await sendPdfWhatsapp(target, doc.id, { email: true }))) {
        return `Version ${doc.version} uploaded. The traveller has been notified, including on WhatsApp.`
      }
      await notifyUser(
        request.userId,
        'custom_pdf_ready',
        { name: request.name ?? '' },
        '/account/schedules',
        { whatsapp: false },
      )
      if (target && !target.ok) {
        return `Version ${doc?.version} uploaded and the traveller notified — but not on WhatsApp: ${target.reason}`
      }
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
