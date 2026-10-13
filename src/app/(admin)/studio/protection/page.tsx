import { and, desc, eq, gte, isNull, or, gt, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activityLog, bannedDevices, bannedIps, securityAlerts, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'

import { adminHref } from '../../_lib/admin-path'
import { requireCapability } from '../../_lib/session'
import { readSetting } from '../../_lib/settings'
import { Field, TextInput } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { getAdminI18n } from '../../_lib/i18n'
import { banIp, liftDeviceBan, liftIpBan, liftSuspension, saveSecuritySettings } from './actions'

export const dynamic = 'force-dynamic'

/**
 * مركز الحماية: الحسابات المحظورة، حظر الـ IP والأجهزة، وملخص 24 ساعة.
 * حظر حساب أو جهاز بعينه يتم من صفحة العميل.
 */
export default async function ProtectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('security.read')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const mayWrite = can(session.role, 'security.write')
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [ipBans, deviceBans, bannedUsers, suspendedUsers, summary, settings, [openAlerts]] =
    await Promise.all([
      db
        .select({ ban: bannedIps, by: users.email })
        .from(bannedIps)
        .leftJoin(users, eq(users.id, bannedIps.createdBy))
        .where(
          and(isNull(bannedIps.liftedAt), or(isNull(bannedIps.until), gt(bannedIps.until, now))),
        )
        .orderBy(desc(bannedIps.createdAt)),
      db
        .select({ ban: bannedDevices, by: users.email })
        .from(bannedDevices)
        .leftJoin(users, eq(users.id, bannedDevices.createdBy))
        .where(
          and(
            isNull(bannedDevices.liftedAt),
            or(isNull(bannedDevices.until), gt(bannedDevices.until, now)),
          ),
        )
        .orderBy(desc(bannedDevices.createdAt)),
      db
        .select({
          id: users.id,
          email: users.email,
          bannedUntil: users.bannedUntil,
          banReason: users.banReason,
        })
        .from(users)
        .where(
          and(
            eq(users.status, 'banned'),
            or(isNull(users.bannedUntil), gt(users.bannedUntil, now)),
          ),
        )
        .orderBy(desc(users.updatedAt))
        .limit(100),
      // الوثيقة 18.2: معلّقة تلقائياً لحين مراجعة الإدارة.
      db
        .select({
          id: users.id,
          email: users.email,
          reason: users.banReason,
          since: users.updatedAt,
        })
        .from(users)
        .where(and(eq(users.status, 'suspended'), isNull(users.deletedAt)))
        .orderBy(desc(users.updatedAt))
        .limit(100),
      db
        .select({ action: activityLog.action, value: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(gte(activityLog.createdAt, dayAgo))
        .groupBy(activityLog.action),
      readSetting('security'),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(securityAlerts)
        .where(eq(securityAlerts.status, 'open')),
    ])

  const count = (action: string) => summary.find((row) => row.action === action)?.value ?? 0
  const activityHref = (action: string) => adminHref(`/protection/activity?action=${action}`)

  return (
    <>
      <PageHead title={t('protection.title')} description={t('protection.description')} />
      <Flash searchParams={params} />

      <div className="a-card">
        <h2>
          {t('protection.alerts_awaiting')}{' '}
          <Link href={adminHref('/protection/alerts')}>{openAlerts?.value ?? 0}</Link>
        </h2>
        <p className="a-hint">
          {t('protection.alerts_hint')}{' '}
          <Link href={adminHref('/protection/sessions')}>{t('protection.live_sessions_link')}</Link>
        </p>
      </div>

      <div className="a-card">
        <h2>{t('protection.settings')}</h2>
        <form className="a-form" action={saveSecuritySettings}>
          <fieldset disabled={!mayWrite} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="a-row">
              <Field
                label={t('protection.default_device_limit')}
                htmlFor="defaultDeviceLimit"
                hint={t('protection.default_device_limit_hint')}
              >
                <TextInput
                  id="defaultDeviceLimit"
                  name="defaultDeviceLimit"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={settings.defaultDeviceLimit}
                />
              </Field>
              <Field label={t('protection.new_device_policy')} htmlFor="newDevicePolicy">
                <select
                  className="a-select"
                  id="newDevicePolicy"
                  name="newDevicePolicy"
                  defaultValue={settings.newDevicePolicy}
                >
                  <option value="block">{t('protection.policy_block')}</option>
                  <option value="evict_oldest">{t('protection.policy_evict_oldest')}</option>
                  <option value="require_approval">
                    {t('protection.policy_require_approval')}
                  </option>
                  <option value="warn">{t('protection.policy_warn')}</option>
                </select>
              </Field>
              <Field label={t('protection.pdf_downloads')} htmlFor="pdfDownloads">
                <select
                  className="a-select"
                  id="pdfDownloads"
                  name="pdfDownloads"
                  defaultValue={settings.pdfDownloads}
                >
                  <option value="allow">{t('protection.pdf_allow')}</option>
                  <option value="view_only">{t('protection.pdf_view_only')}</option>
                </select>
              </Field>
              <Field
                label={t('protection.downloads_per_schedule')}
                htmlFor="maxDownloadsPerItem"
                hint={t('protection.downloads_per_schedule_hint')}
              >
                <TextInput
                  id="maxDownloadsPerItem"
                  name="maxDownloadsPerItem"
                  type="number"
                  min={0}
                  max={1000}
                  defaultValue={settings.maxDownloadsPerItem}
                />
              </Field>
            </div>
            <label
              className="a-check"
              style={{ display: 'flex', gap: 8, alignItems: 'center', marginBlock: 8 }}
            >
              <input type="checkbox" name="autoBan" defaultChecked={settings.autoBan} />
              {t('protection.auto_ban')}
            </label>
            {mayWrite ? (
              <div className="a-actions">
                <button className="a-btn" type="submit">
                  {t('protection.save_settings')}
                </button>
              </div>
            ) : null}
          </fieldset>
        </form>
      </div>

      <div className="a-row">
        {(
          [
            ['login_failed', t('protection.stat_login_failed')],
            ['device_limit_blocked', t('protection.stat_device_limit_blocked')],
            ['login_blocked', t('protection.stat_login_blocked')],
            ['unauthorized_access', t('protection.stat_unauthorized_access')],
            ['new_device', t('protection.stat_new_device')],
          ] as const
        ).map(([action, label]) => (
          <Link
            key={action}
            className="a-card"
            href={activityHref(action)}
            style={{ minWidth: 160 }}
          >
            <div className="a-muted">{t('protection.stat_24h', { label })}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{count(action)}</div>
          </Link>
        ))}
      </div>

      <div className="a-card">
        <h2>{t('protection.suspended_title')}</h2>
        <p className="a-hint">{t('protection.suspended_hint')}</p>
        {suspendedUsers.length === 0 ? (
          <Empty>{t('protection.suspended_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('protection.col_account')}</th>
                <th>{t('protection.col_reason')}</th>
                <th>{t('protection.col_since')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {suspendedUsers.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={adminHref(`/customers/${row.id}`)}>{row.email}</Link>{' '}
                    <Link
                      className="a-muted"
                      href={adminHref(`/protection/activity?user=${row.id}`)}
                    >
                      {t('protection.activity_link')}
                    </Link>
                  </td>
                  <td>{row.reason ?? '—'}</td>
                  <td>
                    <When value={row.since} />
                  </td>
                  <td>
                    {mayWrite ? (
                      <form className="a-inline-form" action={liftSuspension}>
                        <input type="hidden" name="userId" value={row.id} />
                        <button className="a-btn accent small" type="submit">
                          {t('protection.reactivate')}
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

      <div className="a-card">
        <h2>{t('protection.banned_title')}</h2>
        {bannedUsers.length === 0 ? (
          <Empty>{t('protection.banned_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('protection.col_account')}</th>
                <th>{t('protection.col_reason')}</th>
                <th>{t('protection.col_until')}</th>
              </tr>
            </thead>
            <tbody>
              {bannedUsers.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={adminHref(`/customers/${row.id}`)}>{row.email}</Link>
                  </td>
                  <td>{row.banReason ?? '—'}</td>
                  <td>
                    {row.bannedUntil ? (
                      <When value={row.bannedUntil} />
                    ) : (
                      <Pill tone="bad">{t('protection.permanent')}</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card">
        <h2>{t('protection.ip_bans_title')}</h2>
        {mayWrite ? (
          <form className="a-row" action={banIp} style={{ marginBlockEnd: 12 }}>
            <Field label={t('protection.ip_address')} htmlFor="ip">
              <TextInput id="ip" name="ip" required placeholder="203.0.113.7" />
            </Field>
            <Field label={t('protection.reason')} htmlFor="ip-reason">
              <TextInput id="ip-reason" name="reason" required />
            </Field>
            <Field label={t('protection.duration')} htmlFor="ip-duration">
              <select className="a-select" id="ip-duration" name="duration" defaultValue="24h">
                <option value="1h">{t('protection.duration_1h')}</option>
                <option value="24h">{t('protection.duration_24h')}</option>
                <option value="7d">{t('protection.duration_7d')}</option>
                <option value="30d">{t('protection.duration_30d')}</option>
                <option value="permanent">{t('protection.duration_permanent')}</option>
              </select>
            </Field>
            <div className="a-actions">
              <button className="a-btn danger" type="submit">
                {t('protection.ban_ip')}
              </button>
            </div>
          </form>
        ) : null}
        <p className="a-hint">{t('protection.ip_hint')}</p>
        {ipBans.length === 0 ? (
          <Empty>{t('protection.ip_bans_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('protection.col_ip')}</th>
                <th>{t('protection.col_reason')}</th>
                <th>{t('protection.col_until')}</th>
                <th>{t('protection.col_by')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ipBans.map(({ ban, by }) => (
                <tr key={ban.id}>
                  <td className="a-mono">{ban.ip}</td>
                  <td>{ban.reason}</td>
                  <td>
                    {ban.until ? (
                      <When value={ban.until} />
                    ) : (
                      <Pill tone="bad">{t('protection.permanent')}</Pill>
                    )}
                  </td>
                  <td>{by ?? '—'}</td>
                  <td>
                    {mayWrite ? (
                      <form className="a-inline-form" action={liftIpBan}>
                        <input type="hidden" name="banId" value={ban.id} />
                        <button className="a-btn small" type="submit">
                          {t('protection.lift')}
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

      <div className="a-card">
        <h2>{t('protection.device_bans_title')}</h2>
        {deviceBans.length === 0 ? (
          <Empty>{t('protection.device_bans_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('protection.col_fingerprint')}</th>
                <th>{t('protection.col_reason')}</th>
                <th>{t('protection.col_by')}</th>
                <th>{t('protection.col_since')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deviceBans.map(({ ban, by }) => (
                <tr key={ban.id}>
                  <td className="a-mono">{ban.fingerprintHash.slice(0, 12)}…</td>
                  <td>{ban.reason}</td>
                  <td>{by ?? '—'}</td>
                  <td>
                    <When value={ban.createdAt} />
                  </td>
                  <td>
                    {mayWrite ? (
                      <form className="a-inline-form" action={liftDeviceBan}>
                        <input type="hidden" name="banId" value={ban.id} />
                        <button className="a-btn small" type="submit">
                          {t('protection.lift')}
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
    </>
  )
}
