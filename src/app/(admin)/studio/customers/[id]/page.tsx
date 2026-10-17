import { asc, desc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { listSchedules } from '@/app/[locale]/account/_lib/queries'
import { db } from '@/db'
import {
  auditLog,
  customTripDocuments,
  customTripRequests,
  entitlements,
  favorites,
  orders,
  plans,
  sessions,
  users,
} from '@/db/schema'
import { defaultLocale, isLocale } from '@/i18n/config'
import { contactLabel, isPlaceholderEmail } from '@/lib/auth/phone'
import { can, isElevated, isRole, ROLES } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { parseUserAgent } from '@/lib/security/fingerprint'

import { adminHref } from '../../../_lib/admin-path'
import { auditActionLabel } from '../../../_lib/audit-labels'
import { isUuid } from '../../../_lib/form'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { Field, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, OrderStatusPill, Pill, Table, When } from '../../../_ui/table'
import { accessKindLabel } from '../../orders/labels'
import { labelOr } from '../../protection/labels'
import {
  changeRole,
  grantPlanToCustomer,
  setAccountActive,
  updateCustomerProfile,
  deleteCustomer,
  restoreCustomer,
  revokeAllSessions,
  revokeSession,
} from '../actions'
import { revokeEntitlement } from '../../entitlements/actions'
import { accessLine, loadAccountSummaries } from '../summary'
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
  const { t, intl, locale } = await getAdminI18n()
  /** Enum value → label; an unknown value shows as stored. */
  const label = (key: string, raw: string) => (t(key) === key ? raw : t(key))

  if (!isUuid(id)) notFound()

  const [account] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!account) notFound()

  const now = new Date()
  const accountLocale = isLocale(account.locale) ? account.locale : defaultLocale

  const [
    sessionRows,
    orderRows,
    entitlementRows,
    favoriteRows,
    auditRows,
    scheduleRows,
    customDocRows,
    planRows,
  ] = await Promise.all([
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
    db
      .select({ entitlement: entitlements, planName: plans.name, planSlug: plans.slug })
      .from(entitlements)
      .leftJoin(plans, eq(plans.id, entitlements.planId))
      .where(eq(entitlements.userId, id))
      .orderBy(desc(entitlements.startsAt)),
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
    // الوثيقة 21.2 "الملفات": جداول PDF المشتراة (سطور itinerary مدفوعة).
    listSchedules(id, accountLocale),
    // ...وملفات الجداول المخصصة المرفوعة لطلباته.
    db
      .select({
        doc: customTripDocuments,
        requestId: customTripRequests.id,
        startDate: customTripRequests.startDate,
      })
      .from(customTripDocuments)
      .innerJoin(customTripRequests, eq(customTripRequests.id, customTripDocuments.requestId))
      .where(eq(customTripRequests.userId, id))
      .orderBy(desc(customTripDocuments.createdAt))
      .limit(50),
    db
      .select({
        id: plans.id,
        name: plans.name,
        slug: plans.slug,
        status: plans.status,
        entitlementKind: plans.entitlementKind,
        durationDays: plans.durationDays,
        deviceLimit: plans.deviceLimit,
      })
      .from(plans)
      .where(isNull(plans.deletedAt))
      .orderBy(asc(plans.sortOrder)),
  ])

  const mayChangeRole = can(session.role, 'roles.write')
  const mayExport = can(session.role, 'customers.export')
  const isSelf = account.id === session.userId
  const mayDeactivate = can(session.role, 'security.write')
  const mayGrant = can(session.role, 'entitlements.grant')
  const live = sessionRows.filter((row) => row.expiresAt > now)
  const summary = (await loadAccountSummaries([account.id], locale)).get(account.id)
  const currentAccess = summary?.access ?? []
  const phoneOnly = isPlaceholderEmail(account.email)
  const livePlanGrants = entitlementRows.filter(
    ({ entitlement }) =>
      entitlement.planId !== null &&
      entitlement.revokedAt === null &&
      (entitlement.expiresAt === null || entitlement.expiresAt > now),
  )
  // 'inactive' (إداري) و'suspended' (تعليق تلقائي من قواعد الحماية) كلاهما يُعاد
  // تفعيله بـ setAccountActive ← 'active'. 'banned' يُرفع من لوحة الحماية.
  const dormant = account.status === 'inactive' || account.status === 'suspended'
  const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
    active: 'good',
    inactive: 'neutral',
    suspended: 'warn',
    banned: 'bad',
  }

  return (
    <>
      <PageHead
        title={contactLabel(account)}
        description={
          account.deletedAt
            ? t('customers.erased_description')
            : t('customers.joined_line', {
                name: account.name ?? t('customers.no_name'),
                date: new Intl.DateTimeFormat(intl, {
                  dateStyle: 'medium',
                  timeZone: 'Asia/Makassar',
                }).format(account.createdAt),
              })
        }
        actions={
          <Link className="a-btn ghost" href={adminHref('/customers')}>
            {t('customers.back_to_list')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <div className="a-grid">
        <div className="a-stat">
          <b>{label(`customers.role_${account.role}`, account.role)}</b>
          <span>{t('customers.role')}</span>
        </div>
        <div className="a-stat">
          <b>{live.length}</b>
          <span>{t('customers.live_sessions')}</span>
        </div>
        <div className="a-stat">
          <b>{orderRows.length}</b>
          <span>{t('customers.orders')}</span>
        </div>
        <div className="a-stat">
          <b>{favoriteRows.length}</b>
          <span>{t('customers.saved_items')}</span>
        </div>
        <div className="a-stat">
          <b style={{ fontSize: 15 }}>
            {currentAccess.length === 0
              ? t('customers.none')
              : currentAccess.map((access) => accessLine(access, t, intl)).join(' · ')}
          </b>
          <span>{t('customers.current_plan')}</span>
        </div>
        <div className="a-stat">
          <b style={{ fontSize: 15 }}>
            <When value={summary?.lastLogin ?? null} />
          </b>
          <span>{t('customers.last_login')}</span>
        </div>
      </div>

      <div className="a-card">
        <h2>{t('customers.account')}</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '4px 16px',
            margin: 0,
            fontSize: 13,
          }}
        >
          <dt className="a-muted">{t('customers.email')}</dt>
          <dd style={{ margin: 0 }}>
            {phoneOnly ? (
              <>
                <span className="a-muted">{t('customers.no_email_phone_only')}</span>{' '}
                <Pill tone="neutral">
                  {t('customers.signs_in_with', { contact: contactLabel(account) })}
                </Pill>
              </>
            ) : (
              <>
                {account.email}{' '}
                {account.emailVerifiedAt ? (
                  <Pill tone="good">{t('customers.verified')}</Pill>
                ) : (
                  <Pill tone="warn">{t('customers.tag_unverified')}</Pill>
                )}
              </>
            )}
          </dd>
          <dt className="a-muted">{t('customers.col_status')}</dt>
          <dd style={{ margin: 0 }}>
            <Pill tone={STATUS_TONE[account.status] ?? 'neutral'}>
              {label(`customers.status_${account.status}`, account.status)}
            </Pill>
          </dd>
          <dt className="a-muted">{t('customers.name')}</dt>
          <dd style={{ margin: 0 }}>{account.name ?? '—'}</dd>
          <dt className="a-muted">{t('customers.phone')}</dt>
          <dd style={{ margin: 0 }}>{account.phone ?? '—'}</dd>
          <dt className="a-muted">{t('customers.country_locale')}</dt>
          <dd style={{ margin: 0 }}>
            {account.country ?? '—'} · {labelOr(t, 'translations.lang_', account.locale)}
          </dd>
          <dt className="a-muted">{t('customers.two_factor')}</dt>
          <dd style={{ margin: 0 }}>
            {account.twoFactorEnabled ? (
              <Pill tone="good">{t('customers.tfa_enrolled')}</Pill>
            ) : // `users.role` is a varchar, so an unrecognised value is possible
            // and is treated as `customer` here exactly as `getSession()` does.
            isRole(account.role) && isElevated(account.role) ? (
              <Pill tone="bad">{t('customers.tfa_required_missing')}</Pill>
            ) : (
              <Pill tone="neutral">{t('customers.tfa_not_required')}</Pill>
            )}
          </dd>
          <dt className="a-muted">{t('customers.col_created')}</dt>
          <dd style={{ margin: 0 }}>
            <When value={account.createdAt} />
          </dd>
          <dt className="a-muted">{t('customers.last_login')}</dt>
          <dd style={{ margin: 0 }}>
            <When value={summary?.lastLogin ?? null} />
          </dd>
          <dt className="a-muted">WhatsApp</dt>
          <dd style={{ margin: 0 }}>
            {account.whatsappOptIn ? (
              <Pill tone="good">{t('customers.whatsapp_opted_in')}</Pill>
            ) : (
              <Pill tone="neutral">{t('customers.whatsapp_not_opted_in')}</Pill>
            )}
          </dd>
          {account.deletedAt ? (
            <>
              <dt className="a-muted">{t('customers.state_deleted')}</dt>
              <dd style={{ margin: 0 }}>
                <When value={account.deletedAt} />
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      {mayDeactivate && account.status !== 'banned' && !isSelf ? (
        <form className="a-card a-row" action={setAccountActive.bind(null, account.id)}>
          <h2 style={{ margin: 0 }}>{t('customers.account_status')}</h2>
          <span>
            {t('customers.currently')}{' '}
            <Pill tone={STATUS_TONE[account.status] ?? 'neutral'}>
              {label(`customers.status_${account.status}`, account.status)}
            </Pill>
            {account.status === 'suspended' ? ` ${t('customers.suspended_by_rule')}` : null}
          </span>
          <input type="hidden" name="active" value={dormant ? 'true' : 'false'} />
          <button className={dormant ? 'a-btn accent' : 'a-btn danger'} type="submit">
            {dormant ? t('customers.reactivate') : t('customers.deactivate')}
          </button>
        </form>
      ) : null}

      {mayChangeRole ? (
        <form className="a-card a-form" action={updateCustomerProfile.bind(null, account.id)}>
          <h2>{t('customers.edit_details')}</h2>
          <div className="a-row">
            <Field label={t('customers.name')} htmlFor="p-name">
              <input
                className="a-input"
                id="p-name"
                name="name"
                defaultValue={account.name ?? ''}
              />
            </Field>
            <Field
              label={t('customers.email')}
              htmlFor="p-email"
              hint={t('customers.email_change_hint')}
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
            <Field label={t('customers.phone')} htmlFor="p-phone">
              <input
                className="a-input"
                id="p-phone"
                name="phone"
                defaultValue={account.phone ?? ''}
              />
            </Field>
            <Field label={t('customers.country_code')} htmlFor="p-country">
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
              {t('customers.save_details')}
            </button>
          </div>
        </form>
      ) : null}

      <div className="a-cols">
        <div className="a-card">
          <h2>{t('customers.role')}</h2>
          {mayChangeRole ? (
            isSelf ? (
              <p className="a-hint">{t('customers.own_role_hint')}</p>
            ) : (
              <form className="a-row" action={changeRole.bind(null, account.id)}>
                <Field
                  label={t('customers.role')}
                  htmlFor="role"
                  hint={t('customers.role_change_hint')}
                >
                  <select className="a-select" id="role" name="role" defaultValue={account.role}>
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {label(`customers.role_${value}`, value)}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="a-actions">
                  <button className="a-btn accent" type="submit">
                    {t('customers.change_role')}
                  </button>
                </div>
              </form>
            )
          ) : (
            <p className="a-hint">
              {t('customers.currently')}{' '}
              <strong>{label(`customers.role_${account.role}`, account.role)}</strong>.{' '}
              {t('customers.role_admin_only')}
            </p>
          )}
        </div>

        <div className="a-card">
          <h2>{t('customers.dsr_title')}</h2>
          {mayExport ? (
            <>
              <p className="a-hint">{t('customers.dsr_hint')}</p>
              <div className="a-actions" style={{ marginBlockStart: 12 }}>
                <a className="a-btn" href={adminHref(`/customers/${account.id}/export`)} download>
                  {t('customers.download_export')}
                </a>
              </div>
            </>
          ) : (
            <p className="a-hint">{t('customers.export_admin_only')}</p>
          )}
        </div>
      </div>

      <ProtectionPanel userId={account.id} viewerRole={session.role} isSelf={isSelf} />

      <div className="a-card">
        <h2>{t('customers.sessions')}</h2>
        {sessionRows.length === 0 ? (
          <p className="a-hint">{t('customers.no_sessions')}</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>{t('customers.device')}</th>
                  <th>{t('customers.last_ip')}</th>
                  <th>{t('customers.started')}</th>
                  <th>{t('customers.expires')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessionRows.map((row) => {
                  const expired = row.expiresAt <= now
                  return (
                    <tr key={row.id}>
                      <td style={{ maxWidth: 420 }}>
                        <span>{agentName(row.userAgent) ?? t('customers.unknown_client')}</span>
                        {row.id === session.sessionId ? (
                          <div>
                            <Pill tone="info">{t('customers.own_session')}</Pill>
                          </div>
                        ) : null}
                      </td>
                      <td className="a-mono">{row.ipAddress ?? '—'}</td>
                      <td>
                        <When value={row.createdAt} />
                      </td>
                      <td>
                        {expired ? (
                          <Pill tone="neutral">{t('customers.expired')}</Pill>
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
                              {t('customers.revoke')}
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
                  {t('customers.revoke_all', { count: live.length })}
                </button>
              </form>
            ) : null}
          </>
        )}
      </div>

      <div className="a-card">
        <h2>{t('customers.orders')}</h2>
        {orderRows.length === 0 ? (
          <Empty>{t('customers.no_orders')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('customers.reference')}</th>
                <th>{t('customers.col_status')}</th>
                <th className="num">{t('customers.total')}</th>
                <th>{t('customers.placed')}</th>
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
                  <td className="num">{formatMoney(row.totalMinor, row.currency, intl)}</td>
                  <td>
                    <When value={row.placedAt ?? row.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card">
        <h2>{t('customers.files')}</h2>
        {scheduleRows.length === 0 && customDocRows.length === 0 ? (
          <Empty>{t('customers.no_files')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('customers.file')}</th>
                <th>{t('customers.source')}</th>
                <th>{t('customers.document')}</th>
                <th>{t('customers.date')}</th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.map((row) => (
                <tr key={row.orderItemId}>
                  <td>
                    <Link href={adminHref(`/itineraries/${row.itineraryId}`)}>
                      {row.name ? pick(row.name, locale) : t('customers.itinerary')}
                    </Link>
                    <div className="a-muted">v{row.version}</div>
                  </td>
                  <td>
                    <Link className="a-mono" href={adminHref(`/orders/${row.orderId}`)}>
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td>
                    {row.documentReady ? (
                      <Pill tone="good">{t('customers.pdf_available')}</Pill>
                    ) : (
                      <Pill tone="warn">{t('customers.pdf_not_generated')}</Pill>
                    )}
                  </td>
                  <td>
                    <When value={row.purchasedAt} />
                  </td>
                </tr>
              ))}
              {customDocRows.map(({ doc, requestId, startDate }) => (
                <tr key={doc.id}>
                  <td>
                    {doc.filename}
                    <div className="a-muted">
                      {t('customers.custom_plan_version', {
                        version: doc.version,
                        size: new Intl.NumberFormat(intl).format(Math.round(doc.bytes / 1024)),
                      })}
                    </div>
                  </td>
                  <td>
                    <Link href={adminHref(`/leads/${requestId}`)}>
                      {t('customers.custom_request')}
                      {startDate ? ` · ${startDate}` : ''}
                    </Link>
                  </td>
                  <td>
                    {doc.withdrawnAt ? (
                      <Pill tone="neutral">{t('customers.withdrawn')}</Pill>
                    ) : (
                      <Pill tone="good">{t('customers.delivered')}</Pill>
                    )}
                  </td>
                  <td>
                    <When value={doc.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {mayGrant && !account.deletedAt ? (
        <form className="a-card a-form" action={grantPlanToCustomer.bind(null, account.id)}>
          <h2>{t('customers.change_plan')}</h2>
          <p className="a-hint">
            {t('customers.grant_hint')}
            {livePlanGrants.length > 0
              ? ` ${t('customers.live_grants', { count: livePlanGrants.length })}`
              : ''}
          </p>
          <div className="a-row">
            <Field label={t('customers.plan')} htmlFor="planId">
              <select className="a-select" id="planId" name="planId" required defaultValue="">
                <option value="" disabled>
                  {t('customers.choose_plan')}
                </option>
                {planRows.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {pick(plan.name, locale, plan.slug)} ·{' '}
                    {plan.entitlementKind === 'basic'
                      ? t('customers.no_map')
                      : label(`customers.kind_${plan.entitlementKind}`, plan.entitlementKind)}{' '}
                    ·{' '}
                    {plan.durationDays === null
                      ? t('customers.access_lifetime')
                      : t('customers.days', { count: plan.durationDays })}{' '}
                    · {t('customers.devices', { count: plan.deviceLimit })}
                    {plan.status === 'published' ? '' : ` (${t('customers.draft')})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('customers.reason')}
              htmlFor="grant-reason"
              hint={t('customers.reason_hint')}
            >
              <TextInput
                id="grant-reason"
                name="reason"
                placeholder={t('customers.grant_reason_placeholder')}
              />
            </Field>
            <div className="a-field">
              <label>
                <input type="checkbox" name="replace" /> {t('customers.replace_grants')}
              </label>
            </div>
          </div>
          <div className="a-actions">
            <button className="a-btn accent" type="submit">
              {t('customers.grant')}
            </button>
          </div>
        </form>
      ) : null}

      {entitlementRows.length > 0 ? (
        <div className="a-card">
          <h2>{t('customers.entitlements')}</h2>
          <Table>
            <thead>
              <tr>
                <th>{t('customers.kind')}</th>
                <th>{t('customers.plan')}</th>
                <th>{t('customers.source')}</th>
                <th>{t('customers.starts')}</th>
                <th>{t('customers.expires')}</th>
                <th>{t('customers.state')}</th>
                {mayGrant ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {entitlementRows.map(({ entitlement: row, planName, planSlug }) => (
                <tr key={row.id}>
                  <td>{accessKindLabel(t, row.kind)}</td>
                  <td>
                    {row.planId ? (
                      <Link href={adminHref(`/plans/${row.planId}`)}>
                        {planName
                          ? pick(planName, locale, planSlug ?? t('customers.plan_fallback'))
                          : t('customers.plan_fallback')}
                      </Link>
                    ) : (
                      <span className="a-muted">—</span>
                    )}
                  </td>
                  <td>
                    {row.grantedByOrderId ? (
                      <Link href={adminHref(`/orders/${row.grantedByOrderId}`)}>
                        {t('customers.source_order')}
                      </Link>
                    ) : row.grantedByActorId ? (
                      <Pill tone="info">{t('customers.source_staff')}</Pill>
                    ) : row.sharedByUserId ? (
                      <Pill tone="info">{t('customers.source_family')}</Pill>
                    ) : (
                      <span className="a-muted">—</span>
                    )}
                  </td>
                  <td>
                    <When value={row.startsAt} />
                  </td>
                  <td>
                    {row.expiresAt ? (
                      <When value={row.expiresAt} />
                    ) : (
                      <Pill tone="good">{t('customers.access_lifetime')}</Pill>
                    )}
                  </td>
                  <td>
                    {row.revokedAt ? (
                      <Pill tone="bad">{t('customers.revoked')}</Pill>
                    ) : row.expiresAt !== null && row.expiresAt <= now ? (
                      <Pill tone="warn">{t('customers.expired')}</Pill>
                    ) : row.startsAt > now ? (
                      <Pill tone="info">{t('customers.scheduled')}</Pill>
                    ) : (
                      <Pill tone="good">{t('customers.status_active')}</Pill>
                    )}
                  </td>
                  {mayGrant ? (
                    <td>
                      {row.revokedAt === null && (row.expiresAt === null || row.expiresAt > now) ? (
                        <form className="a-inline-form" action={revokeEntitlement}>
                          <input type="hidden" name="entitlementId" value={row.id} />
                          <input type="hidden" name="customerId" value={account.id} />
                          <button className="a-btn danger small" type="submit">
                            {t('customers.revoke')}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      {auditRows.length > 0 ? (
        <div className="a-card">
          <h2>{t('customers.audit_title')}</h2>
          <Table>
            <thead>
              <tr>
                <th>{t('customers.action')}</th>
                <th>{t('customers.by')}</th>
                <th>{t('customers.when')}</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id}>
                  <td>{auditActionLabel(t, row.action)}</td>
                  <td>
                    {row.actorEmail ?? <span className="a-muted">{t('customers.system')}</span>}
                  </td>
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
            <h2>{t('customers.restore')}</h2>
            <p className="a-hint">{t('customers.restore_hint')}</p>
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              <button className="a-btn" type="submit">
                {t('customers.restore_account')}
              </button>
            </div>
          </form>
        ) : (
          <form className="a-card a-form" action={deleteCustomer.bind(null, account.id)}>
            <h2>{t('customers.erasure_title')}</h2>
            <p className="a-hint">{t('customers.erasure_hint')}</p>
            <div className="a-row">
              <Field label={t('customers.erasure_confirm')} htmlFor="confirm" hint={account.email}>
                <TextInput id="confirm" name="confirm" autoComplete="off" required />
              </Field>
              <Field
                label={t('customers.reason')}
                htmlFor="reason"
                hint={t('customers.reason_hint')}
              >
                <TextInput
                  id="reason"
                  name="reason"
                  placeholder={t('customers.erasure_reason_placeholder')}
                />
              </Field>
            </div>
            <div className="a-actions">
              <button className="a-btn danger" type="submit">
                {t('customers.erase_account')}
              </button>
            </div>
          </form>
        )
      ) : null}
    </>
  )
}

/** "Chrome · macOS" instead of the raw browser string; null when nothing is recognisable. */
function agentName(userAgent: string | null): string | null {
  if (!userAgent) return null
  const { browser, os } = parseUserAgent(userAgent)
  const parts = [browser, os].filter((part) => part !== 'Unknown')
  return parts.length > 0 ? parts.join(' · ') : null
}
