'use server'

/**
 * تحقق رقم الجوال برمز عبر واتساب (الوثيقة 3.1: "يفضل دعم التحقق من الجوال").
 *
 * - الرمز 6 أرقام، صالح 10 دقائق، يُخزَّن hash فقط (sha256 مع معرّف المستخدم).
 * - إرسال واحد كل 60 ثانية، و5 إرسالات في اليوم لكل مستخدم، و5 محاولات خاطئة
 *   كحد أقصى — العدّاد يُحمل عبر إعادة الإرسال داخل مدة الصلاحية (إعادة الإرسال
 *   لا تمنح محاولات جديدة).
 * - الإرسال والتخزين متسلسلان لكل مستخدم (`pg_advisory_xact_lock`)، وصف واحد
 *   فقط لكل معرّف في `verifications`.
 * - يُرسل مباشرة عبر قالب Meta (فئة Authentication) — لا صف إشعار ولا طابور:
 *   الرمز لا يُكتب في أي مكان يُقرأ لاحقاً.
 * - الإرسال يحتاج WhatsApp Cloud API مُعدّاً؛ بدونه يُبلَّغ المستخدم أن الخدمة غير متاحة.
 *
 * ملكية الرقم (قرار تصميم):
 * التسجيل بالجوال وحده لا يتطلب رمزاً، والرقم فريد (`users_phone_normalized_unique`).
 * فمن يسجّل برقم غيره يحجزه. الحل دون تعقيد التسجيل:
 *   1. رقم غير مُتحقق منه لا يستقبل رابط إعادة كلمة المرور (`sendResetPassword`).
 *   2. صاحب الرقم الحقيقي يثبت ملكيته بالرمز من حسابه (`claimPhoneCodeAction`) —
 *      حتى لو كان الرقم محجوزاً لحساب آخر **غير مُتحقق منه**. عند نجاح التحقق
 *      يُسحب الرقم من كل حساب آخر غير مُتحقق منه، وحساب الجوال وحده الذي يفقد
 *      رقمه (لا وسيلة دخول له بعدها) يُغلق: `status = 'inactive'`، بريده البديل
 *      يُحرَّر، وجلساته تُحذف. يُسجَّل `phone_released` في سجل النشاط.
 *   3. رقم مُتحقق منه لا يُسحب أبداً بهذه الطريقة.
 * لذلك تُعرض لصاحب حساب الجوال رسالة التحقق فور التسجيل.
 */

import { createHash, randomInt } from 'node:crypto'

import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'

import { db } from '@/db'
import { sessions, users, verifications } from '@/db/schema'
import { isPlaceholderEmail, normalizePhone, placeholderEmailFor } from '@/lib/auth/phone'
import { sendWhatsappTemplate, toWhatsappNumber, type WhatsappResult } from '@/lib/notify/whatsapp'
import { logActivity } from '@/lib/security/activity'
import { activeUserOrNull } from '@/lib/security/require'

import type { PhoneActionState } from './phone-contract'

const CODE_TTL_MS = 10 * 60_000
const RESEND_AFTER_MS = 60_000
const MAX_ATTEMPTS = 5
const DAILY_SENDS = 5
/** حد لكل رقم مُستقبِل أيضاً: حسابات جديدة مجانية، فحد الحساب وحده لا يحمي رقماً من الإغراق. */
const DAILY_SENDS_PER_NUMBER = 5
const DAY_MS = 24 * 3600_000

const identifierFor = (userId: string) => `phone-otp:${userId}`
const countIdentifierFor = (userId: string) => `phone-otp-count:${userId}`
const numberCountIdentifierFor = (phone: string) => `phone-otp-to:${phone}`
const hashCode = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest('hex')

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

interface Stored {
  hash: string
  attempts: number
  sentAt: number
  /** الرقم الموحّد الذي أُرسل إليه الرمز. */
  phone: string
  /** true = إثبات ملكية رقم ليس (بعد) على هذا الحساب. */
  claim?: boolean
}

