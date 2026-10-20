import { desc, eq, inArray } from 'drizzle-orm'
import { Fragment, type ReactNode } from 'react'

import { db } from '@/db'
import { siteSettings, users } from '@/db/schema'
import { formatMoney } from '@/lib/money'
import { formatMoneyInput, formatPercentInput } from '@/lib/money-input'
import { localeConfig, locales } from '@/i18n/config'

import type { Translate } from '../../_i18n'
import { localeFieldName } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import {
  POLICY_IDS,
  readSettings,
  SETTING_KEYS,
  type PolicyId,
  type PolicySetting,
} from '../../_lib/settings'
import { Checkbox, Field, LocalizedField, TextArea, TextInput } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Pill, When } from '../../_ui/table'
import { saveContact, saveCurrencies, saveFees, savePolicy, saveSeller } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Configuration.
 *
 * The things the business changes without a deployment. Each section saves
 * independently — one form per settings row — so an operator fixing a
 * WhatsApp number cannot accidentally re-submit a stale copy of the fee
 * schedule they never looked at. That is the whole reason `site_settings` is
 * a key/value table rather than one wide row.
 *
 * Sections that are still on their shipped default say so, because "no row in
 * the table" and "someone chose this value" look identical in a form and are
 * very different facts when something is wrong.
 */

const POLICY_TITLES: Record<PolicyId, string> = {
  terms: 'config.policy_terms',
  privacy: 'config.policy_privacy',
  refund: 'config.policy_refund',
  cookies: 'config.policy_cookies',
}

const POLICY_NOTES: Record<PolicyId, string> = {
  terms: 'config.note_terms',
  privacy: 'config.note_privacy',
  refund: 'config.note_refund',
  cookies: 'config.note_cookies',
}

/**
 * A translated sentence with markup inside it: `{name}` placeholders in the
 * template are replaced by the given nodes, so word order stays the
 * translator's.
 */
