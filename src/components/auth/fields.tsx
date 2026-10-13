'use client'

/**
 * Form controls for the auth sheet.
 *
 * The handoff's `Field` was a bare `<input>` inside a `<label>` with roughly
 * forty lines of inline style and two handlers that mutated
 * `e.target.style.borderColor` on focus. The visual result is identical here
 * and comes from `.bt-flabel` / `.bt-input` / `.bt-input-err` / `.bt-errmsg`
 * in components.css, which already carry the focus state as a real `:focus`
 * rule.
 *
 * What is new is everything an error state needs:
 *
 *  - `htmlFor`/`id`, so clicking the label focuses the box (the handoff wrapped
 *    the input in the label, which works, but breaks the moment a second
 *    element — the error text — joins it);
 *  - `aria-invalid` and `aria-describedby`, so a screen reader announces the
 *    problem instead of leaving an unexplained red border;
 *  - `role="alert"` on the message, so it is announced when it appears;
 *  - `maxLength`, matched to the column width, so a paste is truncated at the
 *    box rather than 500-ing at Postgres.
 *
 * Errors arrive as message KEYS and are translated here, so no caller has to
 * remember to do it.
 */

import { useId } from 'react'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'

type BaseProps = {
  label: string
  /** Key into messages/*.json, or null when the field is fine. */
  error?: string | null
  /** Rendered under the control when there is no error. */
  hint?: string
  disabled?: boolean
  /** Appended to the label, e.g. the shared "Optional" string. */
  optionalLabel?: string
}

function useFieldIds(error: string | null | undefined, hint: string | undefined) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const described = [error ? errorId : null, !error && hint ? hintId : null].filter(
    (value): value is string => value !== null,
  )

  return {
    id,
    errorId,
    hintId,
    describedBy: described.length > 0 ? described.join(' ') : undefined,
  }
}

function FieldMessage({
  error,
  errorId,
  hint,
  hintId,
}: {
  error: string | null | undefined
  errorId: string
  hint: string | undefined
  hintId: string
}) {
  const t = useTranslations()

  if (error) {
    return (
      <p className="bt-errmsg" id={errorId} role="alert">
        <Icon name="cross" size={13} />
        {t(error)}
      </p>
    )
  }

  if (hint === undefined) return null

  return (
    <p id={hintId} className="muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
      {hint}
    </p>
  )
}

export type TextFieldProps = BaseProps & {
  type?: 'text' | 'email' | 'password' | 'tel'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  maxLength?: number
  autoFocus?: boolean
  inputMode?: 'text' | 'email' | 'tel'
}

export function TextField({
  label,
  error,
  hint,
  disabled = false,
  optionalLabel,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  maxLength,
  autoFocus = false,
  inputMode,
}: TextFieldProps) {
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint)

  return (
    <div className="bt-field" style={{ marginBottom: 0 }}>
      <label className="bt-flabel" htmlFor={id} style={{ display: 'block' }}>
        {label}
        {optionalLabel !== undefined && (
          <span className="muted" style={{ fontWeight: 600 }}>
            {' '}
            · {optionalLabel}
          </span>
        )}
      </label>
      <input
        id={id}
        className={error ? 'bt-input bt-input-err' : 'bt-input'}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        inputMode={inputMode}
        disabled={disabled}
        // Only ever set on the first field of a dialog the visitor
        // deliberately opened, where focus has to move inside anyway.
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <FieldMessage error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

export type SelectFieldProps = BaseProps & {
  value: string
  onChange: (value: string) => void
  /** Shown as the empty first option. */
  placeholder: string
  options: readonly { value: string; label: string }[]
  autoComplete?: string
}

export function SelectField({
  label,
  error,
  hint,
  disabled = false,
  optionalLabel,
  value,
  onChange,
  placeholder,
  options,
  autoComplete,
}: SelectFieldProps) {
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint)

  return (
    <div className="bt-field" style={{ marginBottom: 0 }}>
      <label className="bt-flabel" htmlFor={id} style={{ display: 'block' }}>
        {label}
        {optionalLabel !== undefined && (
          <span className="muted" style={{ fontWeight: 600 }}>
            {' '}
            · {optionalLabel}
          </span>
        )}
      </label>
      <select
        id={id}
        className={error ? 'bt-input bt-input-err' : 'bt-input'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessage error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

/**
 * Form-level failure banner.
 *
 * Separate from the per-field messages: "wrong email or password" belongs to
 * the submission, not to either box, and attaching it to one of them would
 * point the visitor at the wrong field.
 */
export function FormError({ messageKey }: { messageKey: string | null }) {
  const t = useTranslations()
  if (messageKey === null) return null

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        background: 'var(--danger-soft)',
        border: '1px solid rgba(179, 38, 30, 0.35)',
        color: 'var(--danger)',
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 14.5,
        fontWeight: 600,
        lineHeight: 1.5,
      }}
    >
      <Icon name="cross" size={18} />
      <span>{t(messageKey)}</span>
    </div>
  )
}

/** Success banner. Same shape, palm-green, and announced politely. */
export function FormNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        background: 'var(--palm-soft)',
        color: 'var(--forest)',
        borderRadius: 12,
        padding: '14px 16px',
        fontSize: 14.5,
        fontWeight: 600,
        lineHeight: 1.5,
      }}
    >
      <Icon name="check" size={18} />
      <span>{children}</span>
    </div>
  )
}
