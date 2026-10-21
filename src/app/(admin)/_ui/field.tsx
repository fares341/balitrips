import type { Localized } from '@/db/schema'
import { localeConfig, locales, type Locale } from '@/i18n/config'
import { formatMoneyInput } from '@/lib/money-input'

import { localeFieldName } from '../_lib/form'
import { uiI18n } from './i18n-server'

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
  required,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  /** Shows a required marker after the label. Optional; validation stays on the input. */
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="a-field">
      <label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="a-req" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
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
        {required ? (
          <span className="a-req" aria-hidden="true">
            *
          </span>
        ) : null}
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
export async function LocalizedListField({
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
  const { t } = await uiI18n()
  const text = (locale: Locale) => (values ?? []).map((value) => value[locale] ?? '').join('\n')

  return (
    <fieldset className="a-fieldset">
      <legend>{label}</legend>
      <span className="a-hint">
        {hint ? `${hint} ` : ''}
        {t('ui.list_hint')}
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
export async function StatusField({ value }: { value?: string | null }) {
  const { t } = await uiI18n()
  return (
    <Field label={t('common.status')} htmlFor="status" hint={t('ui.status_hint')}>
      <Select id="status" name="status" defaultValue={value ?? 'draft'}>
        <option value="draft">{t('common.draft')}</option>
        <option value="published">{t('common.published')}</option>
      </Select>
    </Field>
  )
}

/**
 * Money input.
 *
 * Typed as people write prices ("125.00", "125,50", Arabic digits). The
 * server action converts it to integer minor units with the currency's own
 * decimals (`fmoney` in _lib/form.ts); the stored value is shown back the
 * same way. Storage is unchanged: integer minor units plus a currency code.
 */
export async function MoneyField({
  minorName = 'priceMinor',
  currencyName = 'currency',
  label,
  minor,
  currency,
  locked,
}: {
  minorName?: string
  currencyName?: string
  label?: string
  minor?: number | null
  currency?: string | null
  /**
   * Phase 6: the viewer lacks `prices.write`. The fields stay in the form
   * (read-only, so the stored value posts back unchanged and the rest of the
   * form still saves) and say why they cannot be edited.
   */
  locked?: boolean
}) {
  const { t } = await uiI18n()
  return (
    <>
      <Field
        label={label ?? t('common.price')}
        htmlFor={minorName}
        hint={locked ? t('team.prices_locked') : t('ui.money_hint')}
      >
        <TextInput
          id={minorName}
          name={minorName}
          inputMode="decimal"
          dir="ltr"
          defaultValue={formatMoneyInput(minor ?? 0, currency ?? 'USD')}
          required
          readOnly={locked}
          aria-readonly={locked || undefined}
          className={locked ? 'a-locked' : undefined}
        />
      </Field>
      <Field
        label={t('common.currency')}
        htmlFor={currencyName}
        hint={locked ? undefined : t('ui.currency_hint')}
      >
        <TextInput
          id={currencyName}
          name={currencyName}
          maxLength={3}
          dir="ltr"
          defaultValue={currency ?? 'USD'}
          style={{ textTransform: 'uppercase' }}
          required
          readOnly={locked}
          aria-readonly={locked || undefined}
          className={locked ? 'a-locked' : undefined}
        />
      </Field>
    </>
  )
}

/**
 * Props for an input that holds a price: read-only with the lock styling when
 * the viewer lacks `prices.write` (the value still posts back as stored).
 */
export function priceInputProps(locked: boolean | undefined) {
  return locked ? { readOnly: true, 'aria-readonly': true, className: 'a-locked' } : {}
}

/**
 * A select that decides a price (pricing mode, per person/booking…). Locked,
 * it shows the stored choice disabled and posts it from a hidden input —
 * a disabled control would not be submitted at all.
 */
export function PriceSelect({
  locked,
  name,
  defaultValue,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  locked?: boolean
  name: string
  defaultValue: string
}) {
  if (!locked) return <Select {...props} name={name} defaultValue={defaultValue} />
  return (
    <>
      <Select {...props} defaultValue={defaultValue} disabled aria-readonly="true" />
      <input type="hidden" name={name} value={defaultValue} />
    </>
  )
}

/** The short note shown beside price fields the viewer may not change. */
export async function PriceLockNote() {
  const { t } = await uiI18n()
  return (
    <p className="a-hint a-price-lock" role="note">
      {t('team.prices_locked')}
    </p>
  )
}
