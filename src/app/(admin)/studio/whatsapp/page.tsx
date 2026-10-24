import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { orders, whatsappMessages } from '@/db/schema'
import { localeConfig, locales } from '@/i18n/config'
import { AUTOMATION_KEYS, AUTOMATIONS } from '@/lib/whatsapp/automations'
import {
  automationSetting,
  DEFAULT_MAZBOT_URL,
  readWhatsappSettings,
  resolveCredentials,
  waSecretHint,
} from '@/lib/whatsapp/settings'

import { getAdminI18n } from '../../_lib/i18n'
import { param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Field } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When, type PillTone } from '../../_ui/table'
import {
  retryWhatsapp,
  saveWhatsappAutomations,
  saveWhatsappConnection,
  sendWhatsappTest,
} from './actions'

export const dynamic = 'force-dynamic'

const STATUSES = ['queued', 'sent', 'failed', 'skipped'] as const
const TONES: Record<string, PillTone> = {
  queued: 'info',
  sent: 'good',
  failed: 'bad',
  skipped: 'neutral',
}

/** Masks a phone number for the log: +62 81•••••234. */
function mask(phone: string | null): string {
  if (!phone) return '-'
  return `+${phone.slice(0, 4)}${'•'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-3)}`
}

/**
 * Studio → WhatsApp (client proposal §09 «لوحة إدارة الرسائل»): connection,
 * test message, the automations (switch, text per language, template id)
 * and the send log with retry.
 */
