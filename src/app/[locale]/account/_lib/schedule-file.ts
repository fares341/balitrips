/**
 * المسار المشترك لتسليم ملف جدول PDF (العرض داخل الموقع والتحميل).
 *
 *  1. `checkSecureAccess()` — جلسة حيّة + جهاز فعّال + لا حظر.
 *  2. `resolveScheduleDocument()` — البند يخص هذا المستخدم، مدفوع، غير مسترد.
 *  3. قراءة الملف الأصلي من التخزين الخاص **على الخادم** — المتصفح لا يرى
 *     رابط التخزين إطلاقاً، ولا حتى موقّعاً.
 *  4. ختم العلامة المائية وإرجاع البايتات مع `no-store`.
 *
 * كل تسليم يُسجَّل في `activity_log` مع `deliveryId` المطبوع في الملف.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { readSetting } from '@/app/(admin)/_lib/settings'
import { db } from '@/db'
import { activityLog, customTripDocuments, customTripRequests } from '@/db/schema'
import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { contactLabel } from '@/lib/auth/phone'
import { loadPermissions } from '@/lib/entitlements/plans'
import { customDocumentUnlocked } from '@/lib/orders/custom-request'
import { stampPdf } from '@/lib/pdf/watermark'
import { logActivity } from '@/lib/security/activity'
import { checkSecureAccess } from '@/lib/security/guard'
import { contentDisposition, isPrivateStorageAvailable, readPrivateObject } from '@/lib/storage'

import { resolveScheduleDocument } from './queries'

export const NO_STORE = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
} as const

export type DeliveryMode = 'view' | 'download'

/** ترويسة يرسلها العارض وحده؛ التنقل المباشر للرابط لا يستطيع إرسالها. */
export const VIEWER_HEADER = 'x-bt-viewer'

function isViewerFetch(request: Request): boolean {
  if (request.headers.get(VIEWER_HEADER) !== '1') return false
  const dest = request.headers.get('sec-fetch-dest')
  // متصفح حديث: fetch = "empty". تنقل/iframe/embed = غير ذلك.
  return dest === null || dest === 'empty'
}

/** أقصى حجم نقبله من التخزين — جداول الرحلات بضعة ميغابايتات. */
const MAX_SOURCE_BYTES = 30 * 1024 * 1024

async function loadSource(objectKey: string): Promise<Uint8Array | null> {
  const key = objectKey.replace(/^\/+/, '')

  // Spaces، أو مجلد خاص محلي (PRIVATE_STORAGE_DIR) في تشغيل خادم واحد.
  if (isPrivateStorageAvailable()) {
    const buffer = await readPrivateObject(key)
    return buffer === null || buffer.byteLength > MAX_SOURCE_BYTES ? null : buffer
  }

  // تطوير محلي فقط: الملفات من public/. في الإنتاج بلا تخزين لا نسلّم شيئاً.
  if (process.env.NODE_ENV === 'production') return null
  const root = path.join(process.cwd(), 'public')
  const file = path.normalize(path.join(root, key))
  if (!file.startsWith(root + path.sep)) return null
  try {
    return new Uint8Array(await readFile(file))
  } catch {
    return null
  }
}

/**
 * مرات الفتح للعارض في اليوم لكل جدول. العارض يجلب الملف كاملاً (PDF.js في
 * المتصفح)، فحتى في "عرض فقط" يمكن لمستخدم متمرّس حفظ ما وصل للمتصفح — الوثيقة
 * 16.3 تقرّ بأن المنع 100% مستحيل على الويب. هذا الحد يمنع السحب الآلي المتكرر،
 * وكل نسخة تحمل بريد المستخدم ورقم الطلب ورمز التسليم، وكل فتح مسجّل.
 */
const VIEWS_PER_DAY = 20

