/**
 * رقم الجوال بصيغة دولية موحّدة: `+` ثم 8–15 رقماً (E.164 تقريباً).
 *
 * الوثيقة 3.1/3.2: التسجيل والدخول برقم الجوال + كلمة المرور. الرقم يجب أن يبدأ
 * بـ `+` أو `00` — رقم محلي بلا رمز الدولة لا يمكن تمييزه بين بلدين، فلا نخمّن.
 *
 * يُستخدم في المتصفح (النماذج) والخادم (Better Auth). التحقق حسب الدولة من
 * `libphonenumber-js/min` (بيانات أطوال وبدايات الأرقام لكل دولة).
 */
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min'

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = toAsciiDigits(raw).trim()
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

/** الدول الأكثر استخداماً أولاً في قائمة الاختيار (الخليج، ثم أكثر الأسواق). */
const PRIORITY: readonly CountryCode[] = [
  'SA',
  'AE',
  'KW',
  'QA',
  'BH',
  'OM',
  'EG',
  'JO',
  'IQ',
  'LB',
  'MA',
  'DZ',
  'TN',
  'ID',
  'MY',
  'SG',
  'TR',
  'PK',
  'IN',
  'GB',
  'DE',
  'FR',
  'NL',
  'US',
  'AU',
]

/** كل دول العالم مع مفتاحها، الأكثر استخداماً أولاً ثم الباقي أبجدياً بالرمز. */
export const DIAL_CODES: readonly { iso: CountryCode; dial: string }[] = [
  ...PRIORITY,
  ...getCountries()
    .filter((c) => !PRIORITY.includes(c))
    .sort(),
].map((iso) => ({ iso, dial: getCountryCallingCode(iso) }))

export function isCountry(value: string | null | undefined): value is CountryCode {
  return typeof value === 'string' && (getCountries() as string[]).includes(value)
}

export function dialOf(iso: string): string {
  return isCountry(iso) ? getCountryCallingCode(iso) : ''
}

/**
 * رقم كما كتبه الزائر + الدولة المختارة ⇒ ‎+E.164 إن كان رقماً صحيحاً لتلك
 * الدولة (أو لأي دولة إن كتبه بـ + أو 00)، وإلا null.
 *
 * يقبل: 0501234567 أو 50 123 4567 مع السعودية، 966501234567 بلا +، ‎+966…،
 * 00966…، وأرقاماً عربية/فارسية (٠٥٠…).
 */
export function toE164(raw: string | null | undefined, iso: string): string | null {
  if (!raw) return null
  const t = toAsciiDigits(raw).trim()
  if (t === '' || !/^[+0-9][0-9 ()./-]*$/.test(t)) return null
  const intl = t.startsWith('00') ? `+${t.slice(2)}` : t
  const country = isCountry(iso) ? iso : undefined
  const parsed = parsePhoneNumberFromString(intl, country)
  if (parsed?.isValid()) return parsed.number
  // The country code typed without "+": 966501234567.
  if (!intl.startsWith('+')) {
    const withPlus = parsePhoneNumberFromString(`+${intl.replace(/\D/g, '')}`)
    if (withPlus?.isValid()) return withPlus.number
  }
  return null
}

/** هل الرقم الدولي صحيح فعلاً (طول وبداية صحيحان لدولته)؟ */
export function isValidE164(value: string): boolean {
  return parsePhoneNumberFromString(toAsciiDigits(value).trim())?.isValid() === true
}

/** دولة رقم دولي، إن عُرفت. */
export function countryOfE164(value: string): CountryCode | undefined {
  return parsePhoneNumberFromString(value)?.country
}

/** للعرض: ‎+966 50 123 4567. */
export function formatE164(value: string): string {
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value
}

/** خانة الدخول: بريد كما هو، وجوال ⇒ E.164 حسب الدولة (أو الطريقة القديمة لحسابات قديمة). */
export function withCountry(raw: string, iso: string): string {
  const t = toAsciiDigits(raw).trim()
  if (!isPhoneLike(t)) return raw.trim()
  return toE164(t, iso) ?? withDialCode(t, dialOf(iso))
}

/** ٠١٢٣ / ۰۱۲۳ ⇒ 0123. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/** الدولة الافتراضية: منطقة المتصفح (ar-SA ⇒ SA)، وإلا حسب لغة الصفحة. */
export function guessCountry(locale: string, browserLanguages?: readonly string[]): CountryCode {
  for (const tag of browserLanguages ?? []) {
    const region = tag.split(/[-_]/)[1]?.toUpperCase()
    if (isCountry(region)) return region
  }
  return locale === 'id' ? 'ID' : 'SA'
}

/**
 * الأشكال التي قد يكون الرقم محفوظاً بها في حسابات قديمة، للبحث عند الدخول:
 * كما كُتب، وبصيغته الصحيحة، وبصفر محلي زائد بعد رمز الدولة (+9660501234567)،
 * وهو ما كان يقبله التسجيل القديم.
 */
export function phoneLookupCandidates(identifier: string): string[] {
  const out = new Set<string>()
  const loose = normalizePhone(identifier)
  if (loose) out.add(loose)
  const parsed = parsePhoneNumberFromString(toAsciiDigits(identifier).trim())
  if (parsed?.isValid()) {
    out.add(parsed.number)
    out.add(`+${parsed.countryCallingCode}0${parsed.nationalNumber}`)
  } else if (loose) {
    // +9660501234567 typed today: also find the account under +966501234567.
    const fixed = parsePhoneNumberFromString(loose.replace(/^(\+\d{1,3}?)0/, '$1'))
    if (fixed?.isValid()) out.add(fixed.number)
  }
  return [...out]
}
