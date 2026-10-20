import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm'

import { db } from '@/db'
import { sessions, users } from '@/db/schema'
import {
  assignableRoles,
  canAssignRole,
  capabilitiesOf,
  isRole,
  TEAM_ROLES,
  type Role,
} from '@/lib/auth/roles'

import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Advanced } from '../../_ui/advanced'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { changeMemberRole, inviteMember, resendInvite, setMemberActive } from './actions'

export const dynamic = 'force-dynamic'

/** What each role is for, in plain words (`team.about_<role>`). */
const ROLE_ORDER: readonly Role[] = [
  'admin',
  'staff',
  'operations_manager',
  'booking_agent',
  'support_agent',
  'content_editor',
  'marketing_manager',
  'accountant',
  'supplier_portal',
]

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('users.manage')
  const { t } = await getAdminI18n()
  const params = await searchParams

  const lastSeen = db
    .select({
      userId: sessions.userId,
      at: sql<string | null>`max(${sessions.updatedAt})`.as('at'),
    })
    .from(sessions)
    .groupBy(sessions.userId)
    .as('last_seen')

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      twoFactor: users.twoFactorEnabled,
      createdAt: users.createdAt,
      lastSeen: lastSeen.at,
    })
    .from(users)
    .leftJoin(lastSeen, eq(lastSeen.userId, users.id))
    .where(and(ne(users.role, 'customer'), isNull(users.deletedAt)))
    .orderBy(asc(users.role), desc(users.createdAt))

  const grantable = assignableRoles(session.role).filter((role) => role !== 'customer')
  const roleLabel = (role: string) => (isRole(role) ? t(`shell.role_${role}`) : role)

  return (
    <>
      <PageHead title={t('team.title')} description={t('team.description')} />
      <Flash searchParams={params} />

      <form className="a-card a-form" action={inviteMember}>
        <h2>{t('team.invite_title')}</h2>
        <p className="a-hint">{t('team.invite_hint')}</p>
        <div className="a-row">
          <div className="a-field">
            <label htmlFor="invite-email">{t('team.email')}</label>
            <input
              className="a-input"
              id="invite-email"
              name="email"
              type="email"
              dir="ltr"
              required
              autoComplete="off"
            />
          </div>
          <div className="a-field">
            <label htmlFor="invite-name">{t('team.name')}</label>
            <input className="a-input" id="invite-name" name="name" autoComplete="off" />
          </div>
          <div className="a-field">
            <label htmlFor="invite-role">{t('team.role')}</label>
            <select className="a-select" id="invite-role" name="role" defaultValue="support_agent">
              {grantable.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </div>
          <div className="a-actions">
            <button className="a-btn accent" type="submit">
              {t('team.invite_btn')}
            </button>
          </div>
        </div>
      </form>

      <div className="a-card">
        <h2>{t('team.members_title')}</h2>
        {members.length === 0 ? (
          <Empty>{t('team.empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('team.member')}</th>
                <th>{t('team.role')}</th>
                <th>{t('team.status')}</th>
                <th>{t('team.two_factor')}</th>
                <th>{t('team.last_seen')}</th>
                <th>{t('team.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const self = member.id === session.userId
                const manageable =
                  !self && isRole(member.role) && canAssignRole(session.role, member.role)
                const active = member.status === 'active'
                return (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.name ?? '—'}</strong>
                      <div className="a-hint" dir="ltr">
                        {member.email}
                      </div>
                      {self ? <Pill tone="info">{t('team.you')}</Pill> : null}
                    </td>
                    <td>
                      {manageable ? (
                        <form className="a-row" action={changeMemberRole}>
                          <input type="hidden" name="userId" value={member.id} />
                          <select
                            className="a-select"
                            name="role"
                            defaultValue={member.role}
                            aria-label={t('team.role')}
                          >
                            {[...grantable, 'customer' as const].map((role) => (
                              <option key={role} value={role}>
                                {role === 'customer' ? t('team.remove_option') : roleLabel(role)}
                              </option>
                            ))}
                          </select>
                          <button className="a-btn ghost small" type="submit">
                            {t('team.change_role_btn')}
                          </button>
                        </form>
                      ) : (
                        <Pill tone={member.role === 'admin' ? 'warn' : 'neutral'}>
                          {roleLabel(member.role)}
                        </Pill>
                      )}
                    </td>
                    <td>
                      <Pill tone={active ? 'good' : 'bad'}>
                        {active ? t('team.active') : t('team.inactive')}
                      </Pill>
                    </td>
                    <td>
                      <Pill tone={member.twoFactor ? 'good' : 'warn'}>
                        {member.twoFactor ? t('team.two_factor_on') : t('team.two_factor_pending')}
                      </Pill>
                    </td>
                    <td>
                      <When value={member.lastSeen} />
                    </td>
                    <td>
                      {manageable ? (
                        <div className="a-actions">
                          <form action={setMemberActive}>
                            <input type="hidden" name="userId" value={member.id} />
                            <input type="hidden" name="active" value={active ? 'false' : 'true'} />
                            <button
                              className={active ? 'a-btn danger small' : 'a-btn ghost small'}
                              type="submit"
                            >
                              {active ? t('team.deactivate') : t('team.reactivate')}
                            </button>
                          </form>
                          {active && !member.twoFactor ? (
                            <form action={resendInvite}>
                              <input type="hidden" name="userId" value={member.id} />
                              <button className="a-btn ghost small" type="submit">
                                {t('team.resend')}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ) : (
                        <span className="a-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        <p className="a-hint">{t('team.two_factor_note')}</p>
      </div>

      <div className="a-card">
        <h2>{t('team.roles_title')}</h2>
        <p className="a-hint">{t('team.roles_hint')}</p>
        <Table>
          <thead>
            <tr>
              <th>{t('team.role')}</th>
              <th>{t('team.role_for')}</th>
            </tr>
          </thead>
          <tbody>
            {ROLE_ORDER.filter((role) => (TEAM_ROLES as readonly string[]).includes(role)).map(
              (role) => (
                <tr key={role}>
                  <td>
                    <strong>{roleLabel(role)}</strong>
                  </td>
                  <td>{t(`team.about_${role}`)}</td>
                </tr>
              ),
            )}
          </tbody>
        </Table>
        <Advanced show title={t('common.advanced')}>
          <Table>
            <thead>
              <tr>
                <th>{t('team.role')}</th>
                <th>{t('team.capabilities')}</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ORDER.map((role) => (
                <tr key={role}>
                  <td className="a-mono">{role}</td>
                  <td className="a-mono" dir="ltr">
                    {capabilitiesOf(role).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Advanced>
      </div>
    </>
  )
}