function parseStored(value: string): Stored | null {
  try {
    const parsed = JSON.parse(value) as Stored
    return typeof parsed.hash === 'string' && typeof parsed.phone === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** أحدث صف غير منتهٍ للمعرّف، أو null. */
async function readRow(
  tx: Tx,
  identifier: string,
): Promise<{ value: string; expiresAt: Date } | null> {
  const [row] = await tx
    .select({ value: verifications.value, expiresAt: verifications.expiresAt })
    .from(verifications)
    .where(eq(verifications.identifier, identifier))
    .orderBy(desc(verifications.expiresAt))
    .limit(1)
  if (!row || row.expiresAt.getTime() < Date.now()) return null
  return row
}

/** صف واحد فقط لكل معرّف: يُحذف كل ما سبق ثم يُدرج الجديد (تحت القفل). */
async function replaceRow(
  tx: Tx,
  identifier: string,
  value: string,
  expiresAt: Date,
): Promise<void> {
  await tx.delete(verifications).where(eq(verifications.identifier, identifier))
  await tx.insert(verifications).values({ identifier, value, expiresAt })
}

const lockUser = (tx: Tx, userId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identifierFor(userId)}))`)

/** يرسل الرمز ويخزّنه ذرّياً لكل مستخدم: حدود الإرسال تصمد أمام الطلبات المتوازية. */
async function sendCode(
  userId: string,
  phone: string,
  claim: boolean,
  locale: string,
): Promise<PhoneActionState> {
  return db.transaction(async (tx): Promise<PhoneActionState> => {
    await lockUser(tx, userId)

    const previousRow = await readRow(tx, identifierFor(userId))
    const previous = previousRow ? parseStored(previousRow.value) : null
    if (previous !== null && Date.now() - previous.sentAt < RESEND_AFTER_MS) {
      return { status: 'sent', messageKey: 'acct_phone_wait' }
    }
    // استُنفدت المحاولات: رمز جديد لا يمنح محاولات جديدة قبل انتهاء النافذة.
    if (previous !== null && previous.attempts >= MAX_ATTEMPTS) {
      return { status: 'error', messageKey: 'acct_phone_expired' }
    }

    const countRow = await readRow(tx, countIdentifierFor(userId))
    const sentToday = countRow ? Number.parseInt(countRow.value, 10) || 0 : 0
    if (sentToday >= DAILY_SENDS) {
      return { status: 'error', messageKey: 'acct_phone_daily_limit' }
    }
    // القفل الثاني دائماً بعد قفل المستخدم (ترتيب ثابت = لا تعارض).
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${numberCountIdentifierFor(phone)}))`,
    )
    const numberRow = await readRow(tx, numberCountIdentifierFor(phone))
    const sentToNumber = numberRow ? Number.parseInt(numberRow.value, 10) || 0 : 0
    if (sentToNumber >= DAILY_SENDS_PER_NUMBER) {
      return { status: 'error', messageKey: 'acct_phone_daily_limit' }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    let result: WhatsappResult
    try {
      result = await sendWhatsappTemplate(toWhatsappNumber(phone), 'phone_otp', { code }, locale)
    } catch (error) {
      console.error('[phone] verification code send failed', error)
      return { status: 'error', messageKey: 'c_error' }
    }
    if (!result.sent) {
      console.error('[phone] verification code not sent', result.reason)
      return {
        status: 'error',
        messageKey: result.reason === 'not_configured' ? 'acct_phone_unavailable' : 'c_error',
      }
    }

    const now = Date.now()
    const stored: Stored = {
      hash: hashCode(userId, code),
      attempts: previous?.attempts ?? 0,
      sentAt: now,
      phone,
      claim,
    }
    await replaceRow(tx, identifierFor(userId), JSON.stringify(stored), new Date(now + CODE_TTL_MS))
    await replaceRow(
      tx,
      countIdentifierFor(userId),
      String(sentToday + 1),
      // نافذة ثابتة من أول إرسال، لا تتجدد مع كل إرسال.
      countRow?.expiresAt ?? new Date(now + DAY_MS),
    )
    await replaceRow(
      tx,
      numberCountIdentifierFor(phone),
      String(sentToNumber + 1),
      numberRow?.expiresAt ?? new Date(now + DAY_MS),
    )
    return { status: 'sent', messageKey: 'acct_phone_sent' }
  })
}

