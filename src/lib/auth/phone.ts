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
