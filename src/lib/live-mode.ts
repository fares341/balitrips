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

/** رموز مشاكل الإعداد في الوضع الحقيقي — Studio يعرضها بلغة صاحب العمل. */
export type LiveModeIssue =
  | 'sandbox_payments'
  | 'admin_2fa_off'
  | 'no_payments'
  | 'no_email'
  | 'no_storage'

export interface LiveModeWarning {
  code: LiveModeIssue
  /** النص التقني للفريق التقني (والسجل عند الإقلاع). */
  text: string
}

/** تحذيرات إعداد تُطبع عند الإقلاع (worker) وتُعرض في Studio. */
export function liveModeIssues(): LiveModeWarning[] {
  const issues: LiveModeWarning[] = []
  if (!isLiveMode()) return issues
  if (process.env.ALLOW_SANDBOX_PAYMENTS === 'true') {
    issues.push({
      code: 'sandbox_payments',
      text: 'ALLOW_SANDBOX_PAYMENTS=true is ignored in LIVE_MODE — remove it.',
    })
  }
  if (process.env.DISABLE_ADMIN_2FA === 'true') {
    issues.push({
      code: 'admin_2fa_off',
      text: 'DISABLE_ADMIN_2FA=true is ignored in LIVE_MODE — remove it.',
    })
  }
  const provider = process.env.PAYMENT_PROVIDER ?? 'none'
  if (provider === 'sandbox' || provider === 'none') {
    issues.push({
      code: 'no_payments',
      text: `PAYMENT_PROVIDER=${provider} cannot take real payments in LIVE_MODE.`,
    })
  }
  if (!process.env.RESEND_API_KEY) {
    issues.push({
      code: 'no_email',
      text: 'RESEND_API_KEY is empty — password reset and receipts will not be emailed.',
    })
  }
  if (!process.env.SPACES_KEY || !process.env.SPACES_SECRET) {
    issues.push({
      code: 'no_storage',
      text: 'SPACES_KEY/SPACES_SECRET are empty — PDFs and uploads cannot be stored.',
    })
  }
  return issues
}

/** النصوص التقنية فقط (سجل الإقلاع). */
export function liveModeWarnings(): string[] {
  return liveModeIssues().map((issue) => issue.text)
}

/** يُسمح بالدفع الوهمي؟ أبداً في الوضع الحقيقي. */
export function sandboxPaymentsAllowed(): boolean {
  return !isLiveMode() && process.env.ALLOW_SANDBOX_PAYMENTS === 'true'
}
