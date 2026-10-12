import { count, desc, eq, gt, ilike, and, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { devices, sessions, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'

import { adminHref } from '../../../_lib/admin-path'
import { pageParam, param } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../../_ui/table'
import { endSession } from '../actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LIST = adminHref('/protection/sessions')

/** كل الجلسات الحيّة على المنصة، مع جهازها وعنوانها، وإنهاء أي منها. */
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('security.read')
  const mayWrite = can(session.role, 'security.write')
  const params = await searchParams
  const page = pageParam(params)
  const q = param(params, 'q')

  const filters: SQL[] = [gt(sessions.expiresAt, new Date())]
  if (q) {
    const like = `%${q}%`
    const match = or(ilike(users.email, like), ilike(sessions.ipAddress, like))
    if (match) filters.push(match)
  }
  const where = and(...filters)

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        email: users.email,
        role: users.role,
        ip: sessions.ipAddress,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        browser: devices.browser,
        os: devices.os,
        deviceStatus: devices.status,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(devices, eq(devices.id, sessions.deviceId))
      .where(where)
      .orderBy(desc(sessions.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(where),
  ])

  return (
    <>
      <PageHead
        title="Live sessions"
        description="Every unexpired session on the platform. Sessions created before device tracking show no device."
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
        <Empty>No live sessions.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Device</th>
              <th>IP</th>
              <th>Started</th>
              <th>Last refreshed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/customers/${row.userId}`)}>{row.email}</Link>
                  {row.role !== 'customer' ? (
                    <div>
                      <Pill tone="info">{row.role}</Pill>
                    </div>
                  ) : null}
                </td>
                <td>
                  {row.browser ? (
                    `${row.browser} · ${row.os ?? ''}`
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                  {row.deviceStatus && row.deviceStatus !== 'active' ? (
                    <div>
                      <Pill tone="bad">device {row.deviceStatus}</Pill>
                    </div>
                  ) : null}
                </td>
                <td className="a-mono">{row.ip ?? '—'}</td>
                <td>
                  <When value={row.createdAt} />
                </td>
                <td>
                  <When value={row.updatedAt} />
                </td>
                <td>
                  {mayWrite && row.id !== session.sessionId ? (
                    <form className="a-inline-form" action={endSession}>
                      <input type="hidden" name="sessionId" value={row.id} />
                      <button className="a-btn danger small" type="submit">
                        End
                      </button>
                    </form>
                  ) : row.id === session.sessionId ? (
                    <Pill tone="info">you</Pill>
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
