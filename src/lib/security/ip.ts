/**
 * عنوان IP الحقيقي للعميل.
 *
 * كل قرار أمني هنا (حظر IP، رصد تغيّر الشبكة) يعتمد على هذه الدالة، لذا هي
 * المكان الوحيد الذي يقرأ رؤوس الطلب لهذا الغرض.
 *
 * ترتيب الثقة:
 *  1. `TRUSTED_IP_HEADER` إن ضُبط (مثل `cf-connecting-ip` خلف Cloudflare).
 *     لا تضبطه إلا إذا كان الخادم الأصلي لا يقبل اتصالات إلا من Cloudflare،
 *     وإلا يستطيع أي شخص إرسال الرأس بنفسه.
 *  2. آخر قيمة في `x-forwarded-for`. Caddy بدون `trusted_proxies` يستبدل
 *     الرأس القادم من العميل بعنوان الاتصال الفعلي، فالقيمة الأخيرة هي ما
 *     كتبه Caddy. أخذ القيمة الأولى (كما يفعل الكثير) يعني الوثوق بما كتبه
 *     العميل.
 *  3. `x-real-ip`.
 */

type HeaderBag = Pick<Headers, 'get'>

const MAX_IP_LENGTH = 64

/** IPv4 أو IPv6 (مع إزالة المنفذ و`::ffff:`). أي شيء آخر يُرفض. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  let value = raw.trim()
  if (value === '' || value.length > MAX_IP_LENGTH) return null

  // [::1]:443 → ::1
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed?.[1] !== undefined) value = bracketed[1]

  // 1.2.3.4:5678 → 1.2.3.4
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value)
  if (v4port?.[1] !== undefined) value = v4port[1]

  if (value.toLowerCase().startsWith('::ffff:') && value.includes('.')) value = value.slice(7)

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split('.').every((part) => Number(part) <= 255) ? value : null
  }
  if (/^[0-9a-fA-F:]+$/.test(value) && value.includes(':')) return value.toLowerCase()
  return null
}

export function clientIp(headers: HeaderBag): string | null {
  const trusted = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase()
  if (trusted !== undefined && trusted !== '') {
    const ip = normalizeIp(headers.get(trusted))
    if (ip !== null) return ip
  }

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded !== null) {
    const parts = forwarded.split(',')
    const ip = normalizeIp(parts[parts.length - 1])
    if (ip !== null) return ip
  }

  return normalizeIp(headers.get('x-real-ip'))
}

/**
 * الدولة التقريبية للطلب (الوثيقة 3.2: "الموقع التقريبي إن أمكن").
 *
 * بلا قاعدة GeoIP على الخادم: نقرأ رأس الدولة الذي يضيفه الـ CDN —
 * `cf-ipcountry` لـ Cloudflare افتراضياً، أو ما يحدده `GEO_COUNTRY_HEADER`.
 * معلومة للعرض والمراجعة فقط، لا لقرار أمني (يمكن تزويرها دون CDN أمام الخادم).
 */
export function requestCountry(headers: HeaderBag): string | null {
  const name = process.env.GEO_COUNTRY_HEADER?.trim().toLowerCase() || 'cf-ipcountry'
  const value = headers.get(name)?.trim().toUpperCase() ?? ''
  // XX = غير معروف؛ T1 = شبكة Tor عند Cloudflare (يُحتفظ به — مفيد للمراجعة).
  return /^[A-Z][A-Z0-9]$/.test(value) && value !== 'XX' ? value : null
}
