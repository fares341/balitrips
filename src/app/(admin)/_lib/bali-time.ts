/**
 * Event dates in the Studio are typed in Bali time (WITA, UTC+8, no DST)
 * through `<input type="datetime-local">`, whatever the editor's own timezone.
 */
import { FormError, fstr } from './form'

/** Form value → Date. Empty → null. */
export function fbaliDateTime(form: FormData, name: string, label: string): Date | null {
  const raw = fstr(form, name)
  if (raw === null) return null
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(raw)
  if (!match) throw new FormError(`${label} must be a date and time`, 'form.datetime', { label })
  const date = new Date(`${match[1]}T${match[2]}:00+08:00`)
  if (Number.isNaN(date.getTime())) {
    throw new FormError(`${label} must be a date and time`, 'form.datetime', { label })
  }
  return date
}

/** Both event fields, checked together: an end needs a start and cannot precede it. */
export function feventRange(
  form: FormData,
  labels: { start: string; end: string } = { start: 'Event start', end: 'Event end' },
): {
  eventStartsAt: Date | null
  eventEndsAt: Date | null
} {
  const eventStartsAt = fbaliDateTime(form, 'eventStartsAt', labels.start)
  const eventEndsAt = fbaliDateTime(form, 'eventEndsAt', labels.end)
  if (eventEndsAt !== null && eventStartsAt === null) {
    throw new FormError('An event end needs an event start', 'form.event_end_needs_start')
  }
  if (eventStartsAt !== null && eventEndsAt !== null && eventEndsAt < eventStartsAt) {
    throw new FormError('The event cannot end before it starts', 'form.event_end_before_start')
  }
  return { eventStartsAt, eventEndsAt }
}

/** Stored instant → `datetime-local` value in Bali time. */
export function baliInputValue(value: Date | null | undefined): string {
  if (value === null || value === undefined) return ''
  return new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}
