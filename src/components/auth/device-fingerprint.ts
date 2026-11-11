'use client'

/**
 * بصمة الجهاز — الجانب المتصفحي (نسخة متوافقة وآمنة مع متصفح سفاري وآبل).
 *
 * تُحسب من خصائص عامة للمتصفح (الشاشة، المنطقة الزمنية، اللغات، المنصة)
 * دون استخدام تقنيات Canvas أو WebGL لتجنب تحفيز تنبيهات الخصوصية في نظام iOS / Safari،
 * ثم تُجزّأ SHA-256، وتُكتب في كوكي `bt_dfp` بمسار `/api/auth` فقط قبل أي تسجيل دخول.
 */

const COOKIE = 'bt_dfp'
const MAX_AGE_SECONDS = 10 * 60

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function computeDeviceFingerprint(): Promise<string> {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const parts = [
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(window.devicePixelRatio || 1),
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    (nav.languages ?? [nav.language ?? '']).join(','),
    nav.platform ?? '',
    String(nav.maxTouchPoints ?? 0),
  ]
  return sha256Hex(parts.join('||'))
}

/**
 * اكتب الكوكي قبل استدعاء signIn/signUp.
 */
export async function prepareDeviceCookie(): Promise<void> {
  try {
    const fp = await computeDeviceFingerprint()
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE}=${fp}; Path=/api/auth; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`
  } catch {
    // يُكمل الدخول بدون بصمة.
  }
}
