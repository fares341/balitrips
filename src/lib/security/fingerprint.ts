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

export interface DeviceIdentity extends ParsedAgent {
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
    fingerprintHash: createHash('sha256').update(material).digest('hex'),
    weak: client === null,
  }
}
