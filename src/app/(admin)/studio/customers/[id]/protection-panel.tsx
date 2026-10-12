import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { devices, users } from '@/db/schema'
import { can, type Role } from '@/lib/auth/roles'
import { isUserBanned } from '@/lib/security/bans'
import { deviceLimitFor } from '@/lib/security/devices'

import { adminHref } from '../../../_lib/admin-path'
import { Field, TextInput } from '../../../_ui/field'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import { actOnDevice, banUser, decideDevice, unbanUser } from '../../protection/actions'

/**
 * بطاقة الحماية في صفحة العميل: حالة الحظر، الأجهزة، وحد الأجهزة.
 * مكوّن خادمي مستقل كي لا تكبر صفحة العميل بمنطق لا يخصها.
 */
export async function ProtectionPanel({
  userId,
  viewerRole,
  isSelf,
}: {
  userId: string
  viewerRole: Role
  isSelf: boolean
}) {
  if (!can(viewerRole, 'security.read')) return null
  const mayWrite = can(viewerRole, 'security.write')

  const [[account], deviceRows, limit] = await Promise.all([
    db
      .select({ status: users.status, bannedUntil: users.bannedUntil, banReason: users.banReason })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db.select().from(devices).where(eq(devices.userId, userId)).orderBy(desc(devices.lastSeenAt)),
    deviceLimitFor(userId),
  ])
  if (!account) return null

  const banned = isUserBanned(account)
  const active = deviceRows.filter((row) => row.status === 'active').length

  return (
    <div className="a-card">
      <h2>Protection</h2>
      <p className="a-hint">
        {active} of {limit} device slots in use ·{' '}
        <Link href={adminHref(`/protection/activity?user=${userId}`)}>
          activity log for this account
        </Link>
      </p>

      {banned ? (
        <div style={{ marginBlock: 12 }}>
          {account.status === 'suspended' ? (
            <Pill tone="warn">suspended — pending review</Pill>
          ) : (
            <Pill tone="bad">banned {account.bannedUntil ? 'until' : 'permanently'}</Pill>
          )}{' '}
          {account.bannedUntil ? <When value={account.bannedUntil} /> : null}
          <div className="a-hint">Reason: {account.banReason ?? '—'}</div>
          {mayWrite ? (
            <form
              className="a-inline-form"
              action={unbanUser.bind(null, userId)}
              style={{ marginBlockStart: 8 }}
            >
              <button className="a-btn" type="submit">
                Lift ban
              </button>
            </form>
          ) : null}
        </div>
      ) : mayWrite && !isSelf ? (
        <form className="a-row" action={banUser.bind(null, userId)} style={{ marginBlock: 12 }}>
          <Field label="Ban reason" htmlFor="ban-reason">
            <TextInput id="ban-reason" name="reason" required />
          </Field>
          <Field label="Duration" htmlFor="ban-duration">
            <select className="a-select" id="ban-duration" name="duration" defaultValue="7d">
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="permanent">Permanent</option>
            </select>
          </Field>
          <div className="a-actions">
            <button className="a-btn danger" type="submit">
              Ban account
            </button>
          </div>
        </form>
      ) : null}

      {deviceRows.length === 0 ? (
        <Empty>No devices recorded yet. Devices are recorded from the next sign-in onwards.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Device</th>
              <th>Last IP</th>
              <th>First seen</th>
              <th>Last seen</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {deviceRows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.browser ?? '?'} · {row.os ?? '?'}
                  {row.deviceType ? <span className="a-muted"> · {row.deviceType}</span> : null}
                  {row.weak ? (
                    <div>
                      <Pill tone="warn">no browser fingerprint</Pill>
                    </div>
                  ) : null}
                  <div className="a-mono a-muted">{row.fingerprintHash.slice(0, 12)}…</div>
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
                        : row.status === 'banned'
                          ? 'bad'
                          : row.status === 'pending'
                            ? 'warn'
                            : 'neutral'
                    }
                  >
                    {row.status}
                  </Pill>
                  {row.revokedReason ? <div className="a-hint">{row.revokedReason}</div> : null}
                </td>
                <td>
                  {mayWrite && row.status === 'pending' ? (
                    <form className="a-inline-form" action={decideDevice}>
                      <input type="hidden" name="deviceId" value={row.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="a-btn accent small" type="submit">
                        Approve device
                      </button>
                    </form>
                  ) : null}
                  {mayWrite && row.status !== 'banned' ? (
                    <form className="a-inline-form" action={actOnDevice.bind(null, userId)}>
                      <input type="hidden" name="deviceId" value={row.id} />
                      <select
                        className="a-select"
                        name="mode"
                        defaultValue="revoke"
                        aria-label="Device action"
                      >
                        {row.status === 'active' ? (
                          <option value="revoke">Sign out &amp; free slot</option>
                        ) : null}
                        <option value="ban">Ban for this account</option>
                        <option value="ban_all">Ban fingerprint everywhere</option>
                      </select>
                      <button className="a-btn danger small" type="submit">
                        Apply
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
  )
}
