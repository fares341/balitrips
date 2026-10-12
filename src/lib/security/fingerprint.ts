/**
 * بصمة الجهاز — الجانب الخادمي.
 *
 * المتصفح يحسب بصمة من خصائصه (انظر src/components/auth/device-fingerprint.ts)
 * ويضعها في كوكي قصير العمر مقصور على `/api/auth` قبل كل تسجيل دخول. هنا
 * تُدمج مع عائلة المتصفح ونظام التشغيل المستخرجين من User-Agent وتُجزّأ:
 *
 *     hash = sha256("v1|" + clientFingerprint + "|" + browser + "|" + os)
 *
 * لماذا الدمج؟ البصمة القادمة من العميل قيمة يستطيع المهاجم اختيارها. دمج
 * المتصفح/النظام يعني أن نسخ كوكي جهاز إلى جهاز مختلف كلياً لا يكفي لانتحاله.
 * ولماذا ليس User-Agent كاملاً؟ لأن رقم إصدار المتصفح يتغير مع كل تحديث،
 * وكل تحديث سيبدو "جهازاً جديداً".
 *
 * ⚠︎ البصمة تقلل المشاركة ولا تمنعها 100% — هذا مذكور في الوثيقة نفسها.
 */

import { createHash } from 'node:crypto'

/** اسم الكوكي، ومساره `/api/auth` فقط كي لا يُرسل مع الصفحات القابلة للتخزين المؤقت. */
export const DEVICE_COOKIE = 'bt_dfp'

const CLIENT_FP = /^[a-f0-9]{64}$/

export interface ParsedAgent {
  browser: string
  os: string
}

/** تحليل خفيف لـ User-Agent — يكفي للعرض وللبصمة، وليس مكتبة كاملة. */
export function parseUserAgent(ua: string | null | undefined): ParsedAgent {
  const agent = ua ?? ''

  let os = 'Unknown'
  if (/iPhone|iPad|iPod/i.test(agent)) os = 'iOS'
  else if (/Android/i.test(agent)) os = 'Android'
  else if (/Windows/i.test(agent)) os = 'Windows'
  else if (/Mac OS X|Macintosh/i.test(agent)) os = 'macOS'
  else if (/CrOS/i.test(agent)) os = 'ChromeOS'
  else if (/Linux/i.test(agent)) os = 'Linux'

  // الترتيب مهم: Edge وOpera وSamsung يضعون "Chrome" في نصهم أيضاً.
  let browser = 'Unknown'
  if (/Edg\//i.test(agent)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(agent)) browser = 'Opera'
  else if (/SamsungBrowser/i.test(agent)) browser = 'Samsung Internet'
  else if (/Firefox|FxiOS/i.test(agent)) browser = 'Firefox'
  else if (/Chrome|CriOS/i.test(agent)) browser = 'Chrome'
  else if (/Safari/i.test(agent)) browser = 'Safari'

  return { browser, os }
}

export const DEVICE_TYPES = ['mobile', 'tablet', 'desktop'] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

/**
 * نوع الجهاز من User-Agent (الوثيقة 3.2). iPad بنظام iPadOS 13+ يرسل User-Agent
 * ماك افتراضياً فيظهر "desktop" — حدود معروفة لأي تحليل من جهة الخادم.
 */
export function parseDeviceType(ua: string | null | undefined): DeviceType {
  const agent = ua ?? ''
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(agent)) return 'tablet'
  // أندرويد بلا "Mobile" = جهاز لوحي (اتفاقية Google لـ User-Agent).
  if (/Android/i.test(agent) && !/Mobile/i.test(agent)) return 'tablet'
  if (/Mobi|iPhone|iPod|Android|Windows Phone|IEMobile|Opera Mini/i.test(agent)) return 'mobile'
  return 'desktop'
}

/** المتصفح + النظام + نوع الجهاز — لتفاصيل سجل النشاط. */
export function describeAgent(
  ua: string | null | undefined,
): ParsedAgent & { deviceType: DeviceType } {
  return { ...parseUserAgent(ua), deviceType: parseDeviceType(ua) }
}

/**
 * هل الطلبان من نفس عائلة المتصفح ونظام التشغيل؟ اسم المتصفح والنظام فقط، بلا
 * إصدارات (تحديث المتصفح لا يجعل الجلسة "مسروقة"). قيمة `Unknown` على أي طرف
 * لا تُقارن — لا نحكم بالسرقة على ما لا نعرفه.
 */
export function sameAgentFamily(
  stored: string | null | undefined,
  current: string | null | undefined,
): boolean {
  if (!stored || !current) return true
  const a = parseUserAgent(stored)
  const b = parseUserAgent(current)
  const browserDiffers =
    a.browser !== 'Unknown' && b.browser !== 'Unknown' && a.browser !== b.browser
  const osA = osFamily(a.os)
  const osB = osFamily(b.os)
  const osDiffers = osA !== 'Unknown' && osB !== 'Unknown' && osA !== osB
  return !browserDiffers && !osDiffers
}

/**
 * "Request desktop site" makes an iPad/iPhone send a macOS User-Agent and an
 * Android phone a Linux one, mid-session. Those pairs count as one family so
 * a single tap is not taken for a stolen cookie.
 */
function osFamily(os: string): string {
  if (os === 'iOS' || os === 'macOS') return 'Apple'
  if (os === 'Android' || os === 'Linux' || os === 'ChromeOS') return 'Linux'
  return os
}

export interface DeviceIdentity extends ParsedAgent {
  deviceType: DeviceType
  fingerprintHash: string
  /** لم تصل بصمة من المتصفح؛ الهوية مبنية على User-Agent وحده. */
  weak: boolean
}

export function deviceIdentity(
  clientFingerprint: string | null | undefined,
  userAgent: string | null | undefined,
): DeviceIdentity {
  const agent = parseUserAgent(userAgent)
  const client =
    typeof clientFingerprint === 'string' && CLIENT_FP.test(clientFingerprint)
      ? clientFingerprint
      : null

  const material =
    client === null ? `v1|weak|${userAgent ?? ''}` : `v1|${client}|${agent.browser}|${agent.os}`

  return {
    ...agent,
    deviceType: parseDeviceType(userAgent),
    fingerprintHash: createHash('sha256').update(material).digest('hex'),
    weak: client === null,
  }
}
