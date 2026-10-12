/** حالات الطلب المخصص (الوثيقة، القسم 8) ورسائل التواصل. */

export const TRIP_STATUSES = [
  'new',
  'under_review',
  'in_progress',
  'waiting_approval',
  'completed',
  'rejected',
] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

export const CONTACT_STATUSES = ['new', 'read', 'replied', 'closed'] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

export const LEAD_TONES: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  new: 'warn',
  under_review: 'info',
  in_progress: 'info',
  waiting_approval: 'warn',
  completed: 'good',
  rejected: 'bad',
  read: 'neutral',
  replied: 'good',
  closed: 'neutral',
}
