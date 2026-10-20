/**
 * The contract between the contact form and its server action.
 *
 * A plain module rather than part of `./actions.ts`: a `'use server'` file may
 * export nothing but async functions, so the shared types, field names and
 * limits have to live beside it. Both the Client Component and the action
 * import from here, which is also what keeps the honeypot's field name from
 * drifting out of sync with the check that reads it.
 */

export type ContactField = 'name' | 'email' | 'subject' | 'message'

export type ContactErrorCode =
  | 'required'
  | 'email'
  | 'too_long'
  | 'rejected'
  | 'failed'
  | 'rate_limited'

/**
 * What the action returns.
 *
 * Errors are *codes*, not sentences. The action is locale-agnostic — a server
 * action posts to whatever URL the form lives on, and resolving translations
 * inside it would couple the write path to next-intl's request scope. The form
 * maps each code to a translated string.
 */
export type ContactResult =
  | { status: 'idle' }
  | { status: 'sent' }
  | {
      status: 'error'
      /** Set when the whole submission failed, rather than one field. */
      formError: ContactErrorCode | null
      fieldErrors: Partial<Record<ContactField, ContactErrorCode>>
    }

export const INITIAL_CONTACT_RESULT: ContactResult = { status: 'idle' }

/**
 * Field name of the honeypot.
 *
 * Deliberately not `company`, `website` or `phone` — an autofill engine
 * recognises those and could populate one for a real customer, whose message
 * would then be rejected as spam.
 */
export const HONEYPOT_FIELD = 'bt_hp'

/** Field name carrying milliseconds between the form mounting and the submit. */
export const ELAPSED_FIELD = 'bt_elapsed'

/** Below this, a submission is treated as automated. */
export const MIN_SUBMIT_MS = 3000

/**
 * Column limits, mirrored from `contactMessages` in src/db/schema/commerce.ts.
 *
 * Enforced in the action so an over-long value is a field error the customer
 * can fix, rather than a `value too long for type character varying(128)`
 * surfacing as a generic failure. `maxLength` on the inputs mirrors them again
 * so the browser stops it before a round trip.
 */
export const MAX_NAME = 128
export const MAX_EMAIL = 256
export const MAX_SUBJECT = 256

/** `message` is `text` and has no column limit; this one is a sanity bound. */
export const MAX_MESSAGE = 4000

/** Message key per error code. */
export const CONTACT_ERROR_KEY: Record<ContactErrorCode, string> = {
  required: 'co_err_required',
  email: 'co_err_email',
  too_long: 'co_err_long',
  rejected: 'co_err_rejected',
  failed: 'co_err_failed',
  rate_limited: 'co_err_rate_limited',
}
