import { desc, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { siteSettings, users } from '@/db/schema'
import { formatMoney } from '@/lib/money'
import { localeConfig, locales } from '@/i18n/config'

import { localeFieldName } from '../../_lib/form'
import { param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import {
  POLICY_IDS,
  readSettings,
  SETTING_KEYS,
  type PolicyId,
  type PolicySetting,
} from '../../_lib/settings'
import { Field, TextArea, TextInput } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Pill, When } from '../../_ui/table'
import { saveContact, saveCurrencies, saveFees, savePolicy } from './actions'

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
  terms: 'Terms of service',
  privacy: 'Privacy policy',
  refund: 'Refund and cancellation policy',
  cookies: 'Cookie policy',
}

const POLICY_NOTES: Record<PolicyId, string> = {
  terms:
    'The contract the traveller accepts at checkout. `orders.terms_version` pins the effective date below, so a later edit does not rewrite what an existing customer agreed to.',
  privacy:
    'What is collected and why. Required before an app store, a payment provider or an EU/GCC visitor’s regulator will take the site seriously.',
  refund:
    'A payment provider will not open a live account without one, and this text is the evidence that wins a “services not rendered” chargeback — a dispute window on future-dated travel runs up to ~540 days.',
  cookies:
    'What the consent banner is actually consenting to. A banner that links to nothing is worse than no banner.',
}

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const params = await searchParams

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

  return (
    <>
      <PageHead
        title="Configuration"
        description="Currencies, fees, contact details and the four policy pages. Each section saves on its own and every save is audited."
      />
      <Flash searchParams={params} />

      {invalid.length > 0 ? (
        <div className="a-flash err" role="status">
          Stored values for <strong>{invalid.join(', ')}</strong> do not match the expected shape
          and are being ignored — the site is running on the shipped defaults for them. Saving the
          section below repairs it.
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
        <strong>Not yet wired to the public site.</strong> These values are stored and audited, but
        the customer-facing pages still read their own hard-coded constants. Connecting them means
        calling <code>readSetting()</code> from <code>(admin)/_lib/settings.ts</code> in the footer,
        the contact page and the four policy routes. Until that lands, treat this screen as the
        source of record, not the live configuration.
      </div>

      <div className="a-card">
        <h2>Currencies and presentment</h2>
        <p className="a-hint">
          The base currency is what the catalog is authored in. Changing it does{' '}
          <strong>not</strong> re-denominate anything — every price carries its own currency column
          — it changes which currency new authoring defaults to and which one totals are compared
          in.
        </p>
        <SectionMeta name="currencies" meta={meta} missing={missing} />

        <form className="a-form" action={saveCurrencies} style={{ marginBlockStart: 12 }}>
          <div className="a-row">
            <Field label="Base currency" htmlFor="baseCurrency" hint="ISO 4217, e.g. USD.">
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
              label="Default presentment currency"
              htmlFor="defaultPresentment"
              hint="Shown to a buyer whose own currency is not offered. Must appear in the list."
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
            label="Presentment currencies"
            htmlFor="presentmentCurrencies"
            hint="One ISO 4217 code per line. These are the currencies a buyer may be quoted in."
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
              Save currencies
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>Fees</h2>
        <p className="a-hint">
          Basis points and integer minor units, never percentages as floats — 250 bps is 2.50%, and
          a fee stored as <code>2.5</code> is how an invoice starts disagreeing with a settlement
          report by a cent. Fees are applied server-side in the pricing path; nothing here is
          assembled in the browser.
        </p>
        <SectionMeta name="fees" meta={meta} missing={missing} />

        <form className="a-form" action={saveFees} style={{ marginBlockStart: 12 }}>
          <div className="a-row">
            <Field
              label="Service fee (bps)"
              htmlFor="serviceFeeBps"
              hint={`${(fees.serviceFeeBps / 100).toFixed(2)}% of the subtotal.`}
            >
              <TextInput
                id="serviceFeeBps"
                name="serviceFeeBps"
                inputMode="numeric"
                defaultValue={String(fees.serviceFeeBps)}
              />
            </Field>
            <Field
              label="Booking fee (minor units)"
              htmlFor="bookingFeeMinor"
              hint={`Flat, per order — currently ${formatMoney(fees.bookingFeeMinor, fees.feeCurrency, 'en')}.`}
            >
              <TextInput
                id="bookingFeeMinor"
                name="bookingFeeMinor"
                inputMode="numeric"
                defaultValue={String(fees.bookingFeeMinor)}
              />
            </Field>
            <Field
              label="Payment surcharge (bps)"
              htmlFor="paymentSurchargeBps"
              hint={`${(fees.paymentSurchargeBps / 100).toFixed(2)}%. Check the acquirer's rules before charging one — several card schemes forbid it outright.`}
            >
              <TextInput
                id="paymentSurchargeBps"
                name="paymentSurchargeBps"
                inputMode="numeric"
                defaultValue={String(fees.paymentSurchargeBps)}
              />
            </Field>
            <Field label="Fee currency" htmlFor="feeCurrency" hint="Applies to the flat fee.">
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
          <div className="a-actions">
            <button className="a-btn" type="submit">
              Save fees
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>Contact</h2>
        <p className="a-hint">
          The WhatsApp number appears in the footer and on the contact page. It was hard-coded in
          two components, which is exactly how the two of them end up disagreeing.
        </p>
        <SectionMeta name="contact" meta={meta} missing={missing} />

        <form className="a-form" action={saveContact} style={{ marginBlockStart: 12 }}>
          <div className="a-row">
            <Field
              label="WhatsApp number"
              htmlFor="whatsappNumber"
              hint="E.164 without the +. Punctuation is stripped on save, so pasting +62 812 3456 7890 is fine."
            >
              <TextInput
                id="whatsappNumber"
                name="whatsappNumber"
                defaultValue={contact.whatsappNumber}
                required
              />
            </Field>
            <Field
              label="Displayed number"
              htmlFor="whatsappDisplay"
              hint="How it is printed. Formatting is free-form."
            >
              <TextInput
                id="whatsappDisplay"
                name="whatsappDisplay"
                defaultValue={contact.whatsappDisplay}
                required
              />
            </Field>
            <Field label="Support e-mail" htmlFor="supportEmail">
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
            Link preview: <code>https://wa.me/{contact.whatsappNumber}</code>
          </p>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              Save contact details
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>Policy pages</h2>
        <p className="a-hint">
          The bodies of /terms, /privacy, /refund and /cookies. Plain text — a blank line starts a
          new paragraph, and nothing is interpreted as HTML, so a pasted policy cannot inject markup
          into a customer-facing page. Author English first; Arabic and Indonesian fall back to it
          until they are filled in.
        </p>
      </div>

      {POLICY_IDS.map((id) => {
        const key = `policy.${id}` as const
        const policy: PolicySetting = values[key]
        const untranslated = locales.filter((locale) => (policy.body[locale] ?? '').trim() === '')

        return (
          <details className="a-card" key={id} open={openPolicy === id}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
              {POLICY_TITLES[id]}{' '}
              {missing.includes(key) ? (
                <Pill tone="warn">placeholder</Pill>
              ) : (
                <Pill tone="good">edited</Pill>
              )}{' '}
              {untranslated.length > 0 ? (
                <Pill tone="neutral">
                  {untranslated.map((locale) => localeConfig[locale].short).join(' ')} missing
                </Pill>
              ) : null}
            </summary>

            <p className="a-hint" style={{ marginBlockStart: 10 }}>
              {POLICY_NOTES[id]}
            </p>
            <SectionMeta name={key} meta={meta} missing={missing} />

            <form
              className="a-form"
              action={savePolicy.bind(null, id)}
              style={{ marginBlockStart: 12 }}
            >
              <Field
                label="Effective date"
                htmlFor={`${id}-updated`}
                hint="YYYY-MM-DD, authored by hand. Never derived from the save time — a date that moves on every edit silently rewrites terms someone already accepted."
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
                <legend>Body</legend>
                <div className="a-l10n">
                  {locales.map((locale) => {
                    const fieldName = localeFieldName('body', locale)
                    const fieldId = `${id}-${fieldName}`
                    return (
                      <div className="a-field" key={locale}>
                        <label htmlFor={fieldId}>{localeConfig[locale].label}</label>
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
                  Save {POLICY_TITLES[id].toLowerCase()}
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
  name,
  meta,
  missing,
}: {
  name: string
  meta: Map<string, { updatedAt: Date; actorEmail: string | null }>
  missing: readonly string[]
}) {
  const row = meta.get(name)

  if (!row || missing.includes(name)) {
    return (
      <p className="a-hint">
        Never edited — running on the shipped default. Saving writes the first row.
      </p>
    )
  }

  return (
    <p className="a-hint">
      Last saved <When value={row.updatedAt} /> by {row.actorEmail ?? 'an account since removed'}.
    </p>
  )
}
