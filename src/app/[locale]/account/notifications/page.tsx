/**
 * الإشعارات داخل الموقع. النص يُترجم هنا بلغة القارئ من `type` و`params`.
 */

import type { Metadata } from 'next'
import { and, desc, eq } from 'drizzle-orm'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { Button, LinkButton } from '@/components/shared'
import { Icon } from '@/components/ui'
import { db } from '@/db'
import { notifications, users } from '@/db/schema'
import { requireActiveUser } from '@/lib/security/require'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { markAllNotificationsRead, setMarketingConsent, setWhatsappOptIn } from './actions'

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_notifs')
}

export default async function NotificationsPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireActiveUser('account:notifications')

  const [prefs] = await db
    .select({
      whatsappOptIn: users.whatsappOptIn,
      phone: users.phone,
      marketingConsent: users.marketingConsent,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), eq(notifications.audience, 'user')))
    .orderBy(desc(notifications.createdAt))
    .limit(100)

  // مفاتيح ديناميكية: نوع غير معروف (أُزيل لاحقاً) يقع على النص العام.
  const text = (key: string, fallback: string, values: Record<string, string | number>) =>
    t.has(key as never) ? t(key as never, values as never) : t(fallback as never)
  const unread = rows.some((row) => row.readAt === null)

  return (
    <section aria-labelledby="bt-acct-notif-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-notif-h">{t('acct_notifs_t')}</h1>
        {unread && (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="ghost" size="sm">
              {t('acct_notifs_mark')}
            </Button>
          </form>
        )}
      </div>

      <form action={setWhatsappOptIn} className="card" style={{ padding: 14, marginBottom: 16 }}>
        <label className="row" style={{ gap: 10, alignItems: 'center', fontWeight: 700 }}>
          <input
            type="checkbox"
            name="whatsappOptIn"
            defaultChecked={prefs?.whatsappOptIn ?? false}
          />
          <Icon name="whatsapp" size={18} /> {t('acct_wa_optin')}
        </label>
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 10px' }}>
          {t('acct_wa_hint')}
          {prefs?.phone ? ` (${prefs.phone})` : ''}
        </p>
        <Button type="submit" variant="ghost" size="sm">
          {t('acct_save')}
        </Button>
      </form>

      <form action={setMarketingConsent} className="card" style={{ padding: 14, marginBottom: 16 }}>
        <label className="row" style={{ gap: 10, alignItems: 'center', fontWeight: 700 }}>
          <input
            type="checkbox"
            name="marketingConsent"
            defaultChecked={prefs?.marketingConsent ?? false}
          />
          <Icon name="mail" size={18} /> {t('acct_marketing_optin')}
        </label>
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 10px' }}>
          {t('acct_marketing_hint')}
        </p>
        <Button type="submit" variant="ghost" size="sm">
          {t('acct_save')}
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="mail" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '40ch' }}>{t('acct_notifs_empty')}</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          {rows.map((row) => {
            const values = row.params ?? {}
            return (
              <li
                key={row.id}
                className="card"
                style={{
                  padding: 14,
                  borderInlineStart: row.readAt === null ? '4px solid var(--orange)' : undefined,
                }}
              >
                <div
                  className="row"
                  style={{ justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}
                >
                  <strong>{text(`notif_${row.type}_t`, 'notif_generic_t', values)}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {row.readAt === null && (
                      <span style={{ color: 'var(--orange-deep)', fontWeight: 700 }}>
                        {t('acct_notifs_new')} ·{' '}
                      </span>
                    )}
                    {format.dateTime(row.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
                  {text(`notif_${row.type}_b`, 'notif_generic_b', values)}
                </p>
                {row.href && (
                  <LinkButton href={row.href} variant="ghost" size="sm" style={{ marginTop: 8 }}>
                    {t('notif_open')}
                  </LinkButton>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
