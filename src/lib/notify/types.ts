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
} as const

export const STAFF_NOTIFICATION_TYPES = {
  staff_order_paid: { email: false, whatsapp: false },
  staff_custom_request: { email: true, whatsapp: true },
  staff_contact_message: { email: true, whatsapp: false },
  staff_security_alert: { email: true, whatsapp: true },
  staff_payment_failed: { email: true, whatsapp: false },
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
  staff_custom_request: ['name', 'travellers'],
  staff_security_alert: ['rule', 'subject'],
}

export function isNotificationType(value: string): value is NotificationType {
  return value in USER_NOTIFICATION_TYPES || value in STAFF_NOTIFICATION_TYPES
}
