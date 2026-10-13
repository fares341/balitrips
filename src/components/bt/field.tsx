/**
 * Form fields — bt.css "Forms".
 *
 * Low level:
 *   <Field id="email" label="Email" hint="…" error="…" valid required>
 *     <Input id="email" invalid={!!error} aria-describedby={fieldDescribedBy('email', { hint, error })} />
 *   </Field>
 *
 * Wired for you:
 *   <InputField id="email" label="Email" error={err} type="email" dir="ltr" … />
 *   <SelectField id="area" label="Area" options={[{ value, label }]} />
 *   <TextareaField id="msg" label="Message" />
 *
 * Choice cards (`.check`): <Checkbox label="…" description="…" /> and
 * <Radio name=… label=… />. Toggle: <Switch label=… />.
 *
 * The error line is rendered only when there is an error (bt.css shows
 * `.err` only under `.has-error`), with a warning icon, and is tied to the
 * control by aria-describedby; `invalid` sets aria-invalid. No 'use client'.
 */

import type { ComponentPropsWithRef, ReactNode } from 'react'

import { Icon } from '@/components/ui/icon'

export function fieldDescribedBy(
  id: string,
  { hint, error }: { hint?: ReactNode; error?: ReactNode },
): string | undefined {
  const ids = [
    error !== undefined && error !== null && error !== false ? `${id}-err` : null,
    hint !== undefined && hint !== null ? `${id}-hint` : null,
  ].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

export type FieldProps = {
  /** Id of the control inside; the label points at it. */
  id: string
  label: ReactNode
  hint?: ReactNode
  /** Error message; renders the red state. */
  error?: ReactNode
  /** Green border + optional `validText` ("Looks good"). */
  valid?: boolean
  validText?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}

export function Field({
  id,
  label,
  hint,
  error,
  valid = false,
  validText,
  required = false,
  children,
  className,
}: FieldProps) {
  const hasError = error !== undefined && error !== null && error !== false && error !== ''
  return (
    <div
      className={[
        'field',
        hasError ? 'has-error' : null,
        valid && !hasError ? 'is-valid' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hasError && (
        <span className="err" id={`${id}-err`} role="alert">
          <Icon name="alert" size={15} stroke={2} />
          <span>{error}</span>
        </span>
      )}
      {!hasError && valid && validText !== undefined && (
        <span className="ok-hint">{validText}</span>
      )}
      {hint !== undefined && hint !== null && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  )
}

type ControlExtras = { invalid?: boolean }

export type InputProps = ComponentPropsWithRef<'input'> & ControlExtras

export function Input({ invalid = false, className, ...rest }: InputProps) {
  return (
    <input
      className={['input', className].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export type SelectProps = ComponentPropsWithRef<'select'> & ControlExtras

export function Select({ invalid = false, className, ...rest }: SelectProps) {
  return (
    <select
      className={['select', className].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export type TextareaProps = ComponentPropsWithRef<'textarea'> & ControlExtras

export function Textarea({ invalid = false, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={['textarea', className].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

type FieldWiring = {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  valid?: boolean
  validText?: ReactNode
  fieldClassName?: string
}

export type InputFieldProps = Omit<InputProps, 'id'> & FieldWiring

export function InputField({
  id,
  label,
  hint,
  error,
  valid,
  validText,
  fieldClassName,
  required,
  ...input
}: InputFieldProps) {
  const hasError = error !== undefined && error !== null && error !== ''
  return (
    <Field {...{ id, label, hint, error, valid, validText, required }} className={fieldClassName}>
      <Input
        id={id}
        required={required}
        invalid={hasError}
        aria-describedby={fieldDescribedBy(id, { hint, error: hasError ? error : undefined })}
        {...input}
      />
    </Field>
  )
}

export type SelectOption = { value: string; label: string; disabled?: boolean }

export type SelectFieldProps = Omit<SelectProps, 'id' | 'children'> &
  FieldWiring & { options: readonly SelectOption[]; placeholder?: string }

export function SelectField({
  id,
  label,
  hint,
  error,
  valid,
  validText,
  fieldClassName,
  required,
  options,
  placeholder,
  ...select
}: SelectFieldProps) {
  const hasError = error !== undefined && error !== null && error !== ''
  return (
    <Field {...{ id, label, hint, error, valid, validText, required }} className={fieldClassName}>
      <Select
        id={id}
        required={required}
        invalid={hasError}
        aria-describedby={fieldDescribedBy(id, { hint, error: hasError ? error : undefined })}
        {...select}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}

export type TextareaFieldProps = Omit<TextareaProps, 'id'> & FieldWiring

export function TextareaField({
  id,
  label,
  hint,
  error,
  valid,
  validText,
  fieldClassName,
  required,
  ...textarea
}: TextareaFieldProps) {
  const hasError = error !== undefined && error !== null && error !== ''
  return (
    <Field {...{ id, label, hint, error, valid, validText, required }} className={fieldClassName}>
      <Textarea
        id={id}
        required={required}
        invalid={hasError}
        aria-describedby={fieldDescribedBy(id, { hint, error: hasError ? error : undefined })}
        {...textarea}
      />
    </Field>
  )
}

export type ChoiceProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  label: ReactNode
  /** Second, muted line. */
  description?: ReactNode
  /** Trailing content (a price, a tag). */
  end?: ReactNode
}

function Choice({
  type,
  label,
  description,
  end,
  className,
  ...input
}: ChoiceProps & { type: 'checkbox' | 'radio' }) {
  return (
    <label className={['check', className].filter(Boolean).join(' ')}>
      <input type={type} {...input} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{label}</b>
        {description !== undefined && description !== null && <small>{description}</small>}
      </span>
      {end}
    </label>
  )
}

/** Choice card with a checkbox (`.check`). */
export function Checkbox(props: ChoiceProps) {
  return <Choice type="checkbox" {...props} />
}

/** Choice card with a radio (`.check`); give a group the same `name`. */
export function Radio(props: ChoiceProps) {
  return <Choice type="radio" {...props} />
}

export type SwitchProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  /** Accessible name (visible label lives next to it). */
  label: string
}

/** On/off toggle (`.switch`). */
export function Switch({ label, className, ...input }: SwitchProps) {
  return (
    <span className={['switch', className].filter(Boolean).join(' ')}>
      <input type="checkbox" role="switch" aria-label={label} {...input} />
      <span aria-hidden="true" />
    </span>
  )
}
