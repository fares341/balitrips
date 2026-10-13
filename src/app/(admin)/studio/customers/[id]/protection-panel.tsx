import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { devices, users } from '@/db/schema'
import { can, type Role } from '@/lib/auth/roles'
import { isUserBanned } from '@/lib/security/bans'
import { deviceLimitFor } from '@/lib/security/devices'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
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
  const { t } = await getAdminI18n()
  /** Enum value → label; an unknown value shows as stored. */
  const label = (key: string, raw: string) => (t(key) === key ? raw : t(key))

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
      <h2>{t('customers.protection')}</h2>
      <p className="a-hint">
        {t('customers.device_slots', { active, limit })} ·{' '}
        <Link href={adminHref(`/protection/activity?user=${userId}`)}>
          {t('customers.activity_log_link')}
        </Link>
      </p>

      {banned ? (
        <div style={{ marginBlock: 12 }}>
          {account.status === 'suspended' ? (
            <Pill tone="warn">{t('customers.suspended_pending')}</Pill>
          ) : (
            <Pill tone="bad">
              {account.bannedUntil
                ? t('customers.banned_until')
                : t('customers.banned_permanently')}
            </Pill>
          )}{' '}
          {account.bannedUntil ? <When value={account.bannedUntil} /> : null}
          <div className="a-hint">
            {t('customers.ban_reason_line', { reason: account.banReason ?? '—' })}
          </div>
          {mayWrite ? (
            <form
              className="a-inline-form"
              action={unbanUser.bind(null, userId)}
              style={{ marginBlockStart: 8 }}
            >
              <button className="a-btn" type="submit">
                {t('customers.lift_ban')}
              </button>
            </form>
          ) : null}
        </div>
      ) : mayWrite && !isSelf ? (
        <form className="a-row" action={banUser.bind(null, userId)} style={{ marginBlock: 12 }}>
          <Field label={t('customers.ban_reason')} htmlFor="ban-reason">
            <TextInput id="ban-reason" name="reason" required />
          </Field>
          <Field label={t('customers.ban_duration')} htmlFor="ban-duration">
            <select className="a-select" id="ban-duration" name="duration" defaultValue="7d">
              <option value="1h">{t('customers.ban_1h')}</option>
              <option value="24h">{t('customers.ban_24h')}</option>
              <option value="7d">{t('customers.ban_7d')}</option>
              <option value="30d">{t('customers.ban_30d')}</option>
              <option value="permanent">{t('customers.ban_permanent')}</option>
            </select>
          </Field>
          <div className="a-actions">
            <button className="a-btn danger" type="submit">
              {t('customers.ban_account')}
            </button>
          </div>
        </form>
      ) : null}

      {deviceRows.length === 0 ? (
        <Empty>{t('customers.no_devices')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('customers.device')}</th>
              <th>{t('customers.last_ip')}</th>
              <th>{t('customers.first_seen')}</th>
              <th>{t('customers.last_seen')}</th>
              <th>{t('customers.col_status')}</th>
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
                      <Pill tone="warn">{t('customers.no_fingerprint')}</Pill>
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
                    {label(`customers.device_status_${row.status}`, row.status)}
                  </Pill>
                  {row.revokedReason ? <div className="a-hint">{row.revokedReason}</div> : null}
                </td>
                <td>
                  {mayWrite && row.status === 'pending' ? (
                    <form className="a-inline-form" action={decideDevice}>
                      <input type="hidden" name="deviceId" value={row.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="a-btn accent small" type="submit">
                        {t('customers.approve_device')}
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
                        aria-label={t('customers.device_action')}
                      >
                        {row.status === 'active' ? (
                          <option value="revoke">{t('customers.device_revoke')}</option>
                        ) : null}
                        <option value="ban">{t('customers.device_ban')}</option>
                        <option value="ban_all">{t('customers.device_ban_all')}</option>
                      </select>
                      <button className="a-btn danger small" type="submit">
                        {t('customers.apply')}
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
