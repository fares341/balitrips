import { and, count, desc, eq, gt, inArray } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { contactLabel, isPlaceholderEmail } from '@/lib/auth/phone'
import { can } from '@/lib/auth/roles'
import { customerTags, orders, sessions, users } from '@/db/schema'
import { loadStaff, loadStages, SMART_LISTS } from '@/lib/crm/queries'
import { ROLES } from '@/lib/auth/roles'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { pageParam } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../_ui/table'
import { customerFilters } from './filters'
import { accessLine, loadAccountSummaries } from './summary'

export const dynamic = 'force-dynamic'

/**
 * Everyone with an account: customers, staff and admins in one list.
 *
 * Not split by role, because the question an operator actually arrives with
 * is "what is going on with this e-mail address" — and the answer is the same
 * screen whether that address belongs to a traveller or to a colleague.
 *
 * Live session count is computed here rather than on the detail page so the
 * list answers "who is currently signed in somewhere" at a glance; an
 * expired-but-not-yet-collected row is not a live session and is excluded by
 * the `expires_at > now()` predicate.
 */

const PAGE_SIZE = 30

const STATUS_TONES: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  active: 'good',
  inactive: 'warn',
  suspended: 'warn',
  banned: 'bad',
}
const LIST = adminHref('/customers')

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('customers.read')
  const params = await searchParams
  const { t, intl, locale } = await getAdminI18n()
  /** Enum value → label; an unknown value shows as stored. */
  const label = (key: string, raw: string) => (t(key) === key ? raw : t(key))

  const { q, role, state, tag, list, consent, assigned, where } = customerFilters(params)
  const page = pageParam(params)
  const mayExport = can(session.role, 'customers.export')
  const exportQuery = new URLSearchParams(
    Object.entries({ q, role, state, tag, list, consent, assigned }).flatMap(([key, value]) =>
      value ? [[key, value]] : [],
    ),
  ).toString()
  const now = new Date()

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        name: users.name,
        crmStage: users.crmStage,
        marketingConsent: users.marketingConsent,
        role: users.role,
        status: users.status,
        locale: users.locale,
        country: users.country,
        twoFactorEnabled: users.twoFactorEnabled,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
        liveSessions: db.$count(
          sessions,
          and(eq(sessions.userId, users.id), gt(sessions.expiresAt, now)),
        ),
        orderCount: db.$count(orders, eq(orders.userId, users.id)),
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(users).where(where),
  ])
  const [summaries, stages, tagRows, staff] = await Promise.all([
    loadAccountSummaries(
      rows.map((row) => row.id),
      locale,
    ),
    loadStages(rows),
    rows.length === 0
      ? Promise.resolve([])
      : db
          .select({ userId: customerTags.userId, tag: customerTags.tag })
          .from(customerTags)
          .where(
            inArray(
              customerTags.userId,
              rows.map((row) => row.id),
            ),
          ),
    loadStaff(),
  ])
  const tagsOf = new Map<string, string[]>()
  for (const row of tagRows) tagsOf.set(row.userId, [...(tagsOf.get(row.userId) ?? []), row.tag])

  return (
    <>
      <PageHead title={t('customers.title')} description={t('customers.description')} />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('customers.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('customers.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="role">{t('customers.role')}</label>
          <select className="a-select" id="role" name="role" defaultValue={role ?? ''}>
            <option value="">{t('customers.any')}</option>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {label(`customers.role_${value}`, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="state">{t('customers.state')}</label>
          <select className="a-select" id="state" name="state" defaultValue={state ?? ''}>
            <option value="">{t('customers.state_active')}</option>
            <option value="deleted">{t('customers.state_deleted')}</option>
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="tag">{t('crm.tag')}</label>
          <input className="a-input" id="tag" name="tag" defaultValue={tag ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="list">{t('crm.smart_list')}</label>
          <select className="a-select" id="list" name="list" defaultValue={list ?? ''}>
            <option value="">{t('customers.any')}</option>
            {SMART_LISTS.map((value) => (
              <option key={value} value={value}>
                {t(`crm.list_${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="assigned">{t('crm.assigned')}</label>
          <select className="a-select" id="assigned" name="assigned" defaultValue={assigned ?? ''}>
            <option value="">{t('customers.any')}</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label className="a-check">
            <input type="checkbox" name="consent" value="yes" defaultChecked={consent === 'yes'} />
            {t('crm.consent_only')}
          </label>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('customers.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('customers.reset')}
          </Link>
          {mayExport ? (
            // Route handler: a plain <a> so the browser downloads the file.
            <a className="a-btn ghost" href={`${adminHref('/customers/export')}?${exportQuery}`}>
              {t('customers.export_csv')}
            </a>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('customers.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('customers.col_account')}</th>
              <th>{t('customers.col_status')}</th>
              <th>{t('crm.stage')}</th>
              <th>{t('customers.current_plan')}</th>
              <th>{t('customers.last_login')}</th>
              <th>{t('customers.role')}</th>
              <th>{t('customers.two_factor')}</th>
              <th className="num">{t('customers.col_sessions')}</th>
              <th className="num">{t('customers.orders')}</th>
              <th>{t('customers.col_locale')}</th>
              <th>{t('customers.col_created')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const summary = summaries.get(row.id)
              const phoneOnly = isPlaceholderEmail(row.email)
              return (
                <tr key={row.id}>
                  <td>
                    {/* حساب الجوال وحده: الرقم بدل البريد البديل `@phone.balitrips.invalid`. */}
                    <Link href={adminHref(`/customers/${row.id}`)}>{contactLabel(row)}</Link>
                    <div className="a-muted">
                      {row.name ?? '—'}
                      {phoneOnly ? ` · ${t('customers.tag_phone_only')}` : ''}
                      {row.deletedAt ? ` · ${t('customers.tag_deleted')}` : ''}
                      {row.emailVerifiedAt === null && row.deletedAt === null && !phoneOnly
                        ? ` · ${t('customers.tag_unverified')}`
                        : ''}
                    </div>
                  </td>
                  <td>
                    {row.deletedAt ? (
                      <Pill tone="bad">{t('customers.status_deleted')}</Pill>
                    ) : (
                      <Pill tone={STATUS_TONES[row.status] ?? 'neutral'}>
                        {label(`customers.status_${row.status}`, row.status)}
                      </Pill>
                    )}
                  </td>
                  <td>
                    <Pill tone="info">{t(`crm.stage_${stages.get(row.id) ?? 'lead'}`)}</Pill>
                    {(tagsOf.get(row.id) ?? []).length > 0 ? (
                      <div className="a-muted" style={{ fontSize: 12 }}>
                        {(tagsOf.get(row.id) ?? []).map((value) => `#${value}`).join(' ')}
                      </div>
                    ) : null}
                    {row.marketingConsent ? (
                      <div className="a-muted" style={{ fontSize: 12 }}>
                        {t('crm.consent_yes_short')}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {summary && summary.access.length > 0 ? (
                      summary.access.map((access) => (
                        <div key={access.id} className="a-mono" style={{ fontSize: 12 }}>
                          {accessLine(access, t, intl)}
                        </div>
                      ))
                    ) : (
                      <span className="a-muted">{t('customers.none')}</span>
                    )}
                  </td>
                  <td>
                    <When value={summary?.lastLogin ?? null} />
                  </td>
                  <td>
                    <Pill tone={row.role === 'customer' ? 'neutral' : 'info'}>
                      {label(`customers.role_${row.role}`, row.role)}
                    </Pill>
                  </td>
                  <td>
                    {row.role === 'customer' ? (
                      <span className="a-muted">{t('customers.not_applicable')}</span>
                    ) : row.twoFactorEnabled ? (
                      <Pill tone="good">{t('customers.tfa_enrolled')}</Pill>
                    ) : (
                      <Pill tone="bad">{t('customers.tfa_missing')}</Pill>
                    )}
                  </td>
                  <td className="num">{row.liveSessions}</td>
                  <td className="num">{row.orderCount}</td>
                  <td>
                    {label(`translations.lang_${row.locale}`, row.locale)}
                    {row.country ? ` · ${row.country}` : ''}
                  </td>
                  <td>
                    <When value={row.createdAt} />
                  </td>
                </tr>
              )
            })}
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
