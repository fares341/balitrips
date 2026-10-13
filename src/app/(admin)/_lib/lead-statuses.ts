/**
 * حالات الطلب المخصص — كما في الوثيقة (5.3) حرفياً:
 * جديد، تحت المراجعة، قيد التنفيذ، بانتظار رد العميل، مكتمل، ملغي.
 * الهجرة 0008 تنقل القديمة (waiting_approval → waiting_customer، rejected → cancelled).
 */
export const TRIP_STATUSES = [
  'new',
  'under_review',
  'in_progress',
  'waiting_customer',
  'completed',
  'cancelled',
] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

export const CONTACT_STATUSES = ['new', 'read', 'replied', 'closed'] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

export const LEAD_TONES: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  new: 'warn',
  under_review: 'info',
  in_progress: 'info',
  waiting_customer: 'warn',
  completed: 'good',
  cancelled: 'bad',
  read: 'neutral',
  replied: 'good',
  closed: 'neutral',
}

/** Dictionary key (`_i18n/common.ts`) for a trip-request or contact status label. */
export const LEAD_STATUS_KEYS: Record<string, string> = {
  new: 'ui.lead_new',
  under_review: 'ui.lead_under_review',
  in_progress: 'ui.lead_in_progress',
  waiting_customer: 'ui.lead_waiting_customer',
  completed: 'ui.lead_completed',
  cancelled: 'ui.lead_cancelled',
  read: 'ui.lead_read',
  replied: 'ui.lead_replied',
  closed: 'ui.lead_closed',
}
