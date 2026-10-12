import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'
import { requireUser } from '@/lib/auth/session'
import { pick } from '@/lib/content/localize'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { submitReview } from './actions'
import { reviewableActivities } from './queries'

type PageParams = Promise<{ locale: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_reviews')
}

export default async function ReviewsPage({
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
  const user = await requireUser()
  const query = await searchParams
  const items = await reviewableActivities(user.id)

  return (
    <section aria-labelledby="bt-acct-rev-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-rev-h">{t('acct_rev_t')}</h1>
      </div>
      {query.r === 'thanks' && (
        <p role="status" className="muted">
          {t('acct_rev_thanks')}
        </p>
      )}
      {query.r === 'error' && (
        <p role="alert" className="muted">
          {t('acct_rev_error')}
        </p>
      )}
      {items.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="star" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '40ch' }}>{t('acct_rev_empty')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {items.map((item) => (
            <form
              key={`${item.orderId}-${item.activityId}`}
              action={submitReview}
              className="card"
              style={{ padding: 16 }}
            >
              <input type="hidden" name="orderId" value={item.orderId} />
              <input type="hidden" name="activityId" value={item.activityId} />
              <strong>{pick(item.activityName, locale, item.activitySlug)}</strong>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {item.orderNumber}
              </div>
              <fieldset style={{ border: 0, padding: 0, margin: '10px 0' }}>
                <legend className="muted" style={{ fontSize: 13 }}>
                  {t('acct_rev_stars')}
                </legend>
                <div className="row" style={{ gap: 12 }}>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <label key={value} className="row" style={{ gap: 4, alignItems: 'center' }}>
                      <input
                        type="radio"
                        name="stars"
                        value={value}
                        required
                        defaultChecked={value === 5}
                      />
                      {'★'.repeat(value)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <textarea
                name="body"
                className="input"
                rows={3}
                maxLength={2000}
                placeholder={t('acct_rev_placeholder')}
                aria-label={t('acct_rev_placeholder')}
                style={{ width: '100%' }}
              />
              <Button type="submit" variant="orange" size="sm" style={{ marginTop: 10 }}>
                {t('acct_rev_submit')}
              </Button>
            </form>
          ))}
        </div>
      )}
    </section>
  )
}
