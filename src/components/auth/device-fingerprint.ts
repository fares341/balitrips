'use client'

/**
 * بصمة الجهاز — الجانب المتصفحي.
 *
 * تُحسب من خصائص مستقرة للمتصفح (الشاشة، المنطقة الزمنية، اللغات، المعالج،
 * الذاكرة، رسم Canvas، بطاقة الرسوميات عبر WebGL) ثم تُجزّأ SHA-256، وتُكتب
 * في كوكي `bt_dfp` بمسار `/api/auth` فقط قبل أي تسجيل دخول.
 *
 * لماذا كوكي وليس رأس طلب؟ لأن الدخول عبر Google/Apple ينتهي بتنقّل كامل من
 * موقع المزوّد إلى `/api/auth/callback/*` — لا يمكن إضافة رأس لذلك الطلب،
 * لكن كوكي `SameSite=Lax` بمسار `/api/auth` يُرسل معه.
 *
 * لماذا بدون FingerprintJS؟ النسخة المجانية الحالية بترخيص يقيّد الاستخدام
 * التجاري، وما نحتاجه هنا (هوية مستقرة لجهاز مستخدم شرعي، لا تعقّب) يكفيه هذا.
 */

const COOKIE = 'bt_dfp'
const MAX_AGE_SECONDS = 10 * 60

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function canvasSignal(): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 220
    canvas.height = 30
    const ctx = canvas.getContext('2d')
    if (ctx === null) return 'no-2d'
    ctx.textBaseline = 'top'
    ctx.font = "14px 'Arial'"
    ctx.fillStyle = '#f60'
    ctx.fillRect(100, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('Bali ✦ بالي 2026', 2, 15)
    return canvas.toDataURL()
  } catch {
    return 'canvas-error'
  }
}

function webglSignal(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')
    if (!(gl instanceof WebGLRenderingContext)) return 'no-webgl'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    if (info === null) return String(gl.getParameter(gl.RENDERER))
    return `${String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL))}|${String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))}`
  } catch {
    return 'webgl-error'
  }
}

export async function computeDeviceFingerprint(): Promise<string> {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const parts = [
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(window.devicePixelRatio),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    (nav.languages ?? [nav.language]).join(','),
    nav.platform ?? '',
    String(nav.hardwareConcurrency ?? ''),
    String(nav.deviceMemory ?? ''),
    String(nav.maxTouchPoints ?? 0),
    canvasSignal(),
    webglSignal(),
  ]
  return sha256Hex(parts.join('||'))
}

/**
 * اكتب الكوكي قبل استدعاء signIn/signUp. لا يرمي أبداً: متصفح بلا
 * `crypto.subtle` (http غير آمن) يدخل كجهاز "ضعيف" مبني على User-Agent.
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
