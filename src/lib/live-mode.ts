/**
 * وضع التشغيل الحقيقي (`LIVE_MODE=true`) — خادم يأخذ أموالاً حقيقية.
 *
 * فيه تُتجاهل مفاتيح الطوارئ الخاصة بالتطوير مهما كانت قيمتها:
 *  - `ALLOW_SANDBOX_PAYMENTS` — دفع وهمي يُنشئ طلبات "مدفوعة" بلا مال.
 *  - `DISABLE_ADMIN_2FA` — لوحة تحكم تحمي الاسترداد والأسعار وبيانات العملاء
 *    بكلمة مرور فقط.
 *
 * كانت بيئة الإنتاج تضبط الاثنين معاً. المفتاح هنا يجعل الخطأ مستحيلاً:
 * نسيان إزالة سطر من ملف البيئة لا يفتح ثغرة على الخادم الحقيقي.
 *
 * يُقرأ وقت التشغيل (لا NODE_ENV الذي يثبّته Next وقت البناء).
 */
export function isLiveMode(): boolean {
  return process.env.LIVE_MODE === 'true'
}

/** تحذيرات إعداد تُطبع عند الإقلاع (worker) وتُعرض في Studio. */
export function liveModeWarnings(): string[] {
  const warnings: string[] = []
  if (!isLiveMode()) return warnings
  if (process.env.ALLOW_SANDBOX_PAYMENTS === 'true') {
    warnings.push('ALLOW_SANDBOX_PAYMENTS=true is ignored in LIVE_MODE — remove it.')
  }
  if (process.env.DISABLE_ADMIN_2FA === 'true') {
    warnings.push('DISABLE_ADMIN_2FA=true is ignored in LIVE_MODE — remove it.')
  }
  const provider = process.env.PAYMENT_PROVIDER ?? 'none'
  if (provider === 'sandbox' || provider === 'none') {
    warnings.push(`PAYMENT_PROVIDER=${provider} cannot take real payments in LIVE_MODE.`)
  }
  if (!process.env.RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY is empty — password reset and receipts will not be emailed.')
  }
  if (!process.env.SPACES_KEY || !process.env.SPACES_SECRET) {
    warnings.push('SPACES_KEY/SPACES_SECRET are empty — PDFs and uploads cannot be stored.')
  }
  return warnings
}

/** يُسمح بالدفع الوهمي؟ أبداً في الوضع الحقيقي. */
export function sandboxPaymentsAllowed(): boolean {
  return !isLiveMode() && process.env.ALLOW_SANDBOX_PAYMENTS === 'true'
}
