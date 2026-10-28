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
  /** انتهت الصلاحية فعلاً (مسح `notify.sweep`، مرة لكل صلاحية). */
  plan_expired: { email: true, whatsapp: true },
  /**
   * إنشاء حساب: داخل الموقع. البريد له رسالته الخاصة (`welcome` في طابور البريد)،
   * وواتساب يُفعَّل بالتجاوز لحساب الجوال وحده (لا بريد يصله) — لمن وافق فقط.
   */
  welcome: { email: false, whatsapp: false },
  /** استلام طلب الجدول المخصص (لصاحب الحساب؛ الضيف يصله بريد مباشر). */
  custom_received: { email: true, whatsapp: false },
  /** نسخة PDF جديدة لجدول جاهز اشتراه العميل (رفع يدوي من Studio). */
  itinerary_pdf_updated: { email: true, whatsapp: false },
  /** الوثيقة 19.1: تحديث حالة الطلب المخصص — داخل الموقع + بريد + واتساب. */
  custom_status: { email: true, whatsapp: true },
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
  /**
   * الوثيقة 15.1/19.1/20.1: الإدارة غيّرت حالة طلب حجز (تأكيد، تنفيذ بند، استرداد،
   * إلغاء). `status` نصّ الحالة بلغة العميل. عند الاسترداد يُطفأ البريد لأن
   * `refund_notice` هو بريد ذلك الحدث.
   */
  order_updated: { email: true, whatsapp: true },
  /**
   * Phase 5: a signed-in customer started checkout and did not pay. Only with
   * marketing consent, once per cart (src/lib/analytics/abandoned.ts).
   */
  checkout_reminder: { email: true, whatsapp: true },
  /**
   * الوثيقة 14.1: كل دخول ناجح من جهاز معروف — داخل الموقع فقط. الجهاز الجديد
   * يأخذ `new_device_login` (بريد + واتساب) بدلاً منه.
   */
  login_alert: { email: false, whatsapp: false },
  /**
   * محاولة دخول من جهاز جديد رُفضت (حد الأجهزة) أو عُلّقت لموافقة الإدارة.
   * مرة واحدة لكل جهاز في الساعة (`notifyBlockedSignIn` في src/lib/security/devices.ts).
   */
  device_blocked_attempt: { email: true, whatsapp: false },
  /** الوثيقة 13.1: سعر الجدول المخصص جاهز للدفع. */
  custom_quote: { email: true, whatsapp: true },
  /** الوثيقة 4.4: إرسال الجدول المخصص عبر واتساب (رابط العارض الآمن في الحساب). */
  pdf_ready_whatsapp: { email: false, whatsapp: true },
  /**
   * رسائل مصادقة تُرسل مباشرة (sendWhatsappTemplate) لا عبر notifyUser: لا صف في
   * جدول الإشعارات ولا طابور — تحمل رمزاً أو رابطاً صالحاً. قوالب Meta من فئة
   * "Authentication".
   */
  password_reset_whatsapp: { email: false, whatsapp: true },
  phone_otp: { email: false, whatsapp: true },
  /** Phase 4: the team answered a support ticket. */
  ticket_reply: { email: true, whatsapp: true },
  /** Phase 4: a support ticket was resolved — with the invitation to rate it. */
  ticket_resolved: { email: true, whatsapp: false },
  /** Phase 4: to a member of staff — a follow-up task is due today. */
  task_due: { email: true, whatsapp: false },
  /**
   * «أبلغني عند التوفر»: the activity can be booked again. Sent directly to the
   * contact the visitor gave (src/lib/notify/availability.ts), not via
   * `notifyUser`; listed here for its WhatsApp template and email text.
   */
  activity_available: { email: true, whatsapp: true },
} as const

export const STAFF_NOTIFICATION_TYPES = {
  staff_order_paid: { email: false, whatsapp: false },
  staff_custom_request: { email: true, whatsapp: true },
  staff_contact_message: { email: true, whatsapp: false },
  staff_security_alert: { email: true, whatsapp: true },
  staff_payment_failed: { email: true, whatsapp: false },
  /** Client, Oct 2026: a booking's card is held; confirm with the supplier and capture. */
  staff_order_authorized: { email: true, whatsapp: true },
  /**
   * Owner, Oct 2026: the same booking is still waiting for the operator after
   * 24 hours, then after 4 days (src/lib/orders/staff-reminders.ts, once per
   * stage). WhatsApp goes to «رقم تنبيهات الفريق» (Studio → WhatsApp).
   */
  staff_authorization_reminder: { email: true, whatsapp: true },
  /** Client, Oct 2026: a customer asks for a package (request, not a payment). */
  staff_package_request: { email: true, whatsapp: false },
  /** الوثيقة 4.3: "دخول من جهاز جديد لمستخدم مدفوع". */
  staff_paid_new_device: { email: false, whatsapp: false },
  /** جهاز جديد ينتظر موافقة الإدارة (الوثيقة 14.2). */
  staff_device_approval: { email: true, whatsapp: false },
  /** Phase 4: support. */
  staff_ticket_new: { email: true, whatsapp: false },
  staff_ticket_reply: { email: false, whatsapp: false },
  /** An urgent ticket has waited too long for a first answer. */
  staff_ticket_escalated: { email: true, whatsapp: true },
  /**
   * Phase 6 system alerts (src/lib/monitoring/alerts.ts, throttled per kind):
   * a stale backup, jobs that gave up, an error spike, payment notices not
   * processed, a supplier connection failing again and again.
   */
  staff_alert_backup: { email: true, whatsapp: false },
  staff_alert_jobs: { email: true, whatsapp: false },
  staff_alert_errors: { email: true, whatsapp: false },
  staff_alert_payment: { email: true, whatsapp: false },
  staff_alert_integration: { email: true, whatsapp: false },
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
  plan_expired: ['plan'],
  welcome: ['name'],
  custom_pdf_ready: ['name'],
  custom_completed: ['name'],
  custom_status: ['status'],
  order_updated: ['orderNumber', 'status'],
  checkout_reminder: ['name'],
  custom_quote: ['name', 'amount'],
  pdf_ready_whatsapp: ['name', 'link'],
  password_reset_whatsapp: ['link'],
  phone_otp: ['code'],
  activity_available: ['name', 'link'],
  admin_message: ['body'],
  staff_custom_request: ['name', 'travellers'],
  staff_security_alert: ['rule', 'subject'],
  ticket_reply: ['number'],
  staff_ticket_escalated: ['number', 'hours'],
}

export function isNotificationType(value: string): value is NotificationType {
  return value in USER_NOTIFICATION_TYPES || value in STAFF_NOTIFICATION_TYPES
}
