/**
 * رقم الجوال بصيغة دولية موحّدة: `+` ثم 8–15 رقماً (E.164 تقريباً).
 *
 * الوثيقة 3.1/3.2: التسجيل والدخول برقم الجوال + كلمة المرور. الرقم يجب أن يبدأ
 * بـ `+` أو `00` — رقم محلي بلا رمز الدولة لا يمكن تمييزه بين بلدين، فلا نخمّن.
 *
 * بلا استيرادات: يُستخدم في المتصفح (النماذج) والخادم (Better Auth).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) return null
  if (!/^[+0-9][0-9 ()./-]*$/.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, '')
  const national = trimmed.startsWith('00') ? digits.slice(2) : digits
  if (national.length < 8 || national.length > 15 || national.startsWith('0')) return null
  return `+${national}`
}

/** هل النص بريد إلكتروني (لا رقم جوال)؟ — للتمييز في خانة الدخول الموحّدة. */
export function looksLikeEmail(value: string): boolean {
  return value.includes('@')
}

/**
 * التسجيل بالجوال وحده (الوثيقة 3.1: "رقم الجوال + كلمة مرور").
 *
 * Better Auth يبني الحساب على البريد، فحساب الجوال يأخذ بريداً بديلاً ثابتاً مشتقاً
 * من الرقم في نطاق `.invalid` (RFC 2606: لا يُسلَّم إليه أي بريد أبداً). لا يُرسل
 * إليه شيء (`isPlaceholderEmail` في ناقل البريد)، ويُعرض في الواجهة كـ "لا بريد".
 */
export const PHONE_EMAIL_DOMAIN = 'phone.balitrips.invalid'

export function placeholderEmailFor(normalizedPhone: string): string {
  return `p${normalizedPhone.replace(/\D/g, '')}@${PHONE_EMAIL_DOMAIN}`
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`)
}

/**
 * ما يُعرض للمستخدم أو يُطبع في العلامة المائية بدل البريد: الجوال لحساب
 * بالجوال وحده (البريد البديل لا يعني شيئاً لصاحبه)، وإلا البريد.
 */
export function contactLabel(user: { email: string; phone?: string | null }): string {
  if (!isPlaceholderEmail(user.email)) return user.email
  return user.phone?.trim() || user.email.slice(0, user.email.indexOf('@')).replace(/^p/, '+')
}
