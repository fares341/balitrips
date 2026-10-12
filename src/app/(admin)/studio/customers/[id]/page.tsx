import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { auditLog, entitlements, favorites, orders, sessions, users } from '@/db/schema'
import { can, isElevated, isRole, ROLES } from '@/lib/auth/roles'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { isUuid } from '../../../_lib/form'
import { requireCapability } from '../../../_lib/session'
import { Field, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, OrderStatusPill, Pill, Table, When } from '../../../_ui/table'
import {
  changeRole,
  updateCustomerProfile,
  deleteCustomer,
  restoreCustomer,
  revokeAllSessions,
  revokeSession,
} from '../actions'
import { ProtectionPanel } from './protection-panel'

export const dynamic = 'force-dynamic'

/**
 * One account, everything about it, and the four things staff actually do to
 * one: change its role, sign a device out, export its data, erase it.
 *
 * Each of those is gated separately rather than behind one "manage users"
 * flag. Reading the page needs `customers.read`, which staff have; changing a
 * role needs `roles.write` and producing or erasing a data file needs
 * `customers.export`, both of which only an admin has. The buttons are hidden
 * accordingly — and every action re-checks, because a hidden button is not a
 * permission check.
 */

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('customers.read')
  const { id } = await params
  const query = await searchParams

  if (!isUuid(id)) notFound()

  const [account] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!account) notFound()

  const now = new Date()

  const [sessionRows, orderRows, entitlementRows, favoriteRows, auditRows] = await Promise.all([
    db.select().from(sessions).where(eq(sessions.userId, id)).orderBy(desc(sessions.createdAt)),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalMinor: orders.totalMinor,
        currency: orders.presentmentCurrency,
        placedAt: orders.placedAt,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.userId, id))
      .orderBy(desc(orders.createdAt))
      .limit(25),
    db.select().from(entitlements).where(eq(entitlements.userId, id)),
    db.select().from(favorites).where(eq(favorites.userId, id)),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
        actorEmail: users.email,
        ipAddress: auditLog.ipAddress,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(eq(auditLog.entityId, id))
      .orderBy(desc(auditLog.createdAt))
      .limit(20),
  ])

  const mayChangeRole = can(session.role, 'roles.write')
  const mayExport = can(session.role, 'customers.export')
  const isSelf = account.id === session.userId
  const live = sessionRows.filter((row) => row.expiresAt > now)

  return (
    <>
      <PageHead
        title={account.email}
        description={
          account.deletedAt
            ? 'This account has been erased. Its order history is intact — that is a financial record, not consent-based data.'
            : `${account.name ?? 'No name on file'} · joined ${account.createdAt.toISOString().slice(0, 10)}`
        }
        actions={
          <Link className="a-btn ghost" href={adminHref('/customers')}>
            Back to list
          </Link>
        }
      />
      <Flash searchParams={query} />

      <div className="a-grid">
        <div className="a-stat">
          <b>{account.role}</b>
          <span>Role</span>
        </div>
        <div className="a-stat">
          <b>{live.length}</b>
          <span>Live sessions</span>
        </div>
        <div className="a-stat">
          <b>{orderRows.length}</b>
          <span>Orders</span>
        </div>
        <div className="a-stat">
          <b>{favoriteRows.length}</b>
          <span>Saved items</span>
        </div>
      </div>

      <div className="a-card">
        <h2>Account</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '4px 16px',
            margin: 0,
            fontSize: 13,
          }}
        >
          <dt className="a-muted">Id</dt>
          <dd className="a-mono" style={{ margin: 0 }}>
            {account.id}
          </dd>
          <dt className="a-muted">E-mail</dt>
          <dd style={{ margin: 0 }}>
            {account.email}{' '}
            {account.emailVerifiedAt ? (
              <Pill tone="good">verified</Pill>
            ) : (
              <Pill tone="warn">unverified</Pill>
            )}
          </dd>
          <dt className="a-muted">Name</dt>
          <dd style={{ margin: 0 }}>{account.name ?? '—'}</dd>
          <dt className="a-muted">Phone</dt>
          <dd style={{ margin: 0 }}>{account.phone ?? '—'}</dd>
          <dt className="a-muted">Country / locale</dt>
          <dd style={{ margin: 0 }}>
            {account.country ?? '—'} · {account.locale}
          </dd>
          <dt className="a-muted">Two-factor</dt>
          <dd style={{ margin: 0 }}>
            {account.twoFactorEnabled ? (
              <Pill tone="good">enrolled</Pill>
            ) : // `users.role` is a varchar, so an unrecognised value is possible
            // and is treated as `customer` here exactly as `getSession()` does.
            isRole(account.role) && isElevated(account.role) ? (
              <Pill tone="bad">required and missing</Pill>
            ) : (
              <Pill tone="neutral">not required</Pill>
            )}
          </dd>
          <dt className="a-muted">Created</dt>
          <dd style={{ margin: 0 }}>
            <When value={account.createdAt} />
          </dd>
          {account.deletedAt ? (
            <>
              <dt className="a-muted">Deleted</dt>
              <dd style={{ margin: 0 }}>
                <When value={account.deletedAt} />
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      {mayChangeRole ? (
        <form className="a-card a-form" action={updateCustomerProfile.bind(null, account.id)}>
          <h2>Edit details</h2>
          <div className="a-row">
            <Field label="Name" htmlFor="p-name">
              <input
                className="a-input"
                id="p-name"
                name="name"
                defaultValue={account.name ?? ''}
              />
            </Field>
            <Field
              label="E-mail"
              htmlFor="p-email"
              hint="Changing the e-mail signs the account out everywhere."
            >
              <input
                className="a-input"
                id="p-email"
                name="email"
                type="email"
                required
                defaultValue={account.email}
              />
            </Field>
            <Field label="Phone" htmlFor="p-phone">
              <input
                className="a-input"
                id="p-phone"
                name="phone"
                defaultValue={account.phone ?? ''}
              />
            </Field>
            <Field label="Country (2 letters)" htmlFor="p-country">
              <input
                className="a-input"
                id="p-country"
                name="country"
                maxLength={2}
                defaultValue={account.country ?? ''}
              />
            </Field>
          </div>
          <div className="a-actions">
            <button className="a-btn accent" type="submit">
              Save details
            </button>
          </div>
        </form>
      ) : null}

      <div className="a-cols">
        <div className="a-card">
          <h2>Role</h2>
          {mayChangeRole ? (
            isSelf ? (
              <p className="a-hint">
                This is your own account. Changing your own role here could remove the last admin
                and lock the team out of the screen that would fix it, so it is refused — ask
                another admin.
              </p>
            ) : (
              <form className="a-row" action={changeRole.bind(null, account.id)}>
                <Field
                  label="Role"
                  htmlFor="role"
                  hint="Changing this revokes every session the account has, so the new role is in force immediately rather than whenever a cached session expires."
                >
                  <select className="a-select" id="role" name="role" defaultValue={account.role}>
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="a-actions">
                  <button className="a-btn accent" type="submit">
                    Change role
                  </button>
                </div>
              </form>
            )
          ) : (
            <p className="a-hint">
              Currently <strong>{account.role}</strong>. Only an admin can change a role.
            </p>
          )}
        </div>

        <div className="a-card">
          <h2>Data subject requests</h2>
          {mayExport ? (
            <>
              <p className="a-hint">
                The export is every row this system holds about the account, as JSON. Credentials —
                the TOTP secret, the password hash and live session tokens — are deliberately left
                out: they are not personal data, and an export that carries them is an account
                takeover waiting to be forwarded. Running one writes an audit row.
              </p>
              <div className="a-actions" style={{ marginBlockStart: 12 }}>
                <a className="a-btn" href={adminHref(`/customers/${account.id}/export`)} download>
                  Download data export
                </a>
              </div>
            </>
          ) : (
            <p className="a-hint">
              Producing a portable copy of an account is admin-only. Ask an admin to run it.
            </p>
          )}
        </div>
      </div>

      <ProtectionPanel userId={account.id} viewerRole={session.role} isSelf={isSelf} />

      <div className="a-card">
        <h2>Sessions</h2>
        {sessionRows.length === 0 ? (
          <p className="a-hint">
            No sessions on record — the account has never signed in, or every session has been
            collected.
          </p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>IP</th>
                  <th>Started</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessionRows.map((row) => {
                  const expired = row.expiresAt <= now
                  return (
                    <tr key={row.id}>
                      <td style={{ maxWidth: 420 }}>
                        <span className="a-mono">{row.userAgent ?? 'unknown client'}</span>
                        {row.id === session.sessionId ? (
                          <div>
                            <Pill tone="info">this is your own session</Pill>
                          </div>
                        ) : null}
                      </td>
                      <td className="a-mono">{row.ipAddress ?? '—'}</td>
                      <td>
                        <When value={row.createdAt} />
                      </td>
                      <td>
                        {expired ? (
                          <Pill tone="neutral">expired</Pill>
                        ) : (
                          <When value={row.expiresAt} />
                        )}
                      </td>
                      <td>
                        {expired ? null : (
                          <form
                            className="a-inline-form"
                            action={revokeSession.bind(null, account.id)}
                          >
                            <input type="hidden" name="sessionId" value={row.id} />
                            <button className="a-btn danger small" type="submit">
                              Revoke
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>

            {live.length > 0 ? (
              <form
                className="a-inline-form"
                action={revokeAllSessions.bind(null, account.id)}
                style={{ marginBlockStart: 12 }}
              >
                <button className="a-btn danger" type="submit">
                  Revoke all {live.length} live session{live.length === 1 ? '' : 's'}
                </button>
              </form>
            ) : null}
          </>
        )}
      </div>

      <div className="a-card">
        <h2>Orders</h2>
        {orderRows.length === 0 ? (
          <Empty>No orders.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orderRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link className="a-mono" href={adminHref(`/orders/${row.id}`)}>
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td>
                    <OrderStatusPill status={row.status} />
                  </td>
                  <td className="num">{formatMoney(row.totalMinor, row.currency, 'en')}</td>
                  <td>
                    <When value={row.placedAt ?? row.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {entitlementRows.length > 0 ? (
        <div className="a-card">
          <h2>Entitlements</h2>
          <Table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Starts</th>
                <th>Expires</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {entitlementRows.map((row) => (
                <tr key={row.id}>
                  <td className="a-mono">{row.kind}</td>
                  <td>
                    <When value={row.startsAt} />
                  </td>
                  <td>
                    {row.expiresAt ? (
                      <When value={row.expiresAt} />
                    ) : (
                      <Pill tone="good">lifetime</Pill>
                    )}
                  </td>
                  <td>
                    {row.revokedAt ? (
                      <Pill tone="bad">revoked</Pill>
                    ) : (
                      <Pill tone="good">active</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      {auditRows.length > 0 ? (
        <div className="a-card">
          <h2>What staff have done to this account</h2>
          <Table>
            <thead>
              <tr>
                <th>Action</th>
                <th>By</th>
                <th>From</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id}>
                  <td className="a-mono">{row.action}</td>
                  <td>{row.actorEmail ?? <span className="a-muted">system</span>}</td>
                  <td className="a-mono">{row.ipAddress ?? '—'}</td>
                  <td>
                    <When value={row.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      {mayExport && !isSelf ? (
        account.deletedAt ? (
          <form className="a-card" action={restoreCustomer.bind(null, account.id)}>
            <h2>Restore</h2>
            <p className="a-hint">
              Lifts the deletion flag so the account can sign in again. The name, phone and e-mail
              were pseudonymised on erasure and are gone for good — the customer sets them again.
            </p>
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              <button className="a-btn" type="submit">
                Restore account
              </button>
            </div>
          </form>
        ) : (
          <form className="a-card a-form" action={deleteCustomer.bind(null, account.id)}>
            <h2>Erasure request</h2>
            <p className="a-hint">
              Soft delete plus pseudonymisation: the account is signed out everywhere, its directly
              identifying columns are cleared, and it can no longer sign in. Orders, payments and
              refunds are <strong>kept</strong> — they are retained under a legal obligation rather
              than consent, and each already carries its own frozen customer snapshot. This cannot
              be undone from here.
            </p>
            <div className="a-row">
              <Field
                label="Type the e-mail address to confirm"
                htmlFor="confirm"
                hint={account.email}
              >
                <TextInput id="confirm" name="confirm" autoComplete="off" required />
              </Field>
              <Field label="Reason" htmlFor="reason" hint="Recorded on the audit row.">
                <TextInput id="reason" name="reason" placeholder="Subject request, ticket #…" />
              </Field>
            </div>
            <div className="a-actions">
              <button className="a-btn danger" type="submit">
                Erase account
              </button>
            </div>
          </form>
        )
      ) : null}
    </>
  )
}
