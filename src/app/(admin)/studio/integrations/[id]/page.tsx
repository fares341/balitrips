import { asc, desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import {
  activities,
  activitySupplierOffers,
  activityTiers,
  externalProductMappings,
  integrationImports,
  integrationLogs,
  supplierIntegrations,
  suppliers,
} from '@/db/schema'
import { pick } from '@/lib/content/localize'
import {
  ADAPTER_OPERATIONS,
  canSync,
  isConnectionType,
  SERVICES,
  supports,
} from '@/lib/integrations/adapter'
import { integrationsKeyStatus } from '@/lib/integrations/crypto'
import { CONFLICT_POLICIES, CSV_COLUMNS } from '@/lib/integrations/csv'
import { adapterFor, isImplemented } from '@/lib/integrations/registry'
import { integrationPublicColumns } from '@/lib/integrations/service'
import { EVENT_ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@/lib/integrations/webhook'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { isUuid } from '../../../_lib/form'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { Advanced } from '../../../_ui/advanced'
import { Checkbox } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import {
  addMapping,
  createWebhookSecret,
  removeCredential,
  removeMapping,
  saveCredential,
  saveIntegrationSettings,
  setIntegrationStatus,
  syncNow,
  uploadImport,
} from '../actions'
import { KeyNotice, StatusPill } from '../parts'
import { WebhookSecretForm } from '../webhook-secret'

export const dynamic = 'force-dynamic'

function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? ''
  return raw.replace(/\/+$/, '')
}

export default async function IntegrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('integrations.write')
  const { t, locale, intl } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams
  if (!isUuid(id)) notFound()

  // Named, non-secret columns only: the sealed keys never reach this page.
  const [row] = await db
    .select({ ...integrationPublicColumns, supplierName: suppliers.name })
    .from(supplierIntegrations)
    .innerJoin(suppliers, eq(suppliers.id, supplierIntegrations.supplierId))
    .where(eq(supplierIntegrations.id, id))
    .limit(1)
  if (!row) notFound()

  const keyStatus = integrationsKeyStatus()
  const type = isConnectionType(row.connectionType) ? row.connectionType : null
  const adapter = type ? adapterFor(type) : null
  const ready = type !== null && isImplemented(type)

  const [offers, mappings, imports, logs] = await Promise.all([
    db
      .select({
        id: activitySupplierOffers.id,
        costMinor: activitySupplierOffers.costMinor,
        currency: activitySupplierOffers.currency,
        activityName: activities.name,
        tierName: activityTiers.name,
      })
      .from(activitySupplierOffers)
      .innerJoin(activities, eq(activities.id, activitySupplierOffers.activityId))
      .leftJoin(activityTiers, eq(activityTiers.id, activitySupplierOffers.tierId))
      .where(eq(activitySupplierOffers.supplierId, row.supplierId))
      .orderBy(asc(activitySupplierOffers.priority)),
    db
      .select()
      .from(externalProductMappings)
      .where(eq(externalProductMappings.integrationId, id))
      .orderBy(asc(externalProductMappings.externalId)),
    db
      .select({
        id: integrationImports.id,
        fileName: integrationImports.fileName,
        rowCount: integrationImports.rowCount,
        status: integrationImports.status,
        summary: integrationImports.summary,
        createdAt: integrationImports.createdAt,
      })
      .from(integrationImports)
      .where(eq(integrationImports.integrationId, id))
      .orderBy(desc(integrationImports.createdAt))
      .limit(20),
    db
      .select()
      .from(integrationLogs)
      .where(eq(integrationLogs.integrationId, id))
      .orderBy(desc(integrationLogs.createdAt))
      .limit(50),
  ])

  const offerLabel = new Map(
    offers.map((offer) => [
      offer.id,
      `${pick(offer.activityName, locale)}${offer.tierName ? ` · ${pick(offer.tierName, locale)}` : ''}`,
    ]),
  )

  const hints = Object.entries(row.credentialsHint ?? {})
  const webhookUrl = `${siteOrigin()}/api/integrations/${id}/webhook`
  const active = row.status !== 'paused'

  return (
    <>
      <PageHead
        title={row.name}
        description={t('int.detail_description', {
          supplier: row.supplierName,
          type: t(`int.type_${row.connectionType}`),
        })}
        actions={
          <>
            <Link className="a-btn ghost" href={adminHref('/integrations')}>
              {t('int.back')}
            </Link>
            <form action={setIntegrationStatus.bind(null, id)}>
              <input type="hidden" name="status" value={active ? 'paused' : 'active'} />
              <button className={active ? 'a-btn ghost' : 'a-btn accent'} type="submit">
                {active ? t('int.pause') : t('int.activate')}
              </button>
            </form>
            {adapter && canSync(adapter) ? (
              <form action={syncNow.bind(null, id)}>
                <button className="a-btn" type="submit" disabled={!active}>
                  {t('int.sync_now')}
                </button>
              </form>
            ) : null}
          </>
        }
      />
      <Flash searchParams={query} />
      <KeyNotice status={keyStatus} t={t} />

      {!ready ? (
        <div className="a-flash warn" role="status">
          <div>
            <strong>{t('int.needs_developer')}</strong>
            <p>{t('int.needs_developer_text')}</p>
          </div>
        </div>
      ) : null}

      <div className="a-grid">
        <div className="a-stat">
          <span>{t('int.status')}</span>
          <b>
            <StatusPill status={row.status} t={t} />
          </b>
        </div>
        <div className="a-stat">
          <span>{t('int.last_sync')}</span>
          <b style={{ fontSize: 16 }}>
            <When value={row.lastSyncAt} />
          </b>
        </div>
        <div className="a-stat">
          <span>{t('int.counts')}</span>
          <b style={{ fontSize: 16 }}>
            {t('int.counts_value', { ok: row.successCount, failed: row.failureCount })}
          </b>
        </div>
        <div className="a-stat">
          <span>{t('int.last_error')}</span>
          <b style={{ fontSize: 16 }}>
            <When value={row.lastErrorAt} />
          </b>
        </div>
      </div>
      {row.lastError ? (
        <Advanced show title={t('int.last_error_detail')}>
          <pre className="a-mono" dir="ltr" style={{ whiteSpace: 'pre-wrap' }}>
            {row.lastError}
          </pre>
          <p className="a-hint">{t('int.consecutive', { count: row.consecutiveFailures })}</p>
        </Advanced>
      ) : null}

      <form className="a-card a-form" action={saveIntegrationSettings.bind(null, id)}>
        <h2>{t('int.settings_title')}</h2>
        <div className="a-row">
          <div className="a-field">
            <label htmlFor="s-name">{t('int.name')}</label>
            <input className="a-input" id="s-name" name="name" defaultValue={row.name} required />
          </div>
          <div className="a-field">
            <label htmlFor="s-env">{t('int.environment')}</label>
            <select
              className="a-select"
              id="s-env"
              name="environment"
              defaultValue={row.environment}
            >
              <option value="sandbox">{t('int.env_sandbox')}</option>
              <option value="production">{t('int.env_production')}</option>
            </select>
          </div>
          <div className="a-field">
            <label htmlFor="s-policy">{t('int.conflict_policy')}</label>
            <select
              className="a-select"
              id="s-policy"
              name="conflictPolicy"
              defaultValue={row.conflictPolicy}
            >
              {CONFLICT_POLICIES.map((policy) => (
                <option key={policy} value={policy}>
                  {t(`int.policy_${policy}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="a-hint">{t('int.conflict_hint')}</p>
        <h3>{t('int.services')}</h3>
        <div className="a-row">
          {SERVICES.map((service) => (
            <Checkbox
              key={service}
              name={`service_${service}`}
              label={t(`int.service_${service}`)}
              defaultChecked={row.services.includes(service)}
            />
          ))}
        </div>
        <Advanced show title={t('int.advanced_settings')}>
          <div className="a-row">
            <div className="a-field">
              <label htmlFor="s-retry">{t('int.retry_limit')}</label>
              <input
                className="a-input"
                id="s-retry"
                name="retryLimit"
                type="number"
                min={0}
                max={20}
                defaultValue={row.retryLimit}
                dir="ltr"
              />
            </div>
            <div className="a-field">
              <label htmlFor="s-delay">{t('int.retry_delay')}</label>
              <input
                className="a-input"
                id="s-delay"
                name="retryDelaySeconds"
                type="number"
                min={5}
                max={3600}
                defaultValue={row.retryDelaySeconds}
                dir="ltr"
              />
            </div>
            <div className="a-field">
              <label htmlFor="s-rate">{t('int.rate_limit')}</label>
              <input
                className="a-input"
                id="s-rate"
                name="rateLimitPerMinute"
                type="number"
                min={1}
                defaultValue={row.rateLimitPerMinute ?? ''}
                dir="ltr"
              />
            </div>
            <div className="a-field">
              <label htmlFor="s-token">{t('int.token_expires')}</label>
              <input
                className="a-input"
                id="s-token"
                name="tokenExpiresAt"
                type="date"
                defaultValue={
                  row.tokenExpiresAt ? row.tokenExpiresAt.toISOString().slice(0, 10) : ''
                }
                dir="ltr"
              />
            </div>
          </div>
          <div className="a-field">
            <label htmlFor="s-rate-note">{t('int.rate_limit_note')}</label>
            <input
              className="a-input"
              id="s-rate-note"
              name="rateLimitNote"
              defaultValue={row.rateLimitNote ?? ''}
            />
          </div>
        </Advanced>
        <div className="a-field">
          <label htmlFor="s-notes">{t('int.notes')}</label>
          <textarea
            className="a-textarea"
            id="s-notes"
            name="notes"
            rows={3}
            defaultValue={row.notes ?? ''}
          />
        </div>
        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            {t('int.save')}
          </button>
        </div>
      </form>

      <div className="a-card">
        <h2>{t('int.keys_title')}</h2>
        <p className="a-hint">{t('int.keys_hint')}</p>
        {hints.length === 0 ? (
          <Empty>{t('int.keys_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('int.key_field')}</th>
                <th>{t('int.key_value')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hints.map(([field, last4]) => (
                <tr key={field}>
                  <td className="a-mono" dir="ltr">
                    {field}
                  </td>
                  <td>
                    <Pill tone="good">{t('int.key_saved')}</Pill>{' '}
                    <span className="a-mono" dir="ltr">
                      ••••{last4}
                    </span>
                  </td>
                  <td>
                    <form action={removeCredential.bind(null, id)}>
                      <input type="hidden" name="field" value={field} />
                      <button
                        className="a-btn danger small"
                        type="submit"
                        disabled={keyStatus !== 'ok'}
                      >
                        {t('int.key_remove')}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <form className="a-row" action={saveCredential.bind(null, id)} autoComplete="off">
          <div className="a-field">
            <label htmlFor="k-field">{t('int.key_field')}</label>
            <input
              className="a-input"
              id="k-field"
              name="field"
              placeholder="api_key"
              pattern="[a-z][a-z0-9_]{0,39}"
              dir="ltr"
              required
              disabled={keyStatus !== 'ok'}
            />
          </div>
          <div className="a-field">
            <label htmlFor="k-value">{t('int.key_value')}</label>
            <input
              className="a-input"
              id="k-value"
              name="value"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              disabled={keyStatus !== 'ok'}
            />
          </div>
          <div className="a-actions">
            <button className="a-btn" type="submit" disabled={keyStatus !== 'ok'}>
              {t('int.key_save')}
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>{t('int.webhook_title')}</h2>
        <p className="a-hint">{t('int.webhook_hint')}</p>
        <div className="a-field">
          <label htmlFor="w-url">{t('int.webhook_url')}</label>
          <input className="a-input a-mono" id="w-url" readOnly value={webhookUrl} dir="ltr" />
        </div>
        <p>
          {row.webhookSecretHint ? (
            <>
              <Pill tone="good">{t('int.key_saved')}</Pill>{' '}
              <span className="a-mono" dir="ltr">
                ••••{row.webhookSecretHint}
              </span>
            </>
          ) : (
            <Pill tone="neutral">{t('int.secret_none')}</Pill>
          )}
        </p>
        <WebhookSecretForm
          action={createWebhookSecret.bind(null, id)}
          hasSecret={row.webhookSecretHint !== null}
          disabled={keyStatus !== 'ok'}
        />
        <Advanced show title={t('common.advanced')}>
          <p className="a-hint">{t('int.webhook_technical')}</p>
          <pre className="a-mono" dir="ltr" style={{ whiteSpace: 'pre-wrap' }}>
            {`POST ${webhookUrl}
${TIMESTAMP_HEADER}: <unix seconds>
${SIGNATURE_HEADER}: sha256=HEX(HMAC_SHA256(secret, "<timestamp>.<raw body>"))
${EVENT_ID_HEADER}: <unique event id>   (optional, recommended)`}
          </pre>
        </Advanced>
      </div>

      <div className="a-card">
        <h2>{t('int.operations_title')}</h2>
        <p className="a-hint">{t('int.operations_hint')}</p>
        <div className="a-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {ADAPTER_OPERATIONS.map((operation) => {
            const available = adapter !== null && supports(adapter, operation)
            return (
              <Pill key={operation} tone={available ? 'good' : 'neutral'}>
                {t(`int.op_${operation}`)}: {available ? t('int.op_yes') : t('int.op_no')}
              </Pill>
            )
          })}
        </div>
      </div>

      <div className="a-card" id="mappings">
        <h2>{t('int.mappings_title')}</h2>
        <p className="a-hint">{t('int.mappings_hint')}</p>
        {mappings.length === 0 ? (
          <Empty>{t('int.mappings_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('int.external_id')}</th>
                <th>{t('int.their_name')}</th>
                <th>{t('int.offer')}</th>
                <th>{t('int.last_import')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td className="a-mono" dir="ltr">
                    {mapping.externalId}
                  </td>
                  <td>{mapping.label ?? '—'}</td>
                  <td>{offerLabel.get(mapping.internalId) ?? t('int.offer_gone')}</td>
                  <td>
                    <When value={mapping.lastImportedAt} />
                  </td>
                  <td>
                    <form action={removeMapping.bind(null, id)}>
                      <input type="hidden" name="mappingId" value={mapping.id} />
                      <button className="a-btn ghost small" type="submit">
                        {t('int.unlink')}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {offers.length === 0 ? (
          <p className="a-hint">
            {t('int.no_offers')}{' '}
            <Link href={adminHref(`/suppliers/${row.supplierId}`)}>{row.supplierName}</Link>
          </p>
        ) : (
          <form className="a-row" action={addMapping.bind(null, id)}>
            <div className="a-field">
              <label htmlFor="m-ext">{t('int.external_id')}</label>
              <input
                className="a-input"
                id="m-ext"
                name="externalId"
                dir="ltr"
                required
                maxLength={160}
              />
            </div>
            <div className="a-field">
              <label htmlFor="m-offer">{t('int.offer')}</label>
              <select className="a-select" id="m-offer" name="offerId" required>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offerLabel.get(offer.id)} —{' '}
                    {formatMoney(offer.costMinor, offer.currency, intl)}
                  </option>
                ))}
              </select>
            </div>
            <div className="a-field">
              <label htmlFor="m-label">{t('int.their_name')}</label>
              <input className="a-input" id="m-label" name="label" maxLength={200} />
            </div>
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('int.link')}
              </button>
            </div>
          </form>
        )}
      </div>

      {row.connectionType === 'csv' ? (
        <div className="a-card">
          <h2>{t('int.import_title')}</h2>
          <p className="a-hint">{t('int.import_hint')}</p>
          <form
            className="a-row"
            action={uploadImport.bind(null, id)}
            encType="multipart/form-data"
          >
            <div className="a-field">
              <label htmlFor="i-file">{t('int.import_file')}</label>
              <input
                className="a-input"
                id="i-file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
              />
            </div>
            <div className="a-actions">
              <button className="a-btn accent" type="submit">
                {t('int.import_preview_btn')}
              </button>
            </div>
          </form>
          <Advanced show title={t('int.import_format')}>
            <pre className="a-mono" dir="ltr" style={{ whiteSpace: 'pre-wrap' }}>
              {`${CSV_COLUMNS.join(',')}
product,KAY-01,Ayung rafting (half day),,,,,,
price,KAY-01,,45.00,USD,,,,
availability,KAY-01,,,,2026-11-03,,12,no
availability,KAY-01,,,,2026-11-04,08:00,,yes`}
            </pre>
            <p className="a-hint">{t('int.import_format_hint')}</p>
          </Advanced>
          {imports.length === 0 ? null : (
            <Table>
              <thead>
                <tr>
                  <th>{t('int.import_file')}</th>
                  <th>{t('int.import_rows')}</th>
                  <th>{t('int.status')}</th>
                  <th>{t('int.when')}</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={adminHref(`/integrations/${id}/imports/${item.id}`)}>
                        {item.fileName ?? item.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{item.rowCount}</td>
                    <td>
                      <Pill
                        tone={
                          item.status === 'applied'
                            ? 'good'
                            : item.status === 'discarded'
                              ? 'neutral'
                              : 'info'
                        }
                      >
                        {t(`int.import_${item.status}`)}
                      </Pill>
                    </td>
                    <td>
                      <When value={item.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      ) : null}

      <div className="a-card">
        <h2>{t('int.log_title')}</h2>
        {logs.length === 0 ? (
          <Empty>{t('int.log_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('int.when')}</th>
                <th>{t('int.log_what')}</th>
                <th>{t('int.status')}</th>
                <th>{t('int.log_duration')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <When value={log.createdAt} />
                  </td>
                  <td>
                    <span className="a-mono" dir="ltr">
                      {log.operation}
                    </span>
                    <div className="a-hint">{t(`int.dir_${log.direction}`)}</div>
                  </td>
                  <td>
                    <Pill
                      tone={
                        log.status === 'ok' ? 'good' : log.status === 'error' ? 'bad' : 'neutral'
                      }
                    >
                      {t(`int.log_${log.status}`)}
                    </Pill>
                    {log.error && session.role === 'admin' ? (
                      <div className="a-hint a-mono" dir="ltr">
                        {log.error.slice(0, 200)}
                      </div>
                    ) : null}
                  </td>
                  <td dir="ltr">{log.durationMs === null ? '—' : `${log.durationMs} ms`}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Advanced show title={t('common.advanced')}>
          <p className="a-hint">{t('int.log_technical')}</p>
          <Table>
            <thead>
              <tr>
                <th>{t('int.when')}</th>
                <th>HTTP</th>
                <th>{t('int.log_hash')}</th>
                <th>{t('int.log_bytes')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 20).map((log) => (
                <tr key={log.id}>
                  <td>
                    <When value={log.createdAt} />
                  </td>
                  <td dir="ltr">{log.httpStatus ?? '—'}</td>
                  <td className="a-mono" dir="ltr">
                    {log.payloadHash ? `${log.payloadHash.slice(0, 16)}…` : '—'}
                  </td>
                  <td dir="ltr">{log.payloadBytes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Advanced>
      </div>
    </>
  )
}
