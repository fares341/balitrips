import type { Option } from '../_lib/lookups'
import { Field, Select } from './field'

/** Single-choice reference field, with an explicit "none" when optional. */
export function OptionField({
  name,
  label,
  options,
  value,
  hint,
  emptyLabel = '— none —',
  required,
}: {
  name: string
  label: string
  options: readonly Option[]
  value?: string | null
  hint?: string
  emptyLabel?: string
  required?: boolean
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <Select id={name} name={name} defaultValue={value ?? ''} required={required}>
        {required ? null : <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/**
 * Multi-choice reference field, rendered as checkboxes rather than a
 * multi-select: a native multi-select needs ctrl-click to add a second
 * value, which operators lose items to constantly.
 */
export function OptionChecklist({
  name,
  label,
  options,
  values,
  hint,
}: {
  name: string
  label: string
  options: readonly Option[]
  values: readonly string[]
  hint?: string
}) {
  const selected = new Set(values)

  return (
    <fieldset className="a-fieldset">
      <legend>{label}</legend>
      {hint ? <span className="a-hint">{hint}</span> : null}
      {options.length === 0 ? (
        <span className="a-hint">Nothing to choose from yet.</span>
      ) : (
        <div className="a-l10n">
          {options.map((option) => (
            <label className="a-check" key={option.value}>
              <input
                type="checkbox"
                name={name}
                value={option.value}
                defaultChecked={selected.has(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}
