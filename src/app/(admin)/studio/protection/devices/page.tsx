import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { DEVICE_STATUSES, devices, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { REJECTED_REASON } from '@/lib/security/devices'

import { adminHref } from '../../../_lib/admin-path'
import { pageParam, param } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../../_ui/table'
import { decideDevice } from '../actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LIST = adminHref('/protection/devices')

/**
 * كل الأجهزة على المنصة (الوثيقة: "عرض جميع الأجهزة"، "التحكم في الأجهزة").
 * الأجهزة المعلّقة (سياسة "موافقة الإدارة") أولاً مع زر موافقة/رفض.
 */
export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('security.read')
  const mayWrite = can(session.role, 'security.write')
  const params = await searchParams
  const page = pageParam(params)
  const q = param(params, 'q')
  const rawStatus = param(params, 'status')
  const status = (DEVICE_STATUSES as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as (typeof DEVICE_STATUSES)[number])
    : null

  const filters: SQL[] = []
  if (status !== null) filters.push(eq(devices.status, status))
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
    const match = or(ilike(users.email, like), ilike(devices.ip, like))
    if (match) filters.push(match)
  }
  const where = filters.length > 0 ? and(...filters) : undefined

  const [rows, [total], [pending]] = await Promise.all([
    db
      .select({
        id: devices.id,
        userId: devices.userId,
        email: users.email,
        browser: devices.browser,
        os: devices.os,
        ip: devices.ip,
        status: devices.status,
        firstSeenAt: devices.firstSeenAt,
        lastSeenAt: devices.lastSeenAt,
        revokedReason: devices.revokedReason,
      })
      .from(devices)
      .innerJoin(users, eq(users.id, devices.userId))
      .where(where)
      // المعلّق أولاً، ثم الأحدث استخداماً.
      .orderBy(desc(eq(devices.status, 'pending')), desc(devices.lastSeenAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(devices)
      .innerJoin(users, eq(users.id, devices.userId))
      .where(where),
    db.select({ value: count() }).from(devices).where(eq(devices.status, 'pending')),
  ])

  return (
    <>
      <PageHead
        title="Devices"
        description={`Every device customers have signed in from. ${pending?.value ?? 0} waiting for approval.`}
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
            placeholder="Email or IP"
          />
        </div>
        <div className="a-field">
          <label htmlFor="status">Status</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {DEVICE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
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
        <Empty>No devices match.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Device</th>
              <th>IP</th>
              <th>First seen</th>
              <th>Last seen</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/customers/${row.userId}`)}>{row.email}</Link>
                </td>
                <td>
                  {row.browser ?? '—'} · {row.os ?? '—'}
                </td>
                <td className="a-mono">{row.ip ?? '—'}</td>
                <td>
                  <When value={row.firstSeenAt} />
                </td>
                <td>
                  <When value={row.lastSeenAt} />
                </td>
                <td>
                  <Pill
                    tone={
                      row.status === 'active'
                        ? 'good'
                        : row.status === 'pending'
                          ? 'warn'
                          : row.status === 'banned'
                            ? 'bad'
                            : 'neutral'
                    }
                  >
                    {row.status}
                  </Pill>
                  {row.revokedReason ? <div className="a-muted">{row.revokedReason}</div> : null}
                </td>
                <td>
                  {mayWrite && row.status === 'pending' ? (
                    <div className="a-actions">
                      <form className="a-inline-form" action={decideDevice}>
                        <input type="hidden" name="deviceId" value={row.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <button className="a-btn accent small" type="submit">
                          Approve
                        </button>
                      </form>
                      <form className="a-inline-form" action={decideDevice}>
                        <input type="hidden" name="deviceId" value={row.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <button className="a-btn danger small" type="submit">
                          Reject
                        </button>
                      </form>
                    </div>
                  ) : mayWrite &&
                    row.status === 'revoked' &&
                    row.revokedReason === REJECTED_REASON ? (
                    <form className="a-inline-form" action={decideDevice}>
                      <input type="hidden" name="deviceId" value={row.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="a-btn small" type="submit">
                        Approve after all
                      </button>
                    </form>
                  ) : null}
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
        total={total?.value ?? 0}
      />
    </>
  )
}
