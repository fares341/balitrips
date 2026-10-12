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
      <PageHead
        title="Protection"
        description="Bans and anti-sharing signals. Banning a specific account or device is done from the customer's page."
      />
      <Flash searchParams={params} />

      <div className="a-card">
        <h2>
          Alerts awaiting review:{' '}
          <Link href={adminHref('/protection/alerts')}>{openAlerts?.value ?? 0}</Link>
        </h2>
        <p className="a-hint">
          Raised automatically by the detection rules.{' '}
          <Link href={adminHref('/protection/sessions')}>Live sessions →</Link>
        </p>
      </div>

      <div className="a-card">
        <h2>Settings</h2>
        <form className="a-form" action={saveSecuritySettings}>
          <fieldset disabled={!mayWrite} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="a-row">
              <Field
                label="Default device limit"
                htmlFor="defaultDeviceLimit"
                hint="Used when an account's entitlements do not set their own device_limit."
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
              <Field label="When a new device exceeds the limit" htmlFor="newDevicePolicy">
                <select
                  className="a-select"
                  id="newDevicePolicy"
                  name="newDevicePolicy"
                  defaultValue={settings.newDevicePolicy}
                >
                  <option value="block">Refuse sign-in (user removes a device)</option>
                  <option value="evict_oldest">Sign out the oldest device</option>
                  <option value="require_approval">Needs admin approval</option>
                  <option value="warn">Allow, and show an upgrade message</option>
                </select>
              </Field>
              <Field label="PDF downloads" htmlFor="pdfDownloads">
                <select
                  className="a-select"
                  id="pdfDownloads"
                  name="pdfDownloads"
                  defaultValue={settings.pdfDownloads}
                >
                  <option value="allow">Allow (watermarked)</option>
                  <option value="view_only">View in browser only</option>
                </select>
              </Field>
              <Field
                label="Downloads per schedule"
                htmlFor="maxDownloadsPerItem"
                hint="0 = unlimited. Viewing in the browser never counts."
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
              Automatic actions: 1h IP ban for credential stuffing, 24h account ban for heavy device
              switching, and suspension pending review for repeated over-the-limit sign-ins or
              repeated attempts on content the account does not own. Staff and admin accounts are
              never acted on automatically. Alerts are raised either way.
            </label>
            {mayWrite ? (
              <div className="a-actions">
                <button className="a-btn" type="submit">
                  Save settings
                </button>
              </div>
            ) : null}
          </fieldset>
        </form>
      </div>

      <div className="a-row">
        {(
          [
            ['login_failed', 'Failed sign-ins'],
            ['device_limit_blocked', 'Device-limit refusals'],
            ['login_blocked', 'Blocked sign-ins'],
            ['unauthorized_access', 'Unauthorized access'],
            ['new_device', 'New devices'],
          ] as const
        ).map(([action, label]) => (
          <Link
            key={action}
            className="a-card"
            href={activityHref(action)}
            style={{ minWidth: 160 }}
          >
            <div className="a-muted">{label} · 24h</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{count(action)}</div>
          </Link>
        ))}
      </div>

      <div className="a-card">
        <h2>Suspended accounts (pending review)</h2>
        <p className="a-hint">
          Suspended automatically by the protection rules. They cannot sign in or open paid content
          until reactivated. Review the account&apos;s activity first.
        </p>
        {suspendedUsers.length === 0 ? (
          <Empty>No account is waiting for review.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Reason</th>
                <th>Since</th>
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
                      activity
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
                          Reactivate
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
        <h2>Banned accounts</h2>
        {bannedUsers.length === 0 ? (
          <Empty>No account is banned.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Reason</th>
                <th>Until</th>
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
                      <Pill tone="bad">permanent</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card">
        <h2>IP bans</h2>
        {mayWrite ? (
          <form className="a-row" action={banIp} style={{ marginBlockEnd: 12 }}>
            <Field label="IP address" htmlFor="ip">
              <TextInput id="ip" name="ip" required placeholder="203.0.113.7" />
            </Field>
            <Field label="Reason" htmlFor="ip-reason">
              <TextInput id="ip-reason" name="reason" required />
            </Field>
            <Field label="Duration" htmlFor="ip-duration">
              <select className="a-select" id="ip-duration" name="duration" defaultValue="24h">
                <option value="1h">1 hour</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="permanent">Permanent</option>
              </select>
            </Field>
            <div className="a-actions">
              <button className="a-btn danger" type="submit">
                Ban IP
              </button>
            </div>
          </form>
        ) : null}
        <p className="a-hint">
          Shared networks (hotels, airports, mobile carriers) put many travellers behind one
          address. Prefer short bans, and prefer banning the account or device.
        </p>
        {ipBans.length === 0 ? (
          <Empty>No active IP bans.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>IP</th>
                <th>Reason</th>
                <th>Until</th>
                <th>By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ipBans.map(({ ban, by }) => (
                <tr key={ban.id}>
                  <td className="a-mono">{ban.ip}</td>
                  <td>{ban.reason}</td>
                  <td>
                    {ban.until ? <When value={ban.until} /> : <Pill tone="bad">permanent</Pill>}
                  </td>
                  <td>{by ?? '—'}</td>
                  <td>
                    {mayWrite ? (
                      <form className="a-inline-form" action={liftIpBan}>
                        <input type="hidden" name="banId" value={ban.id} />
                        <button className="a-btn small" type="submit">
                          Lift
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
        <h2>Platform-wide device bans</h2>
        {deviceBans.length === 0 ? (
          <Empty>No device fingerprint is banned platform-wide.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Fingerprint</th>
                <th>Reason</th>
                <th>By</th>
                <th>Since</th>
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
                          Lift
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