export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const params = await searchParams
  const { t } = await getAdminI18n()
  const statusFilter = param(params, 'status')
  const status = (STATUSES as readonly string[]).includes(statusFilter ?? '') ? statusFilter : null

  const settings = await readWhatsappSettings()
  const [creds, keyHint, passwordHint, log] = await Promise.all([
    resolveCredentials(settings),
    waSecretHint('whatsapp_api_key'),
    waSecretHint('whatsapp_password'),
    db
      .select({
        id: whatsappMessages.id,
        automation: whatsappMessages.automation,
        toPhone: whatsappMessages.toPhone,
        status: whatsappMessages.status,
        error: whatsappMessages.error,
        attempts: whatsappMessages.attempts,
        createdAt: whatsappMessages.createdAt,
        orderNumber: orders.orderNumber,
      })
      .from(whatsappMessages)
      .leftJoin(orders, eq(orders.id, whatsappMessages.orderId))
      .where(status ? eq(whatsappMessages.status, status) : undefined)
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(100),
  ])

  const stored = (hint: string | null) =>
    hint === null ? t('wa.not_stored') : t('wa.stored', { hint })

  return (
    <>
      <PageHead title={t('wa.title')} description={t('wa.description')} />
      <Flash searchParams={params} />

      <form className="a-card a-form" action={saveWhatsappConnection}>
        <h2>{t('wa.connection')}</h2>
        <label className="a-check">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />{' '}
          {t('wa.enabled')}
        </label>
        <div className="a-row">
          <Field label={t('wa.provider')} htmlFor="provider">
            <select
              className="a-select"
              id="provider"
              name="provider"
              defaultValue={settings.provider}
            >
              <option value="mazbot">{t('wa.provider_mazbot')}</option>
              <option value="meta">{t('wa.provider_meta')}</option>
            </select>
          </Field>
          <Field
            label={t('wa.api_url')}
            htmlFor="apiUrl"
            hint={creds.fromEnv.apiUrl ? t('wa.from_env') : t('wa.api_url_hint')}
          >
            <input
              className="a-input"
              id="apiUrl"
              name="apiUrl"
              type="url"
              dir="ltr"
              placeholder={DEFAULT_MAZBOT_URL}
              defaultValue={settings.apiUrl}
            />
          </Field>
        </div>
        <div className="a-row">
          <Field
            label={`${t('wa.api_key')} — ${stored(keyHint)}`}
            htmlFor="apiKey"
            hint={creds.fromEnv.apiKey ? t('wa.from_env') : t('wa.api_key_hint')}
          >
            <input
              className="a-input"
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="off"
              dir="ltr"
            />
          </Field>
          <label className="a-check">
            <input type="checkbox" name="clearKey" /> {t('wa.clear_key')}
          </label>
        </div>
        <div className="a-row">
          <Field
            label={t('wa.login_email')}
            htmlFor="loginEmail"
            hint={creds.fromEnv.loginEmail ? t('wa.from_env') : t('wa.login_email_hint')}
          >
            <input
              className="a-input"
              id="loginEmail"
              name="loginEmail"
              type="email"
              dir="ltr"
              defaultValue={settings.loginEmail}
            />
          </Field>
          <Field
            label={`${t('wa.password')} — ${stored(passwordHint)}`}
            htmlFor="password"
            hint={creds.fromEnv.password ? t('wa.from_env') : t('wa.password_hint')}
          >
            <input
              className="a-input"
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              dir="ltr"
            />
          </Field>
        </div>
        <div className="a-row">
          <Field label={t('wa.sender')} htmlFor="senderNumber" hint={t('wa.sender_hint')}>
            <input
              className="a-input"
              id="senderNumber"
              name="senderNumber"
              dir="ltr"
              defaultValue={settings.senderNumber}
            />
          </Field>
          <Field label={t('wa.incomplete_minutes')} htmlFor="incompleteAfterMinutes">
            <input
              className="a-input"
              id="incompleteAfterMinutes"
              name="incompleteAfterMinutes"
              type="number"
              min={15}
              max={1440}
              defaultValue={settings.incompleteAfterMinutes}
            />
          </Field>
        </div>
        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            {t('wa.save')}
          </button>
        </div>
      </form>

      <form className="a-card a-form" action={sendWhatsappTest}>
        <h2>{t('wa.test')}</h2>
        <p className="muted">{t('wa.test_hint')}</p>
        <div className="a-row">
          <Field label={t('wa.test_to')} htmlFor="to">
            <input className="a-input" id="to" name="to" dir="ltr" placeholder="+62…" required />
          </Field>
          <Field label={t('wa.test_template')} htmlFor="template">
            <input className="a-input" id="template" name="template" dir="ltr" />
          </Field>
        </div>
        <Field label={t('wa.test_text')} htmlFor="text">
          <input className="a-input" id="text" name="text" placeholder={t('wa.test_default')} />
        </Field>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('wa.test_send')}
          </button>
        </div>
      </form>

      <form className="a-card a-form" id="automations" action={saveWhatsappAutomations}>
        <h2>{t('wa.automations')}</h2>
        <p className="muted">{t('wa.automations_hint')}</p>
        {AUTOMATION_KEYS.map((key) => {
          const setting = automationSetting(settings, key)
          return (
            <details key={key} className="a-card">
              <summary>
                <strong>{t(`wa.a_${key}`)}</strong>{' '}
                <Pill tone={settings.enabled && setting.enabled ? 'good' : 'neutral'}>
                  {setting.enabled ? t('wa.on') : t('wa.st_skipped')}
                </Pill>
              </summary>
              <label className="a-check">
                <input type="checkbox" name={`${key}.enabled`} defaultChecked={setting.enabled} />{' '}
                {t('wa.on')}
              </label>
              <p className="muted">
                {t('wa.when')}: {t(`wa.w_${key}`)}
                <br />
                {t('wa.vars')}:{' '}
                <code dir="ltr">{AUTOMATIONS[key].vars.map((v) => `{${v}}`).join(' ')}</code>
              </p>
              {locales.map((locale) => (
                <div key={locale} className="a-row">
                  <Field
                    label={localeConfig[locale].label}
                    htmlFor={`${key}.text.${locale}`}
                    hint={t('wa.reset_hint')}
                  >
                    <textarea
                      className="a-input"
                      id={`${key}.text.${locale}`}
                      name={`${key}.text.${locale}`}
                      dir={localeConfig[locale].dir}
                      rows={6}
                      maxLength={2000}
                      defaultValue={setting.texts[locale] || AUTOMATIONS[key].defaults[locale]}
                    />
                  </Field>
                  <Field
                    label={t('wa.template_id', { lang: localeConfig[locale].short })}
                    htmlFor={`${key}.template.${locale}`}
                  >
                    <input
                      className="a-input"
                      id={`${key}.template.${locale}`}
                      name={`${key}.template.${locale}`}
                      dir="ltr"
                      defaultValue={setting.templates[locale]}
                    />
                  </Field>
                </div>
              ))}
            </details>
          )
        })}
        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            {t('wa.save_automations')}
          </button>
        </div>
      </form>

      <div className="a-card" id="log">
        <h2>{t('wa.log')}</h2>
        <form className="a-row" method="get">
          <select className="a-select" name="status" defaultValue={status ?? ''}>
            <option value="">{t('wa.all')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`wa.st_${value}`)}
              </option>
            ))}
          </select>
          <button className="a-btn" type="submit">
            {t('wa.col_status')}
          </button>
        </form>
        {log.length === 0 ? (
          <Empty>{t('wa.log_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('wa.col_when')}</th>
                <th>{t('wa.col_rule')}</th>
                <th>{t('wa.col_to')}</th>
                <th>{t('wa.col_status')}</th>
                <th>{t('wa.col_error')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {log.map((row) => (
                <tr key={row.id}>
                  <td>
                    <When value={row.createdAt} />
                  </td>
                  <td>
                    {t(`wa.a_${row.automation}`)}
                    {row.orderNumber ? <small className="muted"> · {row.orderNumber}</small> : null}
                  </td>
                  <td dir="ltr">{mask(row.toPhone)}</td>
                  <td>
                    <Pill tone={TONES[row.status] ?? 'neutral'}>{t(`wa.st_${row.status}`)}</Pill>
                    {row.attempts > 1 ? <small className="muted"> ×{row.attempts}</small> : null}
                  </td>
                  <td>
                    <small>{row.error ?? ''}</small>
                  </td>
                  <td>
                    {row.status === 'failed' && row.toPhone ? (
                      <form action={retryWhatsapp}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="a-btn" type="submit">
                          {t('wa.retry')}
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  )
}
