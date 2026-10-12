/**
 * أنواع الإشعارات وقنواتها الافتراضية.
 *
 * كل نوع له مفتاحا ترجمة: `notif_<type>_t` (العنوان) و`notif_<type>_b`
 * (النص، بمعاملات `params`). القنوات هنا هي الافتراضية؛ واتساب يُرسل فقط لمن
 * وافق (`users.whatsapp_opt_in`) وله رقم، وفقط إن كان قالب Meta مُعدّاً.
 */

export const USER_NOTIFICATION_TYPES = {
  new_device_login: { email: true, whatsapp: true },
  order_paid: { email: false /* order_confirmation يُرسل أصلاً */, whatsapp: true },
  plan_activated: { email: true, whatsapp: true },
  plan_expiring: { email: true, whatsapp: true },
  custom_status: { email: true, whatsapp: false },
  custom_pdf_ready: { email: true, whatsapp: true },
  /** الوثيقة 5.4: "إرسال رسالة واتساب عند اكتمال الجدول". */
  custom_completed: { email: true, whatsapp: true },
  /** سياسة "warn": جهاز جديد فوق حد الباقة — اقتراح الترقية (الوثيقة 14.2). */
  device_limit_warning: { email: true, whatsapp: false },
  /** الإدارة وافقت على جهاز كان معلّقاً (سياسة require_approval). */
  device_approved: { email: true, whatsapp: false },
  /**
   * رسالة يكتبها المدير (الوثيقة 2.5: "إرسال إشعارات"). القنوات يختارها المدير
   * عند الإرسال؛ واتساب يصل فقط لمن وافق وبقالب `bali_admin_message`.
   */
  admin_message: { email: false, whatsapp: false },
  /** أُضيف إلى باقة عائلية (الوثيقة 13.3). */
  family_added: { email: true, whatsapp: false },
} as const

export const STAFF_NOTIFICATION_TYPES = {
  staff_order_paid: { email: false, whatsapp: false },
  staff_custom_request: { email: true, whatsapp: true },
  staff_contact_message: { email: true, whatsapp: false },
  staff_security_alert: { email: true, whatsapp: true },
  staff_payment_failed: { email: true, whatsapp: false },
  /** الوثيقة 4.3: "دخول من جهاز جديد لمستخدم مدفوع". */
  staff_paid_new_device: { email: false, whatsapp: false },
  /** جهاز جديد ينتظر موافقة الإدارة (الوثيقة 14.2). */
  staff_device_approval: { email: true, whatsapp: false },
} as const

export type UserNotificationType = keyof typeof USER_NOTIFICATION_TYPES
export type StaffNotificationType = keyof typeof STAFF_NOTIFICATION_TYPES
export type NotificationType = UserNotificationType | StaffNotificationType

export type NotificationParams = Record<string, string | number>

/**
 * ترتيب معاملات قالب واتساب لكل نوع. قوالب Meta تأخذ `{{1}}`, `{{2}}`… بالترتيب،
 * فيجب أن يطابق هذا الترتيب نص القالب المعتمد في Business Manager.
 */
export const WHATSAPP_PARAM_ORDER: Partial<Record<NotificationType, readonly string[]>> = {
  new_device_login: ['device', 'when'],
  order_paid: ['orderNumber'],
  plan_activated: ['plan'],
  plan_expiring: ['plan', 'date'],
  custom_pdf_ready: ['name'],
  custom_completed: ['name'],
  admin_message: ['body'],
  staff_custom_request: ['name', 'travellers'],
  staff_security_alert: ['rule', 'subject'],
}

export function isNotificationType(value: string): value is NotificationType {
  return value in USER_NOTIFICATION_TYPES || value in STAFF_NOTIFICATION_TYPES
}
