/**
 * Subscriptions & services.
 *
 * The handoff hard-coded two rows: "Interactive Map access · Active until 22
 * Jul 2026" and an expired VIP tier, identical for every visitor and backed by
 * nothing. Both are now `entitlements` rows — the same table `loadEntitlements`
 * consults on every request that could expose a locked place, so what this page
 * says and what the map does cannot disagree.
 *
 * Revoked and expired grants are listed rather than hidden. A refund is an
 * audit record, and someone whose map stopped working deserves to see why.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton, Tag } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { IconName } from '@/components/ui/icon'
import { requireUser } from '@/lib/auth/session'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { listSubscriptions, type SubscriptionStatus } from '../_lib/queries'

const PLANS_HREF = '/plans'

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_subs')
}

/** Presentation per entitlement kind, with a safe default for anything else. */
function presentation(kind: string): { titleKey: string; icon: IconName } {
  if (kind === 'map_access') return { titleKey: 'acct_subs_map', icon: 'pin' }
  if (kind === 'vip') return { titleKey: 'sub_vip_t', icon: 'gem' }
  return { titleKey: 'acct_subs_t', icon: 'star' }
}

const STATUS_KEY: Record<SubscriptionStatus, string> = {
  active: 'acct_subs_active',
  expired: 'acct_subs_expired',
  revoked: 'acct_subs_revoked',
}

export default async function AccountSubscriptionsPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireUser()

  const items = await listSubscriptions(user.id)

  return (
    <section aria-labelledby="bt-acct-subs-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-subs-h">{t('acct_subs_t')}</h1>
        <LinkButton href={PLANS_HREF} variant="forest" size="sm">
          <Icon name="star" size={15} color="var(--ivory)" />
          {t('acct_subs_browse')}
        </LinkButton>
      </div>

      {items.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="star" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '40ch' }}>{t('acct_subs_empty')}</p>
          <LinkButton href={PLANS_HREF} variant="orange" size="sm">
            {t('mp_unlock')}
          </LinkButton>
        </div>
      ) : (
        <div className="bt-acct-rows">
          {items.map((item) => {
            const view = presentation(item.kind)
            const active = item.status === 'active'

            /*
             * The badge already names the state, so this line carries the
             * date behind it. A null expiry on a live grant is lifetime —
             * "yours for the whole trip" — which is a fact worth stating
             * rather than an absence to leave blank.
             */
            const detail =
              item.expiresAt !== null
                ? `${t('acct_subs_until')} ${format.dateTime(item.expiresAt, { dateStyle: 'medium' })}`
                : active
                  ? t('acct_subs_lifetime')
                  : format.dateTime(item.startsAt, { dateStyle: 'medium' })

            return (
              <article
                key={item.id}
                className="card bt-acct-row"
                style={active ? undefined : { opacity: 0.75 }}
              >
                <span
                  className="bt-acct-rowicon"
                  style={{ background: active ? 'rgba(255,144,0,0.14)' : 'var(--ivory-2)' }}
                  aria-hidden="true"
                >
                  <Icon
                    name={view.icon}
                    size={22}
                    color={active ? 'var(--orange-deep)' : 'var(--muted)'}
                  />
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{t(view.titleKey)}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {detail}
                    {item.orderNumber !== null && ` · ${item.orderNumber}`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Tag variant={active ? 'palm' : 'default'}>{t(STATUS_KEY[item.status])}</Tag>
                  {!active && (
                    <LinkButton href={PLANS_HREF} variant="orange" size="sm">
                      {t('acct_subs_renew')}
                    </LinkButton>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
