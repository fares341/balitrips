'use client'

/**
 * Contact form.
 *
 * Ported from the form inside `ContactPage` in
 * design/handoff/sections-bt/page-explore.jsx, with the one change that
 * matters: it now sends the message. The handoff's `submit` was
 * `e.preventDefault(); setSent(true); toast(t("co_sent"))` — it painted the
 * confirmation and threw the enquiry away.
 *
 * Everything else follows from that. The action is a real server action, so
 * the outcome is `sent`, a field error or a failure, and the UI says which:
 *
 *  - field errors render under the field they belong to, with `aria-invalid`
 *    and `aria-describedby` wiring them to the input, so a screen reader user
 *    hears the problem on the control rather than hunting for red text;
 *  - the form-level message lives in an always-mounted `role="status"` region
 *    — a live region inserted and populated in the same frame is unreliably
 *    announced;
 *  - the submit button reports `pending`, so a slow connection cannot produce
 *    four identical rows from four impatient clicks.
 *
 * The inputs are controlled. React resets an uncontrolled form after an action
 * resolves, which would wipe a long message the moment one field failed
 * validation; controlled values survive that reset.
 *
 * The honeypot and the mount-to-submit timer are described in ./actions.ts.
 * The timer is restarted after a successful send so a second message is held
 * to the same minimum.
 */

import { useActionState, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'

import { sendContactMessage } from './actions'
import {
  CONTACT_ERROR_KEY,
  ELAPSED_FIELD,
  HONEYPOT_FIELD,
  INITIAL_CONTACT_RESULT,
  MAX_EMAIL,
  MAX_MESSAGE,
  MAX_NAME,
  MAX_SUBJECT,
  MIN_SUBMIT_MS,
  type ContactErrorCode,
  type ContactField,
  type ContactResult,
} from './contract'

/** Marks the "send another" submit, which resets the form without a round trip. */
const RESET_FIELD = 'bt_reset'

/**
 * Off-screen but readable by assistive tech.
 *
 * Inline because src/styles is owned elsewhere and carries no `.sr-only`
 * utility; logical `insetInlineStart` so it hides off the correct edge in both
 * directions.
 */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  insetInlineStart: -9999,
  width: 1,
  height: 1,
  overflow: 'hidden',
}

type Values = Record<ContactField, string>

const EMPTY_VALUES: Values = { name: '', email: '', subject: '', message: '' }

