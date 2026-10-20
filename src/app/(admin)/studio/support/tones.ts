import type { PillTone } from '../../_ui/table'

export const STATUS_TONES: Record<string, PillTone> = {
  open: 'warn',
  pending_customer: 'info',
  resolved: 'good',
  closed: 'neutral',
}

export const PRIORITY_TONES: Record<string, PillTone> = {
  low: 'neutral',
  normal: 'info',
  high: 'warn',
  urgent: 'bad',
}
