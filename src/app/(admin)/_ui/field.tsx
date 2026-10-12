import type { Localized } from '@/db/schema'
import { localeConfig, locales, type Locale } from '@/i18n/config'

import { localeFieldName } from '../_lib/form'

/**
 * Form primitives.
 *
 * All server-rendered: plain HTML inputs inside plain forms posting to
 * server actions. No client-side form library, no controlled inputs, no
 * hydration cost. A failed save comes back as a banner, not as a state
 * machine that can disagree with the database.
 */

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="a-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="a-hint">{hint}</span> : null}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`a-input ${props.className ?? ''}`.trim()} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`a-textarea ${props.className ?? ''}`.trim()} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`a-select ${props.className ?? ''}`.trim()} />
}

export function Checkbox({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string
  label: string
  defaultChecked?: boolean
  hint?: string
}) {
  return (
    <div className="a-field">
      <label className="a-check">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} />
        {label}
      </label>
      {hint ? <span className="a-hint">{hint}</span> : null}
    </div>
  )
}

/**
 * One localized field, all three locales side by side.
 *
 * Arabic sits next to English rather than behind a language tab on purpose:
 * a translator needs the source string in view, and an editor needs to see
 * at a glance which locales are still empty. Blank locales are legitimate —
 * `pick()` falls back to English rather than rendering "undefined" the way
 * the handoff's `a.name[lang]` did.
 */
export function LocalizedField({
  name,
  label,
  value,
  hint,
  rows,
  required,
}: {
  name: string
  label: string
  value?: Localized | null
  hint?: string
  /** Renders textareas instead of inputs. */
  rows?: number
  required?: boolean
}) {
  return (
    <fieldset className="a-fieldset">
      <legend>
        {label}
        {required ? ' *' : ''}
      </legend>
      {hint ? <span className="a-hint">{hint}</span> : null}
      <div className="a-l10n">
        {locales.map((locale) => {
          const fieldName = localeFieldName(name, locale)
          const defaultValue = value?.[locale] ?? ''
          return (
            <div className="a-field" key={locale}>
              <label htmlFor={fieldName}>{localeConfig[locale].label}</label>
              {rows ? (
                <TextArea
                  id={fieldName}
                  name={fieldName}
                  rows={rows}
                  defaultValue={defaultValue}
                  lang={locale}
                  dir={localeConfig[locale].dir}
                  required={required && locale === 'en'}
                />
              ) : (
                <TextInput
                  id={fieldName}
                  name={fieldName}
                  defaultValue={defaultValue}
                  lang={locale}
                  dir={localeConfig[locale].dir}
                  required={required && locale === 'en'}
                />
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * A list of localized strings — inclusions, exclusions, audience — authored
 * as three parallel textareas, one item per line, zipped by line index.
 * English drives the length, so a half-finished translation cannot truncate
 * or pad the published list.
 */
export function LocalizedListField({
  name,
  label,
  values,
  hint,
  rows = 5,
}: {
  name: string
  label: string
  values?: readonly Localized[] | null
  hint?: string
  rows?: number
}) {
  const text = (locale: Locale) => (values ?? []).map((value) => value[locale] ?? '').join('\n')

  return (
    <fieldset className="a-fieldset">
      <legend>{label}</legend>
      <span className="a-hint">
        {hint ? `${hint} ` : ''}One item per line. Lines are matched across locales by position, and
        a line whose English is blank is dropped.
      </span>
      <div className="a-l10n">
        {locales.map((locale) => {
          const fieldName = localeFieldName(name, locale)
          return (
            <div className="a-field" key={locale}>
              <label htmlFor={fieldName}>{localeConfig[locale].label}</label>
              <TextArea
                id={fieldName}
                name={fieldName}
                rows={rows}
                defaultValue={text(locale)}
                lang={locale}
                dir={localeConfig[locale].dir}
              />
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Draft / published selector, used by every publishable entity. */
export function StatusField({ value }: { value?: string | null }) {
  return (
    <Field label="Status" htmlFor="status" hint="Only published rows are sellable and crawlable.">
      <Select id="status" name="status" defaultValue={value ?? 'draft'}>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </Select>
    </Field>
  )
}

/**
 * Money input.
 *
 * Minor units, entered as an integer, with the formatted value shown beside
 * it. Deliberately not a decimal input: the minor-unit exponent varies by
 * currency (JPY 0, USD 2, KWD 3), so "12.50" has no single meaning and a
 * float round-trip is exactly how a price drifts by a cent.
 */
export function MoneyField({
  minorName = 'priceMinor',
  currencyName = 'currency',
  label = 'Price',
  minor,
  currency,
}: {
  minorName?: string
  currencyName?: string
  label?: string
  minor?: number | null
  currency?: string | null
}) {
  return (
    <>
      <Field
        label={`${label} (minor units)`}
        htmlFor={minorName}
        hint="Integer count of minor units — 12500 is 125.00 in a 2-decimal currency."
      >
        <TextInput
          id={minorName}
          name={minorName}
          inputMode="numeric"
          pattern="[0-9]*"
          defaultValue={String(minor ?? 0)}
          required
        />
      </Field>
      <Field label="Currency" htmlFor={currencyName} hint="ISO 4217, e.g. USD, IDR, SAR.">
        <TextInput
          id={currencyName}
          name={currencyName}
          maxLength={3}
          defaultValue={currency ?? 'USD'}
          style={{ textTransform: 'uppercase' }}
          required
        />
      </Field>
    </>
  )
}
