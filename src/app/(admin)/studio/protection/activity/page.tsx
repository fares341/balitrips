import { count, desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { can } from '@/lib/auth/roles'
import { activityLog, devices, users } from '@/db/schema'
import { ACTIVITY_ACTIONS } from '@/lib/security/activity'

import { adminHref } from '../../../_lib/admin-path'
import { pageParam } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pager, Pill, Table, When, type PillTone } from '../../../_ui/table'
import { activityFilters } from './filters'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LIST = adminHref('/protection/activity')

const TONE: Partial<Record<string, PillTone>> = {
  login_failed: 'warn',
  login_blocked: 'bad',
  device_limit_blocked: 'warn',
  unauthorized_access: 'bad',
  banned: 'bad',
  new_device: 'info',
  device_evicted: 'warn',
  download_pdf: 'good',
}

/** سجل نشاط المستخدمين، مع فلترة حسب الإجراء والمستخدم والـ IP والتاريخ. */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('security.read')
  const params = await searchParams

  const { q, action, user, from, to, where } = activityFilters(params)
  const page = pageParam(params)
  const mayExport = can(session.role, 'customers.export')
  const exportQuery = new URLSearchParams(
    Object.entries({ q, action, user, from, to }).flatMap(([key, value]) =>
      value ? [[key, value]] : [],
    ),
  ).toString()

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        ip: activityLog.ip,
        details: activityLog.details,
        createdAt: activityLog.createdAt,
        userId: activityLog.userId,
        email: users.email,
        browser: devices.browser,
        os: devices.os,
      })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.userId))
      .leftJoin(devices, eq(devices.id, activityLog.deviceId))
      .where(where)
      .orderBy(desc(activityLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.userId))
      .where(where),
  ])

  return (
    <>
      <PageHead
        title="Activity log"
        description="What users did: sign-ins, failures, new devices, PDF downloads and refused access. Admin edits are in the Audit log."
      />

      <form className="a-row a-card" method="get" action={LIST}>
        {user ? <input type="hidden" name="user" value={user} /> : null}
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Email or IP"
          />
        </div>
        <div className="a-field">
          <label htmlFor="action">Action</label>
          <select className="a-select" id="action" name="action" defaultValue={action ?? ''}>
            <option value="">Any</option>
            {ACTIVITY_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
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
          {mayExport ? (
            // Route handler: a plain <a> so the browser downloads the file.
            <a
              className="a-btn ghost"
              href={`${adminHref('/protection/activity/export')}?${exportQuery}`}
            >
              Export CSV
            </a>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>Nothing recorded for those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Device</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <When value={row.createdAt} />
                  <div className="a-mono a-muted">{row.ip ?? ''}</div>
                </td>
                <td>
                  {row.userId ? (
                    <Link href={adminHref(`/customers/${row.userId}`)}>
                      {row.email ?? row.userId}
                    </Link>
                  ) : (
                    <span className="a-muted">anonymous</span>
                  )}
                </td>
                <td>
                  <Pill tone={TONE[row.action] ?? 'neutral'}>{row.action}</Pill>
                </td>
                <td>{row.browser ? `${row.browser} · ${row.os ?? ''}` : '—'}</td>
                <td>
                  <pre className="a-json">
                    {row.details ? JSON.stringify(row.details, null, 1).slice(0, 600) : '—'}
                  </pre>
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
