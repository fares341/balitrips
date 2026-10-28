/**
 * Team WhatsApp alerts through Mazbot (owner, Oct 2026) — the text, pure.
 *
 * Staff notifications go by email to `STAFF_ALERT_EMAILS` (else every admin).
 * When Studio → WhatsApp has «رقم تنبيهات الفريق» and Mazbot is connected,
 * the booking alerts below also go to that number as a plain message. Other
 * staff types keep the older Meta-template path (`STAFF_WHATSAPP_NUMBER`).
 */

import type { NotificationParams } from './types'

/** Staff types sent to the team number. */
export const TEAM_WHATSAPP_TYPES = [
  'staff_order_authorized',
  'staff_authorization_reminder',
  'staff_custom_request',
] as const
export type TeamWhatsappType = (typeof TEAM_WHATSAPP_TYPES)[number]

export function isTeamWhatsappType(value: string): value is TeamWhatsappType {
  return (TEAM_WHATSAPP_TYPES as readonly string[]).includes(value)
}

function value(params: NotificationParams, key: string): string {
  const raw = params[key]
  return raw === undefined || raw === null || String(raw).trim() === '' ? '-' : String(raw)
}

/** The Arabic message (the team works in Arabic), with the Studio link last. */
export function teamWhatsappText(
  type: TeamWhatsappType,
  params: NotificationParams,
  url: string | null,
): string {
  const lines: string[] = []
  if (type === 'staff_order_authorized') {
    lines.push(
      '🔔 حجز جديد بانتظار تأكيد المشغّل',
      `الطلب: ${value(params, 'orderNumber')} (${value(params, 'total')})`,
      'المبلغ محجوز على البطاقة ولم يُسحب. أكّد مع المشغّل ثم اضغط «أكد المورد — اسحب المبلغ»، أو «رفض المورد — فُك الحجز».',
      'يُفك الحجز تلقائيًا بعد 6 أيام بلا قرار.',
    )
  } else if (type === 'staff_authorization_reminder') {
    lines.push(
      '⏰ تذكير: حجز ما زال بانتظار تأكيد المشغّل',
      `الطلب: ${value(params, 'orderNumber')} (${value(params, 'total')})`,
      `باقٍ ${value(params, 'hoursLeft')} ساعة قبل فك الحجز تلقائيًا.`,
    )
  } else {
    lines.push(
      '📝 طلب رحلة مخصصة جديد',
      `الاسم: ${value(params, 'name')} · المسافرون: ${value(params, 'travellers')}`,
    )
  }
  if (url) lines.push('', url)
  return lines.join('\n')
}
