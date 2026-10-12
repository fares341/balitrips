/**
 * القيم الافتراضية لإعدادات الأمان من متغيرات البيئة.
 *
 * المصدر الفعلي هو إعداد `security` في `site_settings` (يُعدَّل من
 * Studio → Protection). هذه الدوال تعطي القيمة الافتراضية عندما لا يوجد صف
 * بعد، لذا يبقى سلوك الدفعة الأولى (المبني على env) كما هو حتى يغيّره مشغّل.
 *
 * لا استيرادات هنا عمداً: يستورده كلٌّ من settings.ts وdevices.ts.
 */

/**
 * الوثيقة 14.2 — إذا حاول المستخدم الدخول من جهاز جديد فوق الحد:
 * يُمنع (`block`)، أو يُسجَّل خروج الجهاز القديم (`evict_oldest`)، أو يحتاج
 * موافقة الإدارة (`require_approval`)، أو تظهر له رسالة للترقية (`warn`).
 */
export const NEW_DEVICE_POLICIES = ['block', 'evict_oldest', 'require_approval', 'warn'] as const
export type NewDevicePolicy = (typeof NEW_DEVICE_POLICIES)[number]

export const PDF_DOWNLOAD_MODES = ['allow', 'view_only'] as const
export type PdfDownloadMode = (typeof PDF_DOWNLOAD_MODES)[number]

export const FALLBACK_DEVICE_LIMIT = 2
export const MAX_DEVICE_LIMIT = 50

export function newDevicePolicy(): NewDevicePolicy {
  const raw = process.env.SECURITY_NEW_DEVICE_POLICY?.trim()
  return (NEW_DEVICE_POLICIES as readonly string[]).includes(raw ?? '')
    ? (raw as NewDevicePolicy)
    : 'block'
}

export function defaultDeviceLimit(): number {
  const raw = Number.parseInt(process.env.DEFAULT_DEVICE_LIMIT ?? '', 10)
  if (!Number.isFinite(raw) || raw < 1) return FALLBACK_DEVICE_LIMIT
  return Math.min(raw, MAX_DEVICE_LIMIT)
}
