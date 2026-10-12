'use client'

/**
 * Personal information.
 *
 * The handoff's version of this form was four `<input defaultValue={...}>`
 * boxes and a `<button className="btn btn-orange">{t("acct_save")}</button>`
 * with no `onClick`. Nothing was controlled, nothing was validated, nothing
 * was submitted, and — worst of all — pressing Save looked exactly like
 * success. Every edit anyone ever made in that panel was discarded.
 *
 * Here the boxes are controlled, the values ride real `name`d fields into
 * `updateProfileAction`, and the outcome is announced. Three details:
 *
 *  - **Email is read-only.** Changing it is an identity change that has to go
 *    through Better Auth's verification flow; a text box that silently failed
 *    would be the same lie in a new place.
 *  - **`TextField` renders no `name` attribute** — it is built for the auth
 *    sheet, which submits through the Better Auth client rather than through
 *    FormData. Rather than fork it, the values are carried by hidden inputs,
 *    so the native form pipeline still works and the shared field keeps its
 *    label/`aria-describedby`/error wiring.
 *  - **Errors clear as you type**, matching the auth sheet. Leaving the red
 *    border up while someone is fixing the field reads as "still wrong".
 */

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'

import { FormError, FormNotice, SelectField, TextField, countryOptions } from '@/components/auth'
import { MAX_NAME_LENGTH, MAX_PHONE_LENGTH } from '@/components/auth/schemas'
import { Button } from '@/components/shared'
import { locales, localeConfig, type Locale } from '@/i18n/config'

import { IDLE_PROFILE_STATE } from './_lib/contract'
import { updateProfileAction } from './actions'

export type ProfileFormProps = {
  /** Current values, straight from the session. */
  initial: {
    name: string
    email: string
    phone: string
    country: string
    locale: Locale
  }
  /** Locale to build the country list's labels in. */
  displayLocale: Locale
}

export function ProfileForm({ initial, displayLocale }: ProfileFormProps) {
  const t = useTranslations()
  const [state, formAction, pending] = useActionState(updateProfileAction, IDLE_PROFILE_STATE)

  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [country, setCountry] = useState(initial.country)
  const [locale, setLocale] = useState<string>(initial.locale)

  /**
   * Which errors to paint.
   *
   * Cleared locally the moment a field is edited, without touching the action
   * state — `useActionState` owns that and only replaces it on the next
   * submission.
   */
  const [dismissed, setDismissed] = useState<Record<string, true>>({})
  const errorFor = (field: string): string | undefined =>
    dismissed[field] === true ? undefined : state.errors[field]

  const edit =
    (setter: (value: string) => void, field: string) =>
    (value: string): void => {
      setter(value)
      setDismissed((current) => (current[field] === true ? current : { ...current, [field]: true }))
    }

  const countries = countryOptions(displayLocale)

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* The controlled values, as the form fields the action actually reads. */}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="country" value={country} />
      <input type="hidden" name="locale" value={locale} />

      <FormError messageKey={state.formError} />
      {state.status === 'saved' && <FormNotice>{t('acct_saved')}</FormNotice>}

      <div className="bt-acct-fields">
        <TextField
          label={t('auth_name')}
          value={name}
          onChange={edit(setName, 'name')}
          autoComplete="name"
          maxLength={MAX_NAME_LENGTH}
          error={errorFor('name')}
          disabled={pending}
        />

        {/*
          Read-only rather than absent: the traveller needs to know which
          address the receipts are going to.
        */}
        <div className="bt-field" style={{ marginBottom: 0 }}>
          <label className="bt-flabel" htmlFor="bt-acct-email" style={{ display: 'block' }}>
            {t('auth_email')}
          </label>
          <input
            id="bt-acct-email"
            className="bt-input"
            type="email"
            value={initial.email}
            readOnly
            aria-describedby="bt-acct-email-note"
            style={{ background: 'var(--ivory-2)', color: 'var(--muted)' }}
          />
          <p
            id="bt-acct-email-note"
            className="muted"
            style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}
          >
            {t('acct_email_note')}
          </p>
        </div>

        <TextField
          label={t('auth_phone')}
          optionalLabel={t('co_optional')}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={edit(setPhone, 'phone')}
          placeholder="+62 ···"
          autoComplete="tel"
          maxLength={MAX_PHONE_LENGTH}
          error={errorFor('phone')}
          disabled={pending}
        />

        {/*
          A select, not the handoff's free-text box: `users.country` is
          varchar(2), so anything longer is a 500 rather than a validation
          message.
        */}
        <SelectField
          label={t('auth_country')}
          optionalLabel={t('co_optional')}
          value={country}
          onChange={edit(setCountry, 'country')}
          placeholder={t('auth_country_ph')}
          options={countries.map((option) => ({ value: option.code, label: option.label }))}
          autoComplete="country"
          error={errorFor('country')}
          disabled={pending}
        />

        {/*
          Written by hand rather than through `SelectField`, which always
          renders an empty placeholder option. A language is never "unset" —
          offering a blank choice here would let someone save nothing and
          silently fall back to English.
        */}
        <div className="bt-field" style={{ marginBottom: 0 }}>
          <label className="bt-flabel" htmlFor="bt-acct-locale" style={{ display: 'block' }}>
            {t('acct_lang')}
          </label>
          <select
            id="bt-acct-locale"
            className="bt-input"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            disabled={pending}
            aria-describedby="bt-acct-locale-hint"
          >
            {locales.map((code) => (
              <option key={code} value={code}>
                {localeConfig[code].label}
              </option>
            ))}
          </select>
          <p
            id="bt-acct-locale-hint"
            className="muted"
            style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}
          >
            {t('acct_lang_hint')}
          </p>
        </div>
      </div>

      <div>
        <Button type="submit" variant="orange" disabled={pending}>
          {pending ? t('auth_working') : t('acct_save')}
        </Button>
      </div>
    </form>
  )
}
