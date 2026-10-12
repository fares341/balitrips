'use server'

/**
 * تحقق رقم الجوال برمز عبر واتساب (الوثيقة 3.1: "يفضل دعم التحقق من الجوال").
 *
 * - الرمز 6 أرقام، صالح 10 دقائق، يُخزَّن hash فقط (sha256 مع معرّف المستخدم).
 * - إرسال واحد كل 60 ثانية، و5 محاولات خاطئة كحد أقصى للرمز الواحد.
 * - يُرسل مباشرة عبر قالب Meta (فئة Authentication) — لا صف إشعار ولا طابور:
 *   الرمز لا يُكتب في أي مكان يُقرأ لاحقاً.
 * - الإرسال يحتاج WhatsApp Cloud API مُعدّاً؛ بدونه يُبلَّغ المستخدم أن الخدمة غير متاحة.
 */

import { createHash, randomInt } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'

import { db } from '@/db'
import { users, verifications } from '@/db/schema'
import { sendWhatsappTemplate, toWhatsappNumber } from '@/lib/notify/whatsapp'
import { activeUserOrNull } from '@/lib/security/require'

import type { PhoneActionState } from './phone-contract'

const CODE_TTL_MS = 10 * 60_000
const RESEND_AFTER_MS = 60_000
const MAX_ATTEMPTS = 5

const identifierFor = (userId: string) => `phone-otp:${userId}`
const hashCode = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest('hex')

interface Stored {
  hash: string
  attempts: number
  sentAt: number
  phone: string
}

async function readStored(userId: string): Promise<Stored | null> {
  const [row] = await db
    .select({ value: verifications.value, expiresAt: verifications.expiresAt })
    .from(verifications)
    .where(eq(verifications.identifier, identifierFor(userId)))
    .limit(1)
  if (!row || row.expiresAt.getTime() < Date.now()) return null
  try {
    return JSON.parse(row.value) as Stored
  } catch {
    return null
  }
}

async function writeStored(userId: string, value: Stored | null): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(verifications).where(eq(verifications.identifier, identifierFor(userId)))
    if (value !== null) {
      await tx.insert(verifications).values({
        identifier: identifierFor(userId),
        value: JSON.stringify(value),
        expiresAt: new Date(value.sentAt + CODE_TTL_MS),
      })
    }
  })
}

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

  const previous = await readStored(user.id)
  if (previous !== null && Date.now() - previous.sentAt < RESEND_AFTER_MS) {
    return { status: 'sent', messageKey: 'acct_phone_wait' }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const result = await sendWhatsappTemplate(
    toWhatsappNumber(row.phone),
    'phone_otp',
    { code },
    await getLocale(),
  )
  if (!result.sent) {
    console.error('[phone] verification code not sent', result.reason)
    return {
      status: 'error',
      messageKey: result.reason === 'not_configured' ? 'acct_phone_unavailable' : 'c_error',
    }
  }
  await writeStored(user.id, {
    hash: hashCode(user.id, code),
    attempts: 0,
    sentAt: Date.now(),
    phone: row.phone,
  })
  return { status: 'sent', messageKey: 'acct_phone_sent' }
}

export async function verifyPhoneCodeAction(
  _previous: PhoneActionState,
  form: FormData,
): Promise<PhoneActionState> {
  const user = await activeUserOrNull('account:phone')
  if (user === null) return { status: 'error', messageKey: 'map_need_signin' }

  const code = String(form.get('code') ?? '').replace(/\D/g, '')
  if (code.length !== 6) return { status: 'sent', messageKey: 'acct_phone_bad_code' }

  // Row-locked check-and-count: parallel guesses queue on the lock, so the
  // five-attempt cap holds however many requests arrive at once.
  type Outcome = { kind: 'expired' } | { kind: 'wrong' } | { kind: 'ok'; phone: string }
  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    const [row] = await tx
      .select({
        id: verifications.id,
        value: verifications.value,
        expiresAt: verifications.expiresAt,
      })
      .from(verifications)
      .where(eq(verifications.identifier, identifierFor(user.id)))
      .limit(1)
      .for('update')
    if (!row) return { kind: 'expired' }
    let stored: Stored | null = null
    try {
      stored = JSON.parse(row.value) as Stored
    } catch {
      stored = null
    }
    if (
      stored === null ||
      row.expiresAt.getTime() < Date.now() ||
      stored.attempts >= MAX_ATTEMPTS
    ) {
      await tx.delete(verifications).where(eq(verifications.id, row.id))
      return { kind: 'expired' }
    }
    if (stored.hash !== hashCode(user.id, code)) {
      await tx
        .update(verifications)
        .set({ value: JSON.stringify({ ...stored, attempts: stored.attempts + 1 }) })
        .where(eq(verifications.id, row.id))
      return { kind: 'wrong' }
    }
    // Single use: consumed in the same transaction that accepted it.
    await tx.delete(verifications).where(eq(verifications.id, row.id))
    return { kind: 'ok', phone: stored.phone }
  })
  if (outcome.kind === 'expired') return { status: 'error', messageKey: 'acct_phone_expired' }
  if (outcome.kind === 'wrong') return { status: 'sent', messageKey: 'acct_phone_bad_code' }

  // الرقم نفسه الذي أُرسل إليه الرمز (لم يتغير أثناء الانتظار).
  const updated = await db
    .update(users)
    .set({ phoneVerifiedAt: new Date() })
    .where(
      and(
        eq(users.id, user.id),
        eq(users.phoneNormalized, outcome.phone),
        isNull(users.phoneVerifiedAt),
      ),
    )
    .returning({ id: users.id })
  if (updated.length === 0) return { status: 'error', messageKey: 'acct_phone_expired' }

  revalidatePath('/[locale]/account', 'page')
  return { status: 'verified', messageKey: 'acct_phone_verified' }
}