function rich(template: string, parts: Record<string, ReactNode>): ReactNode {
  return template
    .split(/\{(\w+)\}/g)
    .map((piece, index) =>
      index % 2 === 1 ? (
        <Fragment key={index}>{parts[piece] ?? `{${piece}}`}</Fragment>
      ) : (
        <Fragment key={index}>{piece}</Fragment>
      ),
    )
}

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const { t, intl } = await getAdminI18n()
  const params = await searchParams
  const pct = (bps: number) =>
    new Intl.NumberFormat(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      bps / 100,
    )

  const [{ values, invalid, missing }, rows] = await Promise.all([
    readSettings(),
    db
      .select({
        key: siteSettings.key,
        updatedAt: siteSettings.updatedAt,
        actorEmail: users.email,
      })
      .from(siteSettings)
      .leftJoin(users, eq(users.id, siteSettings.updatedByActorId))
      .where(inArray(siteSettings.key, SETTING_KEYS))
      .orderBy(desc(siteSettings.updatedAt)),
  ])

  const meta = new Map(rows.map((row) => [row.key, row]))
  const openPolicy = param(params, 'policy')

  const fees = values.fees
  const currencies = values.currencies
  const contact = values.contact
  const seller = values.seller

  return (
    <>
      <PageHead title={t('config.title')} description={t('config.description')} />
      <Flash searchParams={params} />

      {invalid.length > 0 ? (
        <div className="a-flash err" role="status">
          {rich(t('config.invalid'), {
            keys: <strong>{invalid.map((key) => settingName(t, key)).join(', ')}</strong>,
          })}
        </div>
      ) : null}

      {/*
        Stated rather than implied. Everything below is stored, validated and
        audited, and the customer-facing pages that should consume it still
        read their own constants — the WhatsApp number from an environment
        variable, the policy bodies from the translation catalogue. Those
        pages belong to another slice; the reader they need is
        `readSetting()` in `(admin)/_lib/settings.ts`. An operator has to know
        that editing a value here does not yet change what a visitor sees,
        because the alternative is discovering it from a customer.
      */}
      <div className="a-flash warn" role="status">
        {/* One flex item: bare text runs and <code> would each become their own column. */}
        <div>
          <strong>{t('config.not_wired_title')}</strong> {t('config.not_wired_body')}
        </div>
      </div>

      <div className="a-card">
        <h2>{t('config.currencies_title')}</h2>
        <p className="a-hint">
          {rich(t('config.currencies_hint'), { not: <strong>{t('config.not')}</strong> })}
        </p>
        <SectionMeta t={t} name="currencies" meta={meta} missing={missing} />

        <form className="a-form" action={saveCurrencies} style={{ marginBlockStart: 12 }}>
          <div className="a-row">
            <Field
              label={t('config.base_currency')}
              htmlFor="baseCurrency"
              hint={t('config.base_currency_hint')}
            >
              <TextInput
                id="baseCurrency"
                name="baseCurrency"
                maxLength={3}
                defaultValue={currencies.baseCurrency}
                style={{ textTransform: 'uppercase' }}
                required
              />
            </Field>
            <Field
              label={t('config.default_presentment')}
              htmlFor="defaultPresentment"
              hint={t('config.default_presentment_hint')}
            >
              <TextInput
                id="defaultPresentment"
                name="defaultPresentment"
                maxLength={3}
                defaultValue={currencies.defaultPresentment}
                style={{ textTransform: 'uppercase' }}
                required
              />
            </Field>
          </div>
          <Field
            label={t('config.presentment_list')}
            htmlFor="presentmentCurrencies"
            hint={t('config.presentment_list_hint')}
          >
            <TextArea
              id="presentmentCurrencies"
              name="presentmentCurrencies"
              rows={5}
              defaultValue={currencies.presentmentCurrencies.join('\n')}
            />
          </Field>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('config.save_currencies')}
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>{t('config.fees_title')}</h2>
        <p className="a-hint">{t('config.fees_hint')}</p>
        <SectionMeta t={t} name="fees" meta={meta} missing={missing} />

        <form className="a-form" action={saveFees} style={{ marginBlockStart: 12 }}>
          <div className="a-row">
            <Field
              label={t('config.service_fee')}
              htmlFor="serviceFeeBps"
              hint={t('config.service_fee_hint', { pct: pct(fees.serviceFeeBps) })}
            >
              <TextInput
                id="serviceFeeBps"
                name="serviceFeeBps"
                inputMode="decimal"
                dir="ltr"
                defaultValue={formatPercentInput(fees.serviceFeeBps)}
              />
            </Field>
            <Field
              label={t('config.booking_fee')}
              htmlFor="bookingFeeMinor"
              hint={t('config.booking_fee_hint', {
                amount: formatMoney(fees.bookingFeeMinor, fees.feeCurrency, intl),
              })}
            >
              <TextInput
                id="bookingFeeMinor"
                name="bookingFeeMinor"
                inputMode="decimal"
                dir="ltr"
                defaultValue={formatMoneyInput(fees.bookingFeeMinor, fees.feeCurrency)}
              />
            </Field>
            <Field
              label={t('config.surcharge')}
              htmlFor="paymentSurchargeBps"
              hint={t('config.surcharge_hint', { pct: pct(fees.paymentSurchargeBps) })}
            >
              <TextInput
                id="paymentSurchargeBps"
                name="paymentSurchargeBps"
                inputMode="decimal"
                dir="ltr"
                defaultValue={formatPercentInput(fees.paymentSurchargeBps)}
              />
            </Field>
            <Field
              label={t('config.fee_currency')}
              htmlFor="feeCurrency"
              hint={t('config.fee_currency_hint')}
            >
              <TextInput
                id="feeCurrency"
                name="feeCurrency"
                maxLength={3}
                defaultValue={fees.feeCurrency}
                style={{ textTransform: 'uppercase' }}
                required
              />
            </Field>
          </div>
          <Checkbox
            name="feesEnabled"
            label={t('fin.fees_enabled')}
            hint={t('fin.fees_enabled_hint')}
            defaultChecked={fees.enabled}
          />
          <h3 style={{ marginBlock: '12px 0' }}>{t('fin.tax_title')}</h3>
          <p className="a-hint">{t('fin.tax_hint')}</p>
          <div className="a-row">
            <Field label={t('fin.tax_rate')} htmlFor="taxRateBps" hint={t('fin.tax_rate_hint')}>
              <TextInput
                id="taxRateBps"
                name="taxRateBps"
                inputMode="decimal"
                dir="ltr"
                defaultValue={formatPercentInput(fees.taxRateBps)}
              />
            </Field>
          </div>
          <LocalizedField
            name="taxLabel"
            label={t('fin.tax_label')}
            hint={t('fin.tax_label_hint')}
            value={fees.taxLabel}
          />
          <Checkbox
            name="taxEnabled"
            label={t('fin.tax_enabled')}
            hint={t('fin.tax_enabled_hint')}
            defaultChecked={fees.taxEnabled}
          />
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('config.save_fees')}
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>{t('fin.seller_title')}</h2>
        <p className="a-hint">{t('fin.seller_hint')}</p>
        <SectionMeta t={t} name="seller" meta={meta} missing={missing} />
        <form className="a-form" action={saveSeller} style={{ marginBlockStart: 12 }}>
          <div className="a-row">
            <Field label={t('fin.seller_name')} htmlFor="sellerName">
              <TextInput id="sellerName" name="sellerName" defaultValue={seller.businessName} />
            </Field>
            <Field label={t('fin.seller_tax_id')} htmlFor="sellerTaxId">
              <TextInput
                id="sellerTaxId"
                name="sellerTaxId"
                dir="ltr"
                defaultValue={seller.taxId}
              />
            </Field>
          </div>
          <Field label={t('fin.seller_address')} htmlFor="sellerAddress">
            <TextArea
              id="sellerAddress"
              name="sellerAddress"
              rows={3}
              defaultValue={seller.address}
            />
          </Field>
          <div className="a-row">
            <Field label={t('fin.seller_email')} htmlFor="sellerEmail">
              <TextInput
                id="sellerEmail"
                name="sellerEmail"
                dir="ltr"
                defaultValue={seller.email}
              />
            </Field>
            <Field label={t('fin.seller_phone')} htmlFor="sellerPhone">
              <TextInput
                id="sellerPhone"
                name="sellerPhone"
                dir="ltr"
                defaultValue={seller.phone}
              />
            </Field>
          </div>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('fin.save_seller')}
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>{t('config.contact_title')}</h2>
        <p className="a-hint">{t('config.contact_hint')}</p>
        <SectionMeta t={t} name="contact" meta={meta} missing={missing} />

        <form className="a-form" action={saveContact} style={{ marginBlockStart: 12 }}>
          <div className="a-row">
            <Field
              label={t('config.whatsapp_number')}
              htmlFor="whatsappNumber"
              hint={t('config.whatsapp_number_hint')}
            >
              <TextInput
                id="whatsappNumber"
                name="whatsappNumber"
                defaultValue={contact.whatsappNumber}
                required
              />
            </Field>
            <Field
              label={t('config.displayed_number')}
              htmlFor="whatsappDisplay"
              hint={t('config.displayed_number_hint')}
            >
              <TextInput
                id="whatsappDisplay"
                name="whatsappDisplay"
                defaultValue={contact.whatsappDisplay}
                required
              />
            </Field>
            <Field label={t('config.support_email')} htmlFor="supportEmail">
              <TextInput
                id="supportEmail"
                name="supportEmail"
                type="email"
                defaultValue={contact.supportEmail}
                required
              />
            </Field>
          </div>
          <p className="a-hint">
            {rich(t('config.link_preview'), {
              link: <code dir="ltr">https://wa.me/{contact.whatsappNumber}</code>,
            })}
          </p>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('config.save_contact')}
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>{t('config.policies_title')}</h2>
        <p className="a-hint">{t('config.policies_hint')}</p>
      </div>

      {POLICY_IDS.map((id) => {
        const key = `policy.${id}` as const
        const policy: PolicySetting = values[key]
        const untranslated = locales.filter((locale) => (policy.body[locale] ?? '').trim() === '')

        return (
          <details className="a-card" key={id} open={openPolicy === id}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
              {t(POLICY_TITLES[id])}{' '}
              {missing.includes(key) ? (
                <Pill tone="warn">{t('config.placeholder')}</Pill>
              ) : (
                <Pill tone="good">{t('config.edited')}</Pill>
              )}{' '}
              {untranslated.length > 0 ? (
                <Pill tone="neutral">
                  {t('config.missing_locales', {
                    locales: untranslated
                      .map((locale) => t(`translations.lang_${locale}`))
                      .join(', '),
                  })}
                </Pill>
              ) : null}
            </summary>

            <p className="a-hint" style={{ marginBlockStart: 10 }}>
              {t(POLICY_NOTES[id])}
            </p>
            <SectionMeta t={t} name={key} meta={meta} missing={missing} />

            <form
              className="a-form"
              action={savePolicy.bind(null, id)}
              style={{ marginBlockStart: 12 }}
            >
              <Field
                label={t('config.effective_date')}
                htmlFor={`${id}-updated`}
                hint={t('config.effective_date_hint')}
              >
                <TextInput
                  id={`${id}-updated`}
                  name="updated"
                  type="date"
                  defaultValue={policy.updated}
                  required
                />
              </Field>

              <fieldset className="a-fieldset">
                <legend>{t('config.body')}</legend>
                <div className="a-l10n">
                  {locales.map((locale) => {
                    const fieldName = localeFieldName('body', locale)
                    const fieldId = `${id}-${fieldName}`
                    return (
                      <div className="a-field" key={locale}>
                        <label htmlFor={fieldId}>{t(`translations.lang_${locale}`)}</label>
                        <TextArea
                          id={fieldId}
                          name={fieldName}
                          rows={16}
                          defaultValue={policy.body[locale] ?? ''}
                          lang={locale}
                          dir={localeConfig[locale].dir}
                          required={locale === 'en'}
                        />
                      </div>
                    )
                  })}
                </div>
              </fieldset>

              <div className="a-actions">
                <button className="a-btn" type="submit">
                  {t('config.save_policy', { policy: t(POLICY_TITLES[id]) })}
                </button>
              </div>
            </form>
          </details>
        )
      })}
    </>
  )
}

/** Who last changed a section, or a note that it is still on its default. */
function SectionMeta({
  t,
  name,
  meta,
  missing,
}: {
  t: Translate
  name: string
  meta: Map<string, { updatedAt: Date; actorEmail: string | null }>
  missing: readonly string[]
}) {
  const row = meta.get(name)

  if (!row || missing.includes(name)) {
    return <p className="a-hint">{t('config.never_edited')}</p>
  }

  return (
    <p className="a-hint">
      {rich(t('config.last_saved'), {
        when: <When value={row.updatedAt} />,
        actor: row.actorEmail ?? t('config.removed_account'),
      })}
    </p>
  )
}

/** The section a stored setting belongs to, by the name the page shows. */
function settingName(t: Translate, key: string): string {
  if (key.startsWith('policy.')) {
    const label = t(`config.${key.replace('.', '_')}`)
    if (!label.startsWith('config.')) return label
  }
  const names: Record<string, string> = {
    currencies: 'config.currencies_title',
    fees: 'config.fees_title',
    contact: 'config.contact_title',
    map: 'map.settings',
    security: 'protection.settings',
    assistant: 'assistant.settings_title',
    vip: 'p3.vip_settings',
  }
  const name = names[key]
  return name ? t(name) : key
}
