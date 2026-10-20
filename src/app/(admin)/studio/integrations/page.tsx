import { asc, desc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { supplierIntegrations, suppliers } from '@/db/schema'
import { CONNECTION_TYPES, isConnectionType } from '@/lib/integrations/adapter'
import { integrationsKeyStatus } from '@/lib/integrations/crypto'
import { isImplemented } from '@/lib/integrations/registry'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Advanced } from '../../_ui/advanced'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { createIntegration } from './actions'
import { KeyNotice, StatusPill } from './parts'

export const dynamic = 'force-dynamic'

/** Studio → Integrations: every supplier connection, and adding one. */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('integrations.write')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const keyStatus = integrationsKeyStatus()

  const [rows, supplierList] = await Promise.all([
    db
      .select({
        id: supplierIntegrations.id,
        name: supplierIntegrations.name,
        connectionType: supplierIntegrations.connectionType,
        environment: supplierIntegrations.environment,
        status: supplierIntegrations.status,
        lastSyncAt: supplierIntegrations.lastSyncAt,
        lastErrorAt: supplierIntegrations.lastErrorAt,
        successCount: supplierIntegrations.successCount,
        failureCount: supplierIntegrations.failureCount,
        supplierName: suppliers.name,
      })
      .from(supplierIntegrations)
      .innerJoin(suppliers, eq(suppliers.id, supplierIntegrations.supplierId))
      .orderBy(asc(suppliers.name), desc(supplierIntegrations.createdAt)),
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(isNull(suppliers.deletedAt))
      .orderBy(asc(suppliers.name)),
  ])

  return (
    <>
      <PageHead title={t('int.title')} description={t('int.description')} />
      <Flash searchParams={params} />
      <KeyNotice status={keyStatus} t={t} />

      <div className="a-card">
        <h2>{t('int.list_title')}</h2>
        {rows.length === 0 ? (
          <Empty>{t('int.empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('int.connection')}</th>
                <th>{t('int.supplier')}</th>
                <th>{t('int.type')}</th>
                <th>{t('int.status')}</th>
                <th>{t('int.last_sync')}</th>
                <th>{t('int.counts')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={adminHref(`/integrations/${row.id}`)}>{row.name}</Link>
                    <div className="a-hint">{t(`int.env_${row.environment}`)}</div>
                  </td>
                  <td>{row.supplierName}</td>
                  <td>
                    {t(`int.type_${row.connectionType}`)}
                    {isConnectionType(row.connectionType) && !isImplemented(row.connectionType) ? (
                      <div>
                        <Pill tone="warn">{t('int.needs_developer')}</Pill>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <StatusPill status={row.status} t={t} />
                  </td>
                  <td>
                    <When value={row.lastSyncAt} />
                    {row.lastErrorAt ? (
                      <div className="a-hint">
                        {t('int.last_error')}: <When value={row.lastErrorAt} />
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {t('int.counts_value', { ok: row.successCount, failed: row.failureCount })}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <form className="a-card a-form" action={createIntegration}>
        <h2>{t('int.new_title')}</h2>
        <p className="a-hint">{t('int.new_hint')}</p>
        {supplierList.length === 0 ? (
          <Empty>
            {t('int.no_suppliers')} <Link href={adminHref('/suppliers')}>{t('nav.suppliers')}</Link>
          </Empty>
        ) : (
          <div className="a-row">
            <div className="a-field">
              <label htmlFor="new-supplier">{t('int.supplier')}</label>
              <select className="a-select" id="new-supplier" name="supplierId" required>
                {supplierList.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="a-field">
              <label htmlFor="new-name">{t('int.name')}</label>
              <input className="a-input" id="new-name" name="name" required maxLength={120} />
            </div>
            <div className="a-field">
              <label htmlFor="new-type">{t('int.type')}</label>
              <select
                className="a-select"
                id="new-type"
                name="connectionType"
                defaultValue="manual"
              >
                {CONNECTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`int.type_${type}`)}
                    {isImplemented(type) ? '' : ` — ${t('int.needs_developer')}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="a-actions">
              <button className="a-btn accent" type="submit">
                {t('int.create_btn')}
              </button>
            </div>
          </div>
        )}
      </form>

      <div className="a-card">
        <h2>{t('int.types_title')}</h2>
        <Table>
          <thead>
            <tr>
              <th>{t('int.type')}</th>
              <th>{t('int.type_meaning')}</th>
            </tr>
          </thead>
          <tbody>
            {CONNECTION_TYPES.map((type) => (
              <tr key={type}>
                <td>
                  <strong>{t(`int.type_${type}`)}</strong>
                  <div>
                    {isImplemented(type) ? (
                      <Pill tone="good">{t('int.ready')}</Pill>
                    ) : (
                      <Pill tone="warn">{t('int.needs_developer')}</Pill>
                    )}
                  </div>
                </td>
                <td>{t(`int.about_${type}`)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Advanced show title={t('common.advanced')}>
          <p className="a-hint">{t('int.developer_note')}</p>
        </Advanced>
      </div>
    </>
  )
}
