'use server'

/**
 * Contact form — the server action behind it.
 *
 * The handoff's `submit` was `e.preventDefault(); setSent(true); toast(...)`.
 * It rendered "Message sent — we'll be in touch shortly." and sent nothing: no
 * request, no row, no notification. Every enquiry the prototype collected was
 * discarded while telling the customer it had arrived.
 *
 * This writes a `contact_messages` row and reports what actually happened.
 *
 * Anti-spam is two cheap, layered checks:
 *
 *  1. a honeypot field that is off-screen, `tabindex="-1"` and
 *     `autocomplete="off"` — nothing a human or an autofill engine would ever
 *     populate;
 *  2. a minimum time between the form mounting and the submit landing.
 *
 * Both are *speed bumps*, not security. The timing value is measured in the
 * browser and could be forged by anything that bothers to look: the contact
 * page is statically rendered, so there is no server-issued nonce to sign, and
 * making the page dynamic to get one would cost every visitor a round trip to
 * origin for a marketing page. Rate limiting at the edge and a challenge for
 * repeat offenders are the next layer and belong in front of this, not here.
 *
 * A rejected submission is reported honestly rather than answered with a fake
 * "sent". Someone who pastes a prepared message and submits within three
 * seconds is asked to send it again — the second attempt passes — which is a
 * far better failure than silently dropping a real enquiry.
 *
 * A `'use server'` module may export only async functions, so the types, field
 * names and limits live in ./contract.ts.
 */

import { db } from '@/db'
import { getUser } from '@/lib/auth/session'
import { notifyStaff } from '@/lib/notify'
import { createTicket } from '@/lib/support/service'
import { contactMessages } from '@/db/schema'

import {
  ELAPSED_FIELD,
  HONEYPOT_FIELD,
  MAX_EMAIL,
  MAX_MESSAGE,
  MAX_NAME,
  MAX_SUBJECT,
  MIN_SUBMIT_MS,
  type ContactErrorCode,
  type ContactField,
  type ContactResult,
} from './contract'

/**
 * Pragmatic email shape check.
 *
 * Deliberately loose: the only way to know an address works is to send to it,
 * and every "strict" pattern on the internet rejects addresses that are valid
 * under RFC 5322. This catches the typo class — a missing `@`, a missing dot,
 * an internal space — and nothing else.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function readField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function looksAutomated(formData: FormData): boolean {
  if (readField(formData, HONEYPOT_FIELD) !== '') return true

  const raw = readField(formData, ELAPSED_FIELD)
  if (raw === '') return true

  const elapsed = Number(raw)
  // A missing or unparseable value means the field never reached us, which is
  // itself the signature of a script posting the form directly.
  if (!Number.isFinite(elapsed)) return true

  return elapsed < MIN_SUBMIT_MS
}

/**
 * Validate and store one enquiry.
 *
 * Shaped for `useActionState`, so the previous result is the first argument
 * even though nothing here needs it.
 */
export async function sendContactMessage(
  _previous: ContactResult,
  formData: FormData,
): Promise<ContactResult> {
  if (looksAutomated(formData)) {
    return { status: 'error', formError: 'rejected', fieldErrors: {} }
  }

  const name = readField(formData, 'name')
  const email = readField(formData, 'email')
  const subject = readField(formData, 'subject')
  const message = readField(formData, 'message')

  const fieldErrors: Partial<Record<ContactField, ContactErrorCode>> = {}

  if (name === '') fieldErrors.name = 'required'
  else if (name.length > MAX_NAME) fieldErrors.name = 'too_long'

  if (email === '') fieldErrors.email = 'required'
  else if (email.length > MAX_EMAIL) fieldErrors.email = 'too_long'
  else if (!EMAIL_PATTERN.test(email)) fieldErrors.email = 'email'

  if (subject.length > MAX_SUBJECT) fieldErrors.subject = 'too_long'

  if (message === '') fieldErrors.message = 'required'
  else if (message.length > MAX_MESSAGE) fieldErrors.message = 'too_long'

  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', formError: null, fieldErrors }
  }

  try {
    await db.insert(contactMessages).values({
      name,
      email,
      // The column is nullable and the field is optional; an empty string
      // would make "no subject" indistinguishable from a subject of "".
      subject: subject === '' ? null : subject,
      message,
    })
  } catch (error) {
    // Logged, never surfaced: a driver error can carry the connection string.
    console.error('contact_messages insert failed', error)
    return { status: 'error', formError: 'failed', fieldErrors: {} }
  }

  // Phase 4: every enquiry is also a support ticket, so it is answered and
  // tracked in Studio → Support. Linked to the account only when the sender is
  // signed in (an e-mail typed into a form proves nothing). Best effort: the
  // message is already stored above.
  try {
    const user = await getUser()
    await createTicket({
      userId: user?.id ?? null,
      email,
      name,
      orderId: null,
      subject: subject === '' ? message.slice(0, 80) : subject,
      category: 'other',
      priority: 'normal',
      body: message,
      source: 'contact',
      notifyTeam: false,
    })
  } catch (error) {
    console.error('[contact] could not open a support ticket', error)
  }

  await notifyStaff(
    'staff_contact_message',
    { name: name.slice(0, 80), subject: (subject === '' ? message : subject).slice(0, 80) },
    '/support',
  )

  return { status: 'sent' }
}
