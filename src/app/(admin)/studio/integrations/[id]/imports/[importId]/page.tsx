import { and, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { integrationImports, supplierIntegrations } from '@/db/schema'
import { isConflictPolicy, type PlannedChange } from '@/lib/integrations/csv'
import { previewImport } from '@/lib/integrations/imports'
import { formatMoney } from '@/lib/money'

import type { Translate } from '../../../../../_i18n'
import { adminHref } from '../../../../../_lib/admin-path'
import { isUuid } from '../../../../../_lib/form'
import { getAdminI18n } from '../../../../../_lib/i18n'
import { requireCapability } from '../../../../../_lib/session'
import { Flash } from '../../../../../_ui/flash'
import { PageHead } from '../../../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../../../_ui/table'
import { applyImportAction, discardImport } from '../../../actions'

export const dynamic = 'force-dynamic'

const TONES: Record<string, 'good' | 'warn' | 'bad' | 'neutral' | 'info'> = {
  create: 'good',
  update: 'info',
  same: 'neutral',
  unmapped: 'warn',
  conflict: 'bad',
  kept: 'neutral',
  duplicate: 'warn',
}

function describe(change: PlannedChange, t: Translate, intl: string): string {
  const money = (minor?: number, currency?: string) =>
    minor === undefined || !currency ? '—' : formatMoney(minor, currency, intl)
  if (change.kind === 'price') {
    return `${money(change.before?.costMinor, change.before?.currency)} → ${money(change.after?.costMinor, change.after?.currency)}`
  }
  if (change.kind === 'availability') {
    const show = (value?: { capacity?: number | null; closed?: boolean }) =>
      value === undefined
        ? '—'
        : value.closed
          ? t('int.closed')
          : value.capacity === null || value.capacity === undefined
            ? t('int.open')
            : t('int.places', { count: value.capacity })
    return `${change.date ?? ''}${change.slot ? ` ${change.slot}` : ''}: ${show(change.before)} → ${show(change.after)}`
  }
  return `${change.before?.label ?? '—'} → ${change.after?.label ?? '—'}`
}

/** Preview of one uploaded CSV: what applying would change, row by row. */
export default async function ImportPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; importId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('integrations.write')
  const { t, intl } = await getAdminI18n()
  const { id, importId } = await params
  const query = await searchParams
  if (!isUuid(id) || !isUuid(importId)) notFound()

  const [row] = await db
    .select({
      import: integrationImports,
      supplierId: supplierIntegrations.supplierId,
      name: supplierIntegrations.name,
      conflictPolicy: supplierIntegrations.conflictPolicy,
    })
    .from(integrationImports)
    .innerJoin(supplierIntegrations, eq(supplierIntegrations.id, integrationImports.integrationId))
    .where(and(eq(integrationImports.id, importId), eq(integrationImports.integrationId, id)))
    .limit(1)
  if (!row) notFound()

  const pending = row.import.status === 'previewed'
  const policy = isConflictPolicy(row.conflictPolicy) ? row.conflictPolicy : 'flag'
  const preview = pending
    ? await previewImport({
        integrationId: id,
        supplierId: row.supplierId,
        body: row.import.body,
        policy,
      })
    : null
  const summary = preview?.summary ?? row.import.summary ?? null
  const writes = summary ? (summary.create ?? 0) + (summary.update ?? 0) : 0

  return (
    <>
      <PageHead
        title={t('int.preview_title', { file: row.import.fileName ?? '' })}
        description={t('int.preview_description', { name: row.name })}
        actions={
          <Link className="a-btn ghost" href={adminHref(`/integrations/${id}`)}>
            {t('int.back_to_connection')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      {summary ? (
        <div className="a-grid">
          {(
            [
              'create',
              'update',
              'same',
              'unmapped',
              'conflict',
              'kept',
              'duplicate',
              'invalid',
            ] as const
          ).map((key) => (
            <div className="a-stat" key={key}>
              <span>{t(`int.sum_${key}`)}</span>
              <b>{summary[key] ?? 0}</b>
            </div>
          ))}
        </div>
      ) : null}

      {pending ? (
        <div className="a-card">
          <p>{t('int.preview_policy', { policy: t(`int.policy_${policy}`) })}</p>
          <div className="a-actions">
            <form action={applyImportAction.bind(null, id, importId)}>
              <button className="a-btn accent" type="submit" disabled={writes === 0}>
                {t('int.apply_btn', { count: writes })}
              </button>
            </form>
            <form action={discardImport.bind(null, id, importId)}>
              <button className="a-btn ghost" type="submit">
                {t('int.discard_btn')}
              </button>
            </form>
          </div>
          <p className="a-hint">{t('int.apply_hint')}</p>
        </div>
      ) : (
        <div className="a-card">
          <p>
            <Pill tone={row.import.status === 'applied' ? 'good' : 'neutral'}>
              {t(`int.import_${row.import.status}`)}
            </Pill>{' '}
            <When value={row.import.appliedAt ?? row.import.updatedAt} />
          </p>
        </div>
      )}

      {preview ? (
        <>
          {preview.errors.length > 0 ? (
            <div className="a-card">
              <h2>{t('int.invalid_rows')}</h2>
              <Table>
                <thead>
                  <tr>
                    <th>{t('int.line')}</th>
                    <th>{t('int.problem')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.errors.slice(0, 200).map((error) => (
                    <tr key={`${error.line}-${error.code}`}>
                      <td dir="ltr">{error.line}</td>
                      <td>{t(`int.csv_err_${error.code}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}
          <div className="a-card">
            <h2>{t('int.changes_title')}</h2>
            {preview.changes.length === 0 ? (
              <Empty>{t('int.no_changes')}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>{t('int.line')}</th>
                    <th>{t('int.kind')}</th>
                    <th>{t('int.external_id')}</th>
                    <th>{t('int.result')}</th>
                    <th>{t('int.change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.slice(0, 500).map((change) => (
                    <tr key={`${change.line}-${change.kind}`}>
                      <td dir="ltr">{change.line}</td>
                      <td>{t(`int.kind_${change.kind}`)}</td>
                      <td className="a-mono" dir="ltr">
                        {change.externalId}
                      </td>
                      <td>
                        <Pill tone={TONES[change.status] ?? 'neutral'}>
                          {t(`int.sum_${change.status}`)}
                        </Pill>
                        {change.reason ? (
                          <div className="a-hint">{t(`int.why_${change.reason}`)}</div>
                        ) : null}
                      </td>
                      <td>
                        {change.status === 'unmapped' || change.status === 'duplicate'
                          ? '—'
                          : describe(change, t, intl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {preview.changes.length > 500 ? (
              <p className="a-hint">
                {t('int.more_rows', { count: preview.changes.length - 500 })}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  )
}
