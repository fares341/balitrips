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
import { isPrivateStorageAvailable, uploadPrivate } from '@/lib/storage'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fcurrency, fcurrencyOr, fmoneyOrNull, fstr, fuuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import type { Translate } from '../../_i18n'
import { logRequestActivity, notifyRequestStatus } from './notify'

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
  const { t } = await getAdminI18n()
  await run(detail(id), async () => {
    const adminNotes = fstr(form, 'adminNotes')?.slice(0, 5000) ?? null
    const [row] = await db
      .update(customTripRequests)
      .set({ adminNotes })
      .where(eq(customTripRequests.id, id))
      .returning({ id: customTripRequests.id })
    if (!row) throw new Error(t('leads.err_no_request'))
    await writeAudit({
      actor,
      action: 'custom_trip_request.notes',
      entityType: 'custom_trip_request',
      entityId: id,
      before: null,
      after: { length: adminNotes?.length ?? 0 },
    })
    return t('leads.ok_notes')
  })
}

/**
 * ربط طلب ضيف بحساب: فقط بالحساب الذي يحمل بريد الطلب نفسه (مطابقة بأحرف
 * صغيرة)، وفقط إن لم يُربط بعد. صاحب البريد هو صاحب الطلب.
 */
export async function linkRequestToUser(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  const { t } = await getAdminI18n()
  await run(detail(id), async () => {
    const email = (fstr(form, 'email') ?? '').trim().toLowerCase()
    if (!email.includes('@')) throw new Error(t('leads.err_enter_email'))
    // الطلب موجود، غير مربوط بعد، وبريده هو البريد المُدخل. غير ذلك كان يربط
    // خطة رحلة شخص (اسمه وتواريخه) بحساب آخر بخطأ كتابة واحد.
    const [request] = await db
      .select({ userId: customTripRequests.userId, email: customTripRequests.email })
      .from(customTripRequests)
      .where(eq(customTripRequests.id, id))
      .limit(1)
    if (!request) throw new Error(t('leads.err_no_request'))
    if (request.userId !== null) throw new Error(t('leads.err_already_linked'))
    if ((request.email ?? '').trim().toLowerCase() !== email) {
      throw new Error(
        t('leads.err_email_mismatch', { email: request.email ?? t('leads.no_email') }),
      )
    }
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1)
    if (!user) throw new Error(t('leads.err_no_account_for', { email }))
    const linked = await db
      .update(customTripRequests)
      .set({ userId: user.id })
      .where(and(eq(customTripRequests.id, id), isNull(customTripRequests.userId)))
      .returning({ id: customTripRequests.id })
    if (linked.length === 0) throw new Error(t('leads.err_linked_meanwhile'))
    await writeAudit({
      actor,
      action: 'custom_trip_request.link',
      entityType: 'custom_trip_request',
      entityId: id,
      before: { userId: null },
      after: { userId: user.id, email },
    })
    return t('leads.ok_linked', { email })
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
  const { t } = await getAdminI18n()
  await run(detail(id), async () => {
    if (!can(actor.role, 'config.write') && !can(actor.role, 'orders.refund')) {
      throw new Error(t('leads.err_price_managers_only'))
    }
    const minor = fmoneyOrNull(
      form,
      'quoteMinor',
      fcurrencyOr(form, 'quoteCurrency'),
      t('leads.price'),
    )
    if (minor !== null && minor <= 0) throw new Error(t('leads.err_price_positive'))
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
    if (!before) throw new Error(t('leads.err_no_request'))
    if (before.paidOrderId !== null) throw new Error(t('leads.err_already_paid'))
    if (minor !== null && (before.status === 'cancelled' || before.status === 'completed')) {
      throw new Error(
        t('leads.err_reopen_before_quote', { status: t(`leads.status_${before.status}`) }),
      )
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
    if (!after) throw new Error(t('leads.err_paid_meanwhile'))

    await writeAudit({
      actor,
      action: minor === null ? 'custom_trip_request.quote_clear' : 'custom_trip_request.quote',
      entityType: 'custom_trip_request',
      entityId: id,
      before: { quoteMinor: before.quoteMinor, quoteCurrency: before.quoteCurrency },
      after: { quoteMinor: minor, quoteCurrency: currency },
    })
    await logRequestActivity(id, minor === null ? 'quote_cleared' : 'quote', {
      quoteMinor: minor,
      currency,
      by: actor.userId,
    })

    if (minor === null || currency === null) return t('leads.ok_price_cleared')
    if (before.userId === null) return t('leads.ok_price_saved_unlinked')
    const locale = before.locale !== null && isLocale(before.locale) ? before.locale : defaultLocale
    await notifyUser(
      before.userId,
      'custom_quote',
      { name: before.name ?? '', amount: formatMoney(minor, currency, locale) },
      '/account/schedules',
    )
    return t('leads.ok_price_saved')
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
async function whatsappTarget(
  requestId: string,
  documentId: string,
  t: Translate,
): Promise<WhatsappTarget> {
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
  if (!row) return { ok: false, reason: t('leads.wa_wrong_version') }
  if (row.withdrawnAt !== null) return { ok: false, reason: t('leads.wa_withdrawn') }
  if (row.userId === null) {
    return { ok: false, reason: t('leads.wa_not_linked') }
  }
  if (row.optIn !== true) {
    return { ok: false, reason: t('leads.wa_not_opted_in') }
  }
  if (toWhatsappNumber(row.phone) === null) {
    return { ok: false, reason: t('leads.wa_no_phone') }
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
  const { t } = await getAdminI18n()
  await run(detail(id), async () => {
    const documentId = fuuid(form, 'documentId', t('leads.document'))
    const target = await whatsappTarget(id, documentId, t)
    if (!target.ok) throw new Error(target.reason)
    if (!(await sendPdfWhatsapp(target, documentId))) {
      throw new Error(t('leads.err_whatsapp_queue'))
    }
    await writeAudit({
      actor,
      action: 'custom_trip_document.whatsapp',
      entityType: 'custom_trip_request',
      entityId: id,
      before: null,
      after: { documentId },
    })
    return t('leads.ok_whatsapp_queued')
  })
}

/** يتحقق أن البايتات PDF فعلاً — امتداد الملف ونوعه المعلن يكذبان أحياناً. */
function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
}

export async function uploadCustomPdf(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  const { t } = await getAdminI18n()
  await run(detail(id), async () => {
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) throw new Error(t('leads.err_choose_pdf'))
    if (file.size > MAX_PDF_BYTES) throw new Error(t('leads.err_pdf_too_large'))
    if (!isPrivateStorageAvailable() && process.env.NODE_ENV === 'production') {
      throw new Error(t('leads.err_no_storage'))
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isPdf(bytes)) throw new Error(t('leads.err_not_pdf'))

    const [request] = await db
      .select()
      .from(customTripRequests)
      .where(eq(customTripRequests.id, id))
      .limit(1)
    if (!request) throw new Error(t('leads.err_no_request'))

    const objectKey = `custom-trips/${id}/${randomUUID()}.pdf`
    if (isPrivateStorageAvailable()) {
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
    await logRequestActivity(id, 'pdf_uploaded', {
      documentId: doc?.id ?? null,
      version: doc?.version ?? null,
      by: actor.userId,
    })

    if (request.userId) {
      // "أرسل أيضاً على واتساب": رسالة واحدة برابط صفحة العرض المحمية (+ داخل
      // الموقع + البريد). بدونه: الإشعار المعتاد بلا واتساب.
      const alsoWhatsapp = fbool(form, 'alsoWhatsapp')
      const target = alsoWhatsapp && doc ? await whatsappTarget(id, doc.id, t) : null
      if (target?.ok && doc && (await sendPdfWhatsapp(target, doc.id, { email: true }))) {
        return t('leads.ok_uploaded_whatsapp', { version: doc.version })
      }
      await notifyUser(
        request.userId,
        'custom_pdf_ready',
        { name: request.name ?? '' },
        '/account/schedules',
        { whatsapp: false },
      )
      if (target && !target.ok) {
        return t('leads.ok_uploaded_no_whatsapp', { version: doc?.version, reason: target.reason })
      }
      return t('leads.ok_uploaded', { version: doc?.version })
    }
    // ضيف: بريد بتغيّر الحالة إلى "بانتظار ردك" يدعوه للتسجيل بنفس البريد.
    if (request.status !== 'completed' && request.status !== 'waiting_customer') {
      await notifyRequestStatus(id, 'waiting_customer')
    }
    return t('leads.ok_uploaded_unlinked', { version: doc?.version })
  })
}

export async function withdrawCustomPdf(id: string, form: FormData): Promise<void> {
  const actor = await requireCapability('leads.read')
  const { t } = await getAdminI18n()
  await run(detail(id), async () => {
    const documentId = fuuid(form, 'documentId', t('leads.document'))
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
    if (!row) throw new Error(t('leads.err_version_inactive'))
    await writeAudit({
      actor,
      action: 'custom_trip_document.withdraw',
      entityType: 'custom_trip_request',
      entityId: id,
      before: { documentId },
      after: { withdrawn: true },
    })
    return t('leads.ok_withdrawn', { version: row.version })
  })
}