export function ContactForm() {
  const t = useTranslations()
  const fieldId = useId()

  const [values, setValues] = useState<Values>(EMPTY_VALUES)

  /**
   * When this form became usable, in client time.
   *
   * Set in an effect rather than during render: `Date.now()` is impure, and a
   * render-phase read is not guaranteed to happen once. The effect runs on
   * mount, long before a person can reach the submit button.
   */
  const mountedAt = useRef<number | null>(null)
  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  const [state, formAction, pending] = useActionState<ContactResult, FormData>(
    async (previous, formData) => {
      // "Send another" — no submission, just a return to a blank form. The
      // clock restarts so the next message faces the same minimum.
      if (formData.get(RESET_FIELD) !== null) {
        mountedAt.current = Date.now()
        return INITIAL_CONTACT_RESULT
      }

      // No timestamp means our own instrumentation failed, not that the sender
      // is a script — fail open and let the message through rather than
      // rejecting a real customer over a bug on our side.
      const startedAt = mountedAt.current
      const elapsed = startedAt === null ? MIN_SUBMIT_MS : Date.now() - startedAt
      formData.set(ELAPSED_FIELD, String(elapsed))

      const result = await sendContactMessage(previous, formData)

      if (result.status === 'sent') {
        setValues(EMPTY_VALUES)
        mountedAt.current = Date.now()
      }

      return result
    },
    INITIAL_CONTACT_RESULT,
  )

  const fieldErrors = state.status === 'error' ? state.fieldErrors : {}
  const formError = state.status === 'error' ? state.formError : null

  /**
   * What the live region says.
   *
   * Both outcomes go through it: the confirmation is the whole point of the
   * form, and the handoff's version was a visual-only panel a screen reader
   * user would only find by wandering back into the page.
   */
  const statusText =
    state.status === 'sent'
      ? t('co_sent')
      : formError === null
        ? ''
        : t(CONTACT_ERROR_KEY[formError])

  const set = (field: ContactField) => (value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }))

  const errorText = (code: ContactErrorCode | undefined): string | null =>
    code === undefined ? null : t(CONTACT_ERROR_KEY[code])

  const describedBy = (field: ContactField): string | undefined =>
    fieldErrors[field] === undefined ? undefined : `${fieldId}-${field}-error`

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/*
        The live region is always mounted and visually hidden, so the
        announcement fires on the text changing rather than on the region
        appearing — a region inserted and populated in the same frame is
        unreliably announced. The visible copy below is a separate, silent
        node, so nothing is read out twice.
      */}
      <span role="status" aria-live="polite" style={VISUALLY_HIDDEN}>
        {statusText}
      </span>

      {formError !== null && (
        <p className="bt-errmsg" aria-hidden="true" style={{ margin: 0 }}>
          <Icon name="cross" size={14} color="var(--orange-deep)" />
          {t(CONTACT_ERROR_KEY[formError])}
        </p>
      )}

      {state.status === 'sent' ? (
        <div className="center" style={{ padding: '30px 10px' }}>
          <span
            aria-hidden="true"
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--forest)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Icon name="check" size={30} color="#fff" />
          </span>
          {/* Silent: the live region above has already announced this text. */}
          <p aria-hidden="true" style={{ fontSize: 16, fontWeight: 600 }}>
            {t('co_sent')}
          </p>

          <Button
            type="submit"
            name={RESET_FIELD}
            value="1"
            variant="ghost"
            size="sm"
            style={{ marginTop: 18 }}
          >
            {t('co_another')}
          </Button>
        </div>
      ) : (
        <>
          <Field
            id={`${fieldId}-name`}
            label={t('co_name')}
            name="name"
            value={values.name}
            onChange={set('name')}
            required
            maxLength={MAX_NAME}
            autoComplete="name"
            error={errorText(fieldErrors.name)}
            errorId={describedBy('name')}
          />

          <Field
            id={`${fieldId}-email`}
            label={t('co_email')}
            name="email"
            type="email"
            value={values.email}
            onChange={set('email')}
            required
            maxLength={MAX_EMAIL}
            autoComplete="email"
            error={errorText(fieldErrors.email)}
            errorId={describedBy('email')}
          />

          <Field
            id={`${fieldId}-subject`}
            label={`${t('co_subject')} (${t('co_optional')})`}
            name="subject"
            value={values.subject}
            onChange={set('subject')}
            maxLength={MAX_SUBJECT}
            error={errorText(fieldErrors.subject)}
            errorId={describedBy('subject')}
          />

          <Field
            id={`${fieldId}-message`}
            label={t('co_msg')}
            name="message"
            value={values.message}
            onChange={set('message')}
            required
            multiline
            maxLength={MAX_MESSAGE}
            placeholder={t('co_msg_ph')}
            error={errorText(fieldErrors.message)}
            errorId={describedBy('message')}
          />

          {/*
            Honeypot. Off-screen rather than `display: none`, tabbable only by
            something that ignores `tabindex`, and never autofilled — see the
            note on HONEYPOT_FIELD in ./contract.ts.
          */}
          <div aria-hidden="true" style={VISUALLY_HIDDEN}>
            <label htmlFor={`${fieldId}-hp`}>{t('co_hp')}</label>
            <input
              id={`${fieldId}-hp`}
              type="text"
              name={HONEYPOT_FIELD}
              defaultValue=""
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <Button type="submit" variant="orange" block disabled={pending}>
            {pending ? (
              t('co_sending')
            ) : (
              <>
                {t('co_send')} <Icon name="arrow" size={17} color="#fff" className="flip" />
              </>
            )}
          </Button>
        </>
      )}
    </form>
  )
}

type FieldProps = {
  id: string
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  multiline?: boolean
  maxLength?: number
  placeholder?: string
  autoComplete?: string
  error: string | null
  errorId: string | undefined
}

/**
 * One labelled control.
 *
 * A real `<label htmlFor>` rather than the handoff's wrapping `<label>` with a
 * bare `<span>` inside: the wrapper works, but only the explicit association
 * survives the field being moved, and it is what lets the error message be
 * referenced by id.
 */
function Field({
  id,
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  multiline = false,
  maxLength,
  placeholder,
  autoComplete,
  error,
  errorId,
}: FieldProps) {
  const shared = {
    id,
    name,
    value,
    required,
    maxLength,
    placeholder,
    autoComplete,
    className: error === null ? 'bt-input' : 'bt-input bt-input-err',
    'aria-invalid': error === null ? undefined : true,
    'aria-describedby': errorId,
  } as const

  return (
    <div className="bt-field" style={{ marginBottom: 0 }}>
      <label className="bt-flabel" htmlFor={id} style={{ display: 'block' }}>
        {label}
      </label>

      {multiline ? (
        <textarea
          {...shared}
          style={{ minHeight: 130, resize: 'vertical' }}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input {...shared} type={type} onChange={(event) => onChange(event.target.value)} />
      )}

      {error !== null && errorId !== undefined && (
        <span className="bt-errmsg" id={errorId}>
          <Icon name="cross" size={13} />
          {error}
        </span>
      )}
    </div>
  )
}
