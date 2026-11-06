'use client'

import { useId, useRef, useState, useSyncExternalStore } from 'react'

import { CONFIRM_FIELD, CONFIRM_WORDS, matchesTyped, type ConfirmWordKind } from '../_lib/confirm'
import { useAdminT } from './i18n-provider'

const noopSubscribe = () => () => {}
const isClient = () => true
const isServer = () => false

type FormAction = (formData: FormData) => void | Promise<void>

/**
 * A destructive submit button that asks first.
 *
 * Put it inside the form in place of the plain `<button type="submit">`.
 * With JS the button opens a native `<dialog>` (focus trap, Esc to cancel,
 * no library); the real submit button lives in that dialog, so a
 * `formAction` on a multi-action form still posts to the right action.
 *
 * Without JS (or before hydration) nothing breaks: a plain confirmation
 * renders as the ordinary submit button, and a typed confirmation renders
 * its input inline next to the button. The server checks the typed value
 * either way (`assertTypedValue` / `assertTypedWord` in `_lib/confirm`).
 */
export function ConfirmSubmit({
  label,
  title,
  message,
  details,
  confirmLabel,
  className = 'a-btn danger',
  formAction,
  name,
  value,
  typed,
  typedWord,
  disabled,
}: {
  /** The button text on the page. */
  label: string
  /** Dialog heading; defaults to a generic "Are you sure?". */
  title?: string
  /** One or two sentences on what happens. */
  message?: string
  /** Label/value pairs shown in the dialog (amount, order number…). */
  details?: Array<{ label: string; value: string }>
  /** Text of the button that really submits; defaults to `label`. */
  confirmLabel?: string
  className?: string
  /** For a button in a form with several actions. */
  formAction?: FormAction
  name?: string
  value?: string
  /** Require typing this exact value (an order number, an e-mail). */
  typed?: { expected: string; label?: string }
  /** Require typing the ban / revoke word in the operator's language. */
  typedWord?: ConfirmWordKind
  disabled?: boolean
}) {
  const { t, locale } = useAdminT()
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // false on the server and during hydration, true once React owns the DOM.
  const enhanced = useSyncExternalStore(noopSubscribe, isClient, isServer)
  const [text, setText] = useState('')

  const expected = typed?.expected ?? (typedWord ? CONFIRM_WORDS[typedWord][locale] : undefined)
  const typedLabel =
    typed?.label ??
    (expected !== undefined ? t('confirm.type_to_confirm', { value: expected }) : undefined)
  const inputId = `${id}-confirm`
  const ok = expected === undefined || matchesTyped(text, expected)

  const typedInput =
    expected !== undefined ? (
      <span className="a-confirm-typed">
        <label htmlFor={inputId}>{typedLabel}</label>
        <input
          ref={inputRef}
          id={inputId}
          className="a-input"
          name={CONFIRM_FIELD}
          autoComplete="off"
          spellCheck={false}
          dir="auto"
          value={enhanced ? text : undefined}
          onChange={enhanced ? (event) => setText(event.target.value) : undefined}
          required={!enhanced}
        />
      </span>
    ) : null

  const submit = (
    <button
      className={className}
      type="submit"
      formAction={formAction}
      name={name}
      value={value}
      disabled={disabled || (enhanced && !ok)}
    >
      {enhanced ? (confirmLabel ?? label) : label}
    </button>
  )

  if (!enhanced) {
    return typedInput ? (
      <span className="a-confirm-inline">
        {typedInput}
        {submit}
      </span>
    ) : (
      submit
    )
  }

  return (
    <>
      <button
        className={className}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => {
          setText('')
          dialogRef.current?.showModal()
          if (inputRef.current) inputRef.current.focus()
        }}
      >
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className="a-confirm"
        aria-labelledby={`${id}-title`}
        aria-describedby={message ? `${id}-msg` : undefined}
      >
        <h2 id={`${id}-title`}>{title ?? t('confirm.title')}</h2>
        {message ? <p id={`${id}-msg`}>{message}</p> : null}
        {details && details.length > 0 ? (
          <dl className="a-confirm-details">
            {details.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd dir="auto">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="a-hint">{t('confirm.cannot_undo')}</p>
        {typedInput}
        <div className="a-actions">
          <button
            className="a-btn ghost"
            type="button"
            autoFocus={expected === undefined}
            onClick={() => dialogRef.current?.close()}
          >
            {t('confirm.cancel')}
          </button>
          {submit}
        </div>
      </dialog>
    </>
  )
}
