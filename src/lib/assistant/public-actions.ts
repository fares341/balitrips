/**
 * Running a website-assistant proposal after the visitor pressed Confirm.
 *
 * Each kind goes through the SAME entry point the site's own UI uses, so the
 * assistant can never do more than the visitor could do by hand:
 *
 *   add_to_trip    → `bookActivityAction` (the activity page's booking box):
 *                    bookings switch, argument parsing, `addActivityBooking`
 *                    and its `buildQuote` validation, the caller's own cart.
 *   custom_request → `submitCustomTrip` (the /custom questionnaire): its zod
 *                    schema, date and taxonomy checks, lead row, notifications.
 *
 * The arguments are the ones stored when the card was shown, never anything
 * from the Confirm request.
 */

import { bookActivityAction } from '@/app/[locale]/activities/[slug]/actions'
import { submitCustomTrip } from '@/app/[locale]/custom/actions'

export interface ActionOutcome {
  ok: boolean
  /** Short code for the panel's message (`added`, `sent`, or an error code). */
  code: string
  /** Where to go next, a site path. */
  href?: string
  itemCount?: number
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function runPublicAction(
  kind: string,
  args: Record<string, unknown>,
  locale: string,
): Promise<ActionOutcome> {
  if (kind === 'add_to_trip') {
    const result = await bookActivityAction({
      activityId: args.activityId,
      packageId: args.packageId ?? null,
      date: args.date,
      endDate: args.endDate ?? null,
      time: args.time ?? null,
      people: args.people,
      addons: Array.isArray(args.addons) ? args.addons : [],
      driver: args.driver === true,
    })
    if (result.ok) return { ok: true, code: 'added', href: '/my-trip', itemCount: result.itemCount }
    return { ok: false, code: result.reason ?? result.code }
  }

  if (kind === 'custom_request') {
    const form = new FormData()
    form.set('name', str(args.name))
    form.set('email', str(args.email))
    form.set('phone', str(args.phone))
    form.set('startDate', str(args.startDate))
    form.set('endDate', str(args.endDate))
    form.set('travellers', String(typeof args.travellers === 'number' ? args.travellers : ''))
    form.set('theme', str(args.theme))
    form.set('budgetTier', str(args.budgetTier))
    for (const key of Array.isArray(args.interests) ? args.interests : []) {
      if (typeof key === 'string') form.append('interests', key)
    }
    for (const key of Array.isArray(args.areas) ? args.areas : []) {
      if (typeof key === 'string') form.append('areas', key)
    }
    if (args.wantsDriver === true) form.set('wantsDriver', 'on')
    if (args.hasChildren === true) form.set('hasChildren', 'on')
    form.set('notes', str(args.notes))
    form.set('locale', locale)
    const result = await submitCustomTrip({ status: 'idle' }, form)
    if (result.status === 'done') return { ok: true, code: 'sent', href: '/custom' }
    if (result.status === 'error') {
      const field = result.fields ? Object.keys(result.fields)[0] : undefined
      return { ok: false, code: field ? `invalid_${field}` : result.reason }
    }
    return { ok: false, code: 'error' }
  }

  return { ok: false, code: 'unknown_action' }
}
