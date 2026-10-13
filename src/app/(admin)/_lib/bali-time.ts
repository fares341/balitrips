/**
 * Event dates in the Studio are typed in Bali time (WITA, UTC+8, no DST)
 * through `<input type="datetime-local">`, whatever the editor's own timezone.
 */
import { fstr } from './form'

/** Form value → Date. Empty → null. */
export function fbaliDateTime(form: FormData, name: string, label: string): Date | null {
  const raw = fstr(form, name)
  if (raw === null) return null
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(raw)
  if (!match) throw new Error(`${label} must be a date and time`)
  const date = new Date(`${match[1]}T${match[2]}:00+08:00`)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a date and time`)
  return date
}

/** Both event fields, checked together: an end needs a start and cannot precede it. */
export function feventRange(form: FormData): {
  eventStartsAt: Date | null
  eventEndsAt: Date | null
} {
  const eventStartsAt = fbaliDateTime(form, 'eventStartsAt', 'Event start')
  const eventEndsAt = fbaliDateTime(form, 'eventEndsAt', 'Event end')
  if (eventEndsAt !== null && eventStartsAt === null) {
    throw new Error('An event end needs an event start')
  }
  if (eventStartsAt !== null && eventEndsAt !== null && eventEndsAt < eventStartsAt) {
    throw new Error('The event cannot end before it starts')
  }
  return { eventStartsAt, eventEndsAt }
}

/** Stored instant → `datetime-local` value in Bali time. */
export function baliInputValue(value: Date | null | undefined): string {
  if (value === null || value === undefined) return ''
  return new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}
