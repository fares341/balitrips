import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { auditLog, users } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
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
  await requireCapability('audit.read')
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
      <PageHead
        title="Audit log"
        description="Every admin mutation, with the fields that actually changed. Refunds, entitlement grants and role changes are the ones that have to be answerable months later."
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Action, actor email or IP"
          />
        </div>
        <div className="a-field">
          <label htmlFor="entity">Entity type</label>
          <select className="a-select" id="entity" name="entity" defaultValue={entityType ?? ''}>
            <option value="">Any</option>
            {entityTypes.map((row) => (
              <option key={row.entityType} value={row.entityType}>
                {row.entityType}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="from">From</label>
          <input className="a-input" id="from" name="from" type="date" defaultValue={from ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="to">To</label>
          <input className="a-input" id="to" name="to" type="date" defaultValue={to ?? ''} />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            Filter
          </button>
          <Link className="a-btn ghost" href={LIST}>
            Reset
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>Nothing recorded for those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <When value={row.createdAt} />
                  <div className="a-mono a-muted">{row.ipAddress ?? ''}</div>
                </td>
                <td>{row.actorEmail ?? <span className="a-muted">system</span>}</td>
                <td className="a-mono">{row.action}</td>
                <td>
                  {row.entityType}
                  <div className="a-mono a-muted">{row.entityId ?? ''}</div>
                </td>
                <td>
                  <pre className="a-json">{format(row.before)}</pre>
                </td>
                <td>
                  <pre className="a-json">{format(row.after)}</pre>
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

/** Only the delta is stored, so this stays readable at a glance. */
function format(value: unknown): string {
  if (value === null || value === undefined) return '—'
  const text = JSON.stringify(value, null, 1)
  return text.length > 900 ? `${text.slice(0, 900)}…` : text
}
