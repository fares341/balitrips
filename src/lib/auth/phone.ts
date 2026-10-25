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

/**
 * خانة الدخول الذكية: أي حرف أو @ = بريد. أرقام فقط = جوال.
 * الجوال بلا + أو 00 يأخذ مفتاح الدولة المختار تلقائياً (يُحذف صفر البداية المحلي:
 * 0501234567 مع ‎+966 ⇒ ‎+966501234567). ومن كتب الرقم ومعه رمز الدولة بلا + (966501234567) يُقبل كما هو.
 */
export function isPhoneLike(value: string): boolean {
  const t = value.trim()
  return t !== '' && !looksLikeEmail(t) && /^[+0-9][0-9 ()./-]*$/.test(t)
}

export function hasIntlPrefix(value: string): boolean {
  const t = value.trim()
  return t.startsWith('+') || t.startsWith('00')
}

/** بريد ⇒ كما هو. جوال ⇒ ‎+رمز الدولة والرقم (E.164)، أو النص كما هو إن لم يصلح (فتظهر رسالة الخطأ). */
export function withDialCode(raw: string, dial: string): string {
  const t = raw.trim()
  if (!isPhoneLike(t)) return t
  if (hasIntlPrefix(t)) return normalizePhone(t) ?? t
  const code = dial.replace(/\D/g, '')
  let digits = t.replace(/\D/g, '')
  // Already typed with the country code but without "+": 966501234567.
  if (code && digits.startsWith(code) && digits.length - code.length >= 8)
    return normalizePhone(`+${digits}`) ?? t
  digits = digits.replace(/^0+/, '')
  return normalizePhone(`+${code}${digits}`) ?? t
}

/** للعرض فقط: ‎+966 50 123 4567. */
export function formatIntl(e164: string, dial: string): string {
  const code = dial.replace(/\D/g, '')
  const digits = e164.replace(/\D/g, '')
  const cc =
    code && digits.startsWith(code) ? code : digits.slice(0, Math.min(3, digits.length - 7))
  const rest = digits.slice(cc.length)
  const groups =
    rest.length > 7
      ? [rest.slice(0, rest.length - 7), rest.slice(-7, -4), rest.slice(-4)]
      : [rest.slice(0, -4), rest.slice(-4)]
  return `+${cc} ${groups.filter(Boolean).join(' ')}`
}

/** مفاتيح الدول في قائمة الاختيار (الخليج أولاً، ثم أكثر الأسواق؛ أي دولة أخرى تُكتب بـ + أو 00). */
export const DIAL_CODES: readonly { iso: string; dial: string }[] = [
  { iso: 'SA', dial: '966' },
  { iso: 'AE', dial: '971' },
  { iso: 'KW', dial: '965' },
  { iso: 'QA', dial: '974' },
  { iso: 'BH', dial: '973' },
  { iso: 'OM', dial: '968' },
  { iso: 'EG', dial: '20' },
  { iso: 'JO', dial: '962' },
  { iso: 'IQ', dial: '964' },
  { iso: 'LB', dial: '961' },
  { iso: 'MA', dial: '212' },
  { iso: 'DZ', dial: '213' },
  { iso: 'TN', dial: '216' },
  { iso: 'ID', dial: '62' },
  { iso: 'MY', dial: '60' },
  { iso: 'SG', dial: '65' },
  { iso: 'TR', dial: '90' },
  { iso: 'PK', dial: '92' },
  { iso: 'IN', dial: '91' },
  { iso: 'GB', dial: '44' },
  { iso: 'DE', dial: '49' },
  { iso: 'FR', dial: '33' },
  { iso: 'NL', dial: '31' },
  { iso: 'US', dial: '1' },
  { iso: 'AU', dial: '61' },
]
