/**
 * أجهزتي.
 *
 * يعرض الأجهزة المرتبطة بالحساب وحد الأجهزة الذي تمنحه باقة المستخدم،
 * ويسمح بإزالة جهاز قديم لإفساح خانة لجهاز جديد.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'
import { getSession } from '@/lib/auth/session'
import { requireActiveUser } from '@/lib/security/require'
import { deviceLimitFor } from '@/lib/security/devices'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { removeMyDevice } from './actions'
import { currentDeviceId, listMyDevices, listMyLogins } from './queries'

type PageParams = Promise<{ locale: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_devices')
}

export default async function AccountDevicesPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireActiveUser('account:devices')
  const session = await getSession()
  const query = await searchParams

  const [items, limit, current, logins] = await Promise.all([
    listMyDevices(user.id),
    deviceLimitFor(user.id),
    session === null ? null : currentDeviceId(session.sessionId),
    listMyLogins(user.id),
  ])

  const result = query.r === 'removed' ? 'removed' : query.r === 'error' ? 'error' : null

  return (
    <section aria-labelledby="bt-acct-dev-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-dev-h">{t('acct_dev_t')}</h1>
      </div>

      <p className="muted" style={{ marginBlockEnd: 16, maxWidth: '60ch' }}>
        {t('acct_dev_intro', { used: items.length, limit })}
      </p>

      {result !== null && (
        <p role="status" className="muted" style={{ marginBlockEnd: 16 }}>
          {t(result === 'removed' ? 'acct_dev_removed' : 'acct_dev_remove_err')}
        </p>
      )}

      {items.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="shield" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '40ch' }}>{t('acct_dev_empty')}</p>
        </div>
      ) : (
        <div className="card bt-acct-tablewrap">
          <table className="bt-acct-table">
            <caption className="bt-acct-sr">{t('acct_dev_t')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('acct_dev_device')}</th>
                <th scope="col">{t('acct_dev_first')}</th>
                <th scope="col">{t('acct_dev_last')}</th>
                <th scope="col">
                  <span className="bt-acct-sr">{t('acct_dev_remove')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <bdi>
                      {item.browser ?? '—'} · {item.os ?? '—'}
                    </bdi>
                    {item.id === current && (
                      <div className="muted" style={{ fontSize: 13 }}>
                        {t('acct_dev_this')}
                      </div>
                    )}
                  </td>
                  <td>{format.dateTime(item.firstSeenAt, { dateStyle: 'medium' })}</td>
                  <td>
                    {format.dateTime(item.lastSeenAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td>
                    {item.id !== current && (
                      <form action={removeMyDevice}>
                        <input type="hidden" name="deviceId" value={item.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {t('acct_dev_remove')}
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logins.length > 0 && (
        <div className="card bt-acct-tablewrap" style={{ marginBlockStart: 24 }}>
          <table className="bt-acct-table">
            <caption style={{ textAlign: 'start', fontWeight: 700, padding: '12px 14px' }}>
              {t('acct_logins_t')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t('acct_logins_when')}</th>
                <th scope="col">{t('acct_logins_result')}</th>
                <th scope="col">{t('acct_dev_device')}</th>
                <th scope="col">IP</th>
              </tr>
            </thead>
            <tbody>
              {logins.map((row) => (
                <tr key={row.id}>
                  <td>{format.dateTime(row.at, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{t(row.action === 'login' ? 'acct_logins_ok' : 'acct_logins_failed')}</td>
                  <td>
                    <bdi>{row.browser ? `${row.browser} · ${row.os ?? '—'}` : '—'}</bdi>
                  </td>
                  <td>
                    <bdi>{row.ip ?? '—'}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