/**
 * يحجز تسليماً واحداً ذرّياً: قفل استشاري لكل (مستخدم، بند) ثم العدّ ثم تسجيل
 * التسليم — في معاملة واحدة. كان العدّ يسبق الختم البطيء والتسجيل يليه، فعشرة
 * طلبات متوازية كانت تمر كلها من حد "3 تحميلات".
 */
async function reserveDelivery(input: {
  userId: string
  orderItemId: string
  mode: DeliveryMode
  limit: number
  windowMs: number | null
  ip: string | null
  deviceId: string | null
  details: Record<string, unknown>
}): Promise<boolean> {
  const action = input.mode === 'download' ? 'download_pdf' : 'view_pdf'
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${input.userId}:${input.orderItemId}`}))`,
    )
    if (input.limit > 0) {
      const [row] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.userId, input.userId),
            eq(activityLog.action, action),
            sql`${activityLog.details}->>'orderItemId' = ${input.orderItemId}`,
            input.windowMs === null
              ? undefined
              : gte(activityLog.createdAt, new Date(Date.now() - input.windowMs)),
          ),
        )
      if ((row?.value ?? 0) >= input.limit) return false
    }
    await tx.insert(activityLog).values({
      action,
      userId: input.userId,
      ip: input.ip,
      deviceId: input.deviceId,
      details: { ...input.details, orderItemId: input.orderItemId },
    })
    return true
  })
}

function toAccountRedirect(request: Request, locale: Locale, query?: Record<string, string>) {
  return NextResponse.redirect(
    new URL(
      getPathname({ href: { pathname: '/account/schedules', query: query ?? {} }, locale }),
      request.url,
    ),
    { headers: NO_STORE },
  )
}

/**
 * ملف جدول مخصص يخص هذا المستخدم: الطلب مرتبط بحسابه والنسخة لم تُسحب.
 * الرقم في العلامة المائية `CT-<8 أحرف من معرّف الطلب>` يقود إلى الطلب.
 */
async function resolveCustomDocument(userId: string, documentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null
  const [row] = await db
    .select({ objectKey: customTripDocuments.objectKey, requestId: customTripDocuments.requestId })
    .from(customTripDocuments)
    .innerJoin(customTripRequests, eq(customTripRequests.id, customTripDocuments.requestId))
    .where(
      and(
        eq(customTripDocuments.id, documentId),
        eq(customTripRequests.userId, userId),
        isNull(customTripDocuments.withdrawnAt),
        customDocumentUnlocked,
      ),
    )
    .limit(1)
  if (!row) return null
  return {
    objectKey: row.objectKey,
    orderNumber: `CT-${row.requestId.slice(0, 8).toUpperCase()}`,
    slug: 'custom-trip',
  }
}

