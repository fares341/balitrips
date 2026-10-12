/**
 * Purchased schedules.
 *
 * The handoff listed `ACCT_SCHED` — two hard-coded plans with a price tag —
 * under a "Download PDF" button that had no handler. Every card here is an
 * `order_items` row of kind `itinerary` from an order that was paid for, and
 * the download link goes through `./[itemId]/download`, which re-checks
 * ownership on every request.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { readSetting } from '@/app/(admin)/_lib/settings'
import { FormNotice } from '@/components/auth'
import { LinkButton } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { getPathname } from '@/i18n/routing'
import { requireActiveUser } from '@/lib/security/require'
import { pick } from '@/lib/content/localize'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { listSchedules } from '../_lib/queries'
import { CustomPlans } from './custom-plans'
import { loadPermissions } from '@/lib/entitlements/plans'

const ITINERARIES_HREF = '/itineraries'

type PageParams = Promise<{ locale: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_sched')
}

export default async function AccountSchedulesPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireActiveUser('account:schedules')
  const [policy, permissions] = await Promise.all([
    readSetting('security'),
    loadPermissions(user.id),
  ])
  // السياسة العامة + صلاحية التحميل في باقات المستخدم (الوثيقة 13.2).
  const downloadsAllowed = policy.pdfDownloads === 'allow' && permissions.canDownloadPdf

  const [items, query] = await Promise.all([listSchedules(user.id, locale), searchParams])

  return (
    <section aria-labelledby="bt-acct-sched-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-sched-h">
          {t('acct_sched_t')}{' '}
          {items.length > 0 && (
            <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
              · {format.number(items.length)}
            </span>
          )}
        </h1>
      </div>

      {/* Set by the download route when the buyer is entitled but the PDF for
          their pinned version has not been generated yet. */}
      {(query.doc === 'view-only' || query.doc === 'limit') && (
        <div style={{ marginBottom: 20 }}>
          <FormNotice>
            {t(query.doc === 'limit' ? 'acct_sched_dl_limit' : 'acct_sched_view_only')}
          </FormNotice>
        </div>
      )}

      {query.doc === 'pending' && (
        <div style={{ marginBottom: 20 }}>
          <FormNotice>{t('acct_sched_pending')}</FormNotice>
        </div>
      )}

      {items.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="cal" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '40ch' }}>{t('acct_sched_empty')}</p>
          <LinkButton href={ITINERARIES_HREF} variant="orange" size="sm">
            {t('navr_itin')}
          </LinkButton>
        </div>
      ) : (
        <div className="bt-acct-cards bt-acct-cards-wide">
          {items.map((item) => {
            const title = item.name === null ? t('acct_nav_sched') : pick(item.name, locale)
            const alt = item.imageAlt === null ? '' : pick(item.imageAlt, locale)
            // Route handlers are not client-navigable, so the locale prefix is
            // resolved here and rendered as a plain anchor rather than through
            // the next-intl `Link`.
            const downloadHref = getPathname({
              href: `/account/schedules/${item.orderItemId}/download`,
              locale,
            })

            return (
              <article key={item.orderItemId} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ height: 140, position: 'relative' }}>
                  <Photo src={item.imageUrl} alt={alt} style={{ height: '100%' }} />
                  {item.days !== null && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 10,
                        insetInlineStart: 10,
                        background: 'rgba(27,63,34,0.85)',
                        color: '#fff',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {format.number(item.days)} {t('acct_sched_days')}
                    </span>
                  )}
                </div>

                <div style={{ padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    {item.orderNumber} ·{' '}
                    {format.dateTime(item.purchasedAt, { dateStyle: 'medium' })}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {item.documentReady ? (
                      <>
                        <LinkButton
                          href={`/account/schedules/${item.orderItemId}/view`}
                          variant={downloadsAllowed ? 'ghost' : 'orange'}
                          size="sm"
                          style={{ flex: 1, minHeight: 44 }}
                        >
                          {t('acct_sched_view')}
                        </LinkButton>
                        {downloadsAllowed && (
                          <a
                            className="btn btn-orange"
                            href={downloadHref}
                            // A route handler, not a page: the browser fetches it.
                            download
                            style={{ flex: 1, minHeight: 44, fontSize: 13.5, paddingInline: 16 }}
                          >
                            <Icon name="pdf" size={15} color="#fff" />
                            {t('acct_sched_dl')}
                          </a>
                        )}
                      </>
                    ) : (
                      <p
                        className="muted"
                        style={{ flex: 1, fontSize: 12.5, margin: 0, alignSelf: 'center' }}
                      >
                        {t('acct_sched_pending')}
                      </p>
                    )}

                    {item.slug !== null && (
                      <LinkButton
                        href={`${ITINERARIES_HREF}/${item.slug}`}
                        variant="ghost"
                        size="sm"
                        style={{ fontSize: 13.5 }}
                      >
                        {t('acct_sched_view')}
                      </LinkButton>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <CustomPlans userId={user.id} locale={locale} downloadsAllowed={downloadsAllowed} />
    </section>
  )
}