/** رمز لرقم الحساب الحالي (المحفوظ في الملف الشخصي). */
export async function sendPhoneCodeAction(): Promise<PhoneActionState> {
  const user = await activeUserOrNull('account:phone')
  if (user === null) return { status: 'error', messageKey: 'map_need_signin' }

  const [row] = await db
    .select({ phone: users.phoneNormalized, verifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  if (!row?.phone) return { status: 'error', messageKey: 'acct_phone_missing' }
  if (row.verifiedAt !== null) return { status: 'verified', messageKey: 'acct_phone_verified' }

  try {
    return await sendCode(user.id, row.phone, false, await getLocale())
  } catch (error) {
    console.error('[phone] verification code failed', error)
    return { status: 'error', messageKey: 'c_error' }
  }
}

/**
 * إثبات ملكية رقم محجوز لحساب آخر غير مُتحقق منه (انظر رأس الملف). الرقم يصل
 * للحساب الحالي فقط بعد إدخال الرمز الصحيح (`verifyPhoneCodeAction`).
 */
export async function claimPhoneCodeAction(
  _previous: PhoneActionState,
  form: FormData,
): Promise<PhoneActionState> {
  const user = await activeUserOrNull('account:phone')
  if (user === null) return { status: 'error', messageKey: 'map_need_signin' }

  const phone = normalizePhone(String(form.get('phone') ?? ''))
  if (phone === null) return { status: 'error', messageKey: 'auth_err_phone_intl' }

  const [self] = await db
    .select({ phone: users.phoneNormalized, verifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  if (!self) return { status: 'error', messageKey: 'map_need_signin' }
  if (self.phone === phone && self.verifiedAt !== null) {
    return { status: 'verified', messageKey: 'acct_phone_verified' }
  }

  if (self.phone !== phone) {
    const [holder] = await db
      .select({ verifiedAt: users.phoneVerifiedAt })
      .from(users)
      .where(and(eq(users.phoneNormalized, phone), ne(users.id, user.id)))
      .limit(1)
    // رقم أثبت غيرك ملكيته: نفس رد "أُرسل" دون إرسال شيء، كي لا يصير النموذج
    // أداة لمعرفة أي الأرقام مسجّلة ومؤكَّدة. التحقق بعده ينتهي بـ "انتهى الرمز".
    if (holder && holder.verifiedAt !== null) {
      return { status: 'sent', messageKey: 'acct_phone_sent' }
    }
  }

  try {
    return await sendCode(user.id, phone, self.phone !== phone, await getLocale())
  } catch (error) {
    console.error('[phone] claim code failed', error)
    return { status: 'error', messageKey: 'c_error' }
  }
}

export async function verifyPhoneCodeAction(
  _previous: PhoneActionState,
  form: FormData,
): Promise<PhoneActionState> {
  const user = await activeUserOrNull('account:phone')
  if (user === null) return { status: 'error', messageKey: 'map_need_signin' }

  const code = String(form.get('code') ?? '').replace(/\D/g, '')
  if (code.length !== 6) return { status: 'sent', messageKey: 'acct_phone_bad_code' }

  // Locked check-and-count: parallel guesses (and resends) queue on the lock,
  // so the five-attempt cap holds however many requests arrive at once.
  type Outcome =
    | { kind: 'expired' }
    | { kind: 'wrong' }
    | { kind: 'ok'; phone: string; claim: boolean }
  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    await lockUser(tx, user.id)
    const [row] = await tx
      .select({
        id: verifications.id,
        value: verifications.value,
        expiresAt: verifications.expiresAt,
      })
      .from(verifications)
      .where(eq(verifications.identifier, identifierFor(user.id)))
      .orderBy(desc(verifications.expiresAt))
      .limit(1)
    if (!row) return { kind: 'expired' }
    const stored = parseStored(row.value)
    if (stored === null || row.expiresAt.getTime() < Date.now()) {
      await tx.delete(verifications).where(eq(verifications.id, row.id))
      return { kind: 'expired' }
    }
    // يبقى الصف حتى ينتهي: حذفه هنا كان يعيد العدّاد إلى الصفر مع الإرسال التالي.
    if (stored.attempts >= MAX_ATTEMPTS) return { kind: 'expired' }
    if (stored.hash !== hashCode(user.id, code)) {
      await tx
        .update(verifications)
        .set({ value: JSON.stringify({ ...stored, attempts: stored.attempts + 1 }) })
        .where(eq(verifications.id, row.id))
      return { kind: 'wrong' }
    }
    // Single use: consumed in the same transaction that accepted it.
    await tx.delete(verifications).where(eq(verifications.id, row.id))
    return { kind: 'ok', phone: stored.phone, claim: stored.claim === true }
  })
  if (outcome.kind === 'expired') return { status: 'error', messageKey: 'acct_phone_expired' }
  if (outcome.kind === 'wrong') return { status: 'sent', messageKey: 'acct_phone_bad_code' }

  type Applied =
    | { kind: 'stale' }
    | { kind: 'taken' }
    | { kind: 'ok'; released: { id: string; closed: boolean }[] }
  const applied = await db.transaction(async (tx): Promise<Applied> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`phone-claim:${outcome.phone}`}))`)
    const [self] = await tx
      .select({
        email: users.email,
        phone: users.phoneNormalized,
        verifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
      .for('update')
    if (!self) return { kind: 'stale' }
    // الرقم نفسه الذي أُرسل إليه الرمز (لم يتغير أثناء الانتظار).
    if (!outcome.claim && (self.phone !== outcome.phone || self.verifiedAt !== null)) {
      return { kind: 'stale' }
    }

    const holders = await tx
      .select({ id: users.id, email: users.email, verifiedAt: users.phoneVerifiedAt })
      .from(users)
      .where(and(eq(users.phoneNormalized, outcome.phone), ne(users.id, user.id)))
      .for('update')
    // رقم أثبت غيرك ملكيته لا يُسحب.
    if (holders.some((holder) => holder.verifiedAt !== null)) return { kind: 'taken' }

    const released: { id: string; closed: boolean }[] = []
    for (const holder of holders) {
      // حساب جوال وحده بلا رقم = بلا وسيلة دخول: يُغلق، وبريده البديل يُحرَّر
      // (وإلا اصطدم بـ `users_email_unique` لمن يسجّل بهذا الرقم لاحقاً).
      const closed = isPlaceholderEmail(holder.email)
      await tx
        .update(users)
        .set({
          phone: null,
          phoneNormalized: null,
          phoneVerifiedAt: null,
          ...(closed ? { status: 'inactive', email: `released+${holder.id}@invalid.local` } : {}),
        })
        .where(eq(users.id, holder.id))
      if (closed) await tx.delete(sessions).where(eq(sessions.userId, holder.id))
      released.push({ id: holder.id, closed })
    }

    await tx
      .update(users)
      .set({
        phoneVerifiedAt: new Date(),
        ...(outcome.claim
          ? {
              phone: outcome.phone,
              phoneNormalized: outcome.phone,
              // حساب الجوال وحده: البريد البديل يتبع الرقم (كما في تعديل الملف).
              ...(isPlaceholderEmail(self.email)
                ? { email: placeholderEmailFor(outcome.phone) }
                : {}),
            }
          : {}),
      })
      .where(eq(users.id, user.id))
    return { kind: 'ok', released }
  })
  if (applied.kind === 'stale') return { status: 'error', messageKey: 'acct_phone_expired' }
  if (applied.kind === 'taken') return { status: 'error', messageKey: 'acct_phone_claim_taken' }

  for (const holder of applied.released) {
    await logActivity({
      action: 'phone_released',
      userId: holder.id,
      details: { claimedBy: user.id, closed: holder.closed },
    })
  }

  revalidatePath('/[locale]/account', 'page')
  return { status: 'verified', messageKey: 'acct_phone_verified' }
}