export async function deliverSchedule(
  request: Request,
  rawLocale: string,
  itemId: string,
  mode: DeliveryMode,
  kind: 'itinerary' | 'custom' = 'itinerary',
): Promise<Response> {
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale
  const resource = `${kind === 'custom' ? 'custom' : 'schedule'}:${itemId}`

  const access = await checkSecureAccess(resource)
  if (!access.ok) {
    if (access.reason === 'banned' || access.reason === 'device-revoked') {
      return new NextResponse(null, { status: 403, headers: NO_STORE })
    }
    const next = getPathname({ href: '/account/schedules', locale })
    return NextResponse.redirect(
      new URL(
        getPathname({ href: { pathname: '/account', query: { next } }, locale }),
        request.url,
      ),
      { headers: NO_STORE },
    )
  }
  const { user } = access

  const resolved =
    kind === 'custom'
      ? await resolveCustomDocument(user.id, itemId)
      : await resolveScheduleDocument(user.id, itemId, locale)
  if (resolved === null) {
    await logActivity({
      action: 'unauthorized_access',
      userId: user.id,
      ip: access.ip,
      deviceId: access.deviceId,
      details: { resource, why: 'not_entitled' },
    })
    return new NextResponse(null, { status: 404, headers: NO_STORE })
  }
  if (resolved === 'not-ready') return toAccountRedirect(request, locale, { doc: 'pending' })

  if (mode === 'view' && !isViewerFetch(request)) {
    // فتح `/file` مباشرة في المتصفح كان يعطي الملف كاملاً قابلاً للحفظ والطباعة،
    // متجاوزاً "عرض فقط" وحد التحميلات. العارض وحده يجلب الملف.
    await logActivity({
      action: 'unauthorized_access',
      userId: user.id,
      ip: access.ip,
      deviceId: access.deviceId,
      details: { resource, why: 'direct_file_open' },
    })
    const viewPath =
      kind === 'custom'
        ? `/account/custom/${encodeURIComponent(itemId)}/view`
        : `/account/schedules/${encodeURIComponent(itemId)}/view`
    return NextResponse.redirect(new URL(getPathname({ href: viewPath, locale }), request.url), {
      headers: NO_STORE,
    })
  }

  if (mode === 'download') {
    const [policy, permissions] = await Promise.all([
      readSetting('security'),
      loadPermissions(user.id),
    ])
    // السياسة العامة، أو باقات المستخدم كلها تمنع التحميل (الوثيقة 13.2).
    if (policy.pdfDownloads === 'view_only' || !permissions.canDownloadPdf) {
      return toAccountRedirect(request, locale, { doc: 'view-only' })
    }
  }

  const deliveryId = randomUUID()
  const reserved = await reserveDelivery({
    userId: user.id,
    orderItemId: itemId,
    mode,
    limit:
      mode === 'download' ? (await readSetting('security')).maxDownloadsPerItem : VIEWS_PER_DAY,
    windowMs: mode === 'download' ? null : 24 * 60 * 60 * 1000,
    ip: access.ip,
    deviceId: access.deviceId,
    details: { orderNumber: resolved.orderNumber, deliveryId, locale },
  })
  if (!reserved) {
    await logActivity({
      action: 'unauthorized_access',
      userId: user.id,
      ip: access.ip,
      deviceId: access.deviceId,
      details: { resource, why: mode === 'download' ? 'download_limit' : 'view_limit' },
    })
    return mode === 'download'
      ? toAccountRedirect(request, locale, { doc: 'limit' })
      : new NextResponse(null, { status: 429, headers: NO_STORE })
  }

  // تسليم فشل (تخزين معطّل، ملف تالف) لا يُحتسب من حد التحميل/العرض.
  const releaseReservation = () =>
    db
      .delete(activityLog)
      .where(
        and(
          eq(activityLog.userId, user.id),
          sql`${activityLog.details}->>'deliveryId' = ${deliveryId}`,
        ),
      )

  const source = await loadSource(resolved.objectKey)
  if (source === null) {
    console.error('[schedules] source PDF unavailable', resolved.objectKey)
    await releaseReservation()
    return new NextResponse(null, { status: 503, headers: NO_STORE })
  }

  let stamped: Uint8Array
  try {
    stamped = await stampPdf(source, {
      email: contactLabel(user),
      name: user.name,
      orderNumber: resolved.orderNumber,
      deliveryId,
      at: new Date(),
    })
  } catch (error) {
    // ملف تالف أو مشفّر: لا نسلّم نسخة بلا علامة.
    console.error('[schedules] watermarking failed', resolved.objectKey, error)
    await releaseReservation()
    return new NextResponse(null, { status: 503, headers: NO_STORE })
  }

  const filename = `${resolved.slug}-${resolved.orderNumber}.pdf`
  if (mode === 'view') {
    // بايتات للعارض فقط: نوع عام بلا اسم ملف، فلا يعرضه المتصفح كـ PDF قابل للحفظ.
    return new NextResponse(Buffer.from(stamped), {
      status: 200,
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(stamped.byteLength),
        'Content-Disposition': 'inline',
      },
    })
  }

  return new NextResponse(Buffer.from(stamped), {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/pdf',
      'Content-Length': String(stamped.byteLength),
      'Content-Disposition': contentDisposition(filename),
    },
  })
}
