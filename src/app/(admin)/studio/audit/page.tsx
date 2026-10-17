import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { auditLog, users } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { auditActionLabel, auditEntityLabel, auditLines } from '../../_lib/audit-labels'
import { getAdminI18n } from '../../_lib/i18n'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Changes } from '../../_ui/changes'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Table, When } from '../../_ui/table'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LIST = adminHref('/audit')

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('audit.read')
  const { t, locale, intl } = await getAdminI18n()
  const showTechnical = session.role === 'admin'
  const params = await searchParams

  const q = param(params, 'q')
  const entityType = param(params, 'entity')
  const from = param(params, 'from')
  const to = param(params, 'to')
  const page = pageParam(params)

  const filters: SQL[] = []

  if (q) {
    const like = `%${q}%`
    const match = or(
      ilike(auditLog.action, like),
      ilike(users.email, like),
      ilike(auditLog.ipAddress, like),
    )
    if (match) filters.push(match)
  }
  if (entityType) filters.push(eq(auditLog.entityType, entityType))
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    filters.push(gte(auditLog.createdAt, new Date(`${from}T00:00:00Z`)))
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    filters.push(lte(auditLog.createdAt, new Date(`${to}T23:59:59Z`)))
  }

  const where = filters.length > 0 ? and(...filters) : undefined

  const [rows, [totalRow], entityTypes] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        before: auditLog.before,
        after: auditLog.after,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
        actorEmail: users.email,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(where),
    db
      .selectDistinct({ entityType: auditLog.entityType })
      .from(auditLog)
      .orderBy(auditLog.entityType),
  ])

  return (
    <>
      <PageHead title={t('audit.title')} description={t('audit.description')} />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('audit.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('audit.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="entity">{t('audit.entity_type')}</label>
          <select className="a-select" id="entity" name="entity" defaultValue={entityType ?? ''}>
            <option value="">{t('audit.any')}</option>
            {entityTypes.map((row) => (
              <option key={row.entityType} value={row.entityType}>
                {auditEntityLabel(t, row.entityType)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="from">{t('audit.from')}</label>
          <input className="a-input" id="from" name="from" type="date" defaultValue={from ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="to">{t('audit.to')}</label>
          <input className="a-input" id="to" name="to" type="date" defaultValue={to ?? ''} />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('audit.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('audit.reset')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('audit.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('audit.col_when')}</th>
              <th>{t('audit.col_actor')}</th>
              <th>{t('audit.col_action')}</th>
              <th>{t('audit.col_entity')}</th>
              <th>{t('audit.col_before')}</th>
              <th>{t('audit.col_after')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <When value={row.createdAt} />
                </td>
                <td>{row.actorEmail ?? <span className="a-muted">{t('audit.system')}</span>}</td>
                <td>
                  {auditActionLabel(t, row.action)}
                  {showTechnical ? (
                    <details className="a-hint">
                      <summary>{t('audit.details')}</summary>
                      <div className="a-mono" dir="ltr">
                        {row.action} · {row.entityType} {row.entityId ?? ''} · {row.ipAddress ?? ''}
                      </div>
                    </details>
                  ) : null}
                </td>
                <td>{auditEntityLabel(t, row.entityType)}</td>
                <td>
                  <Changes lines={auditLines(t, row.before, locale, intl)} />
                </td>
                <td>
                  <Changes lines={auditLines(t, row.after, locale, intl)} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pager
        basePath={LIST}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={totalRow?.value ?? 0}
      />
    </>
  )
}
