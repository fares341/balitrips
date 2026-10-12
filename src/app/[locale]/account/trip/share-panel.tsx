/**
 * "شارك رحلتي" — owner side.
 *
 * The link opens a read-only list of the planned places. Visitors see place
 * details only for places THEY are entitled to; the owner's plan never
 * unlocks anything for them. Rotating replaces the token, so an old link
 * stops working the moment a new one is made.
 */

import { getTranslations } from 'next-intl/server'

import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { activeShareToken } from '@/lib/content/extra-queries'

import { localeUrl } from '../../_seo-hreflang'
import { CopyLinkButton } from './copy-link-button'
import { shareTrip, stopSharingTrip } from './share-actions'

export async function TripSharePanel({ userId, locale }: { userId: string; locale: Locale }) {
  const [t, token] = await Promise.all([getTranslations({ locale }), activeShareToken(userId)])
  const href = token === null ? null : localeUrl(`/trip/${token}`, locale)

  return (
    <div className="card" style={{ padding: 18, marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, margin: 0 }}>
        <Icon name="globe" size={17} /> {t('trip_share_t')}
      </h2>
      <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 14px' }}>
        {href === null ? t('trip_share_sub') : t('trip_share_on')}
      </p>

      {href === null ? (
        <form action={shareTrip}>
          <Button type="submit" variant="orange" size="sm">
            {t('trip_share_create')}
          </Button>
        </form>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            className="input"
            readOnly
            value={href}
            aria-label={t('trip_share_link')}
            dir="ltr"
            style={{ minHeight: 40, fontSize: 13 }}
          />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <CopyLinkButton
              href={href}
              label={t('trip_share_copy')}
              copiedLabel={t('trip_share_copied')}
            />
            <form action={shareTrip}>
              <Button type="submit" variant="ghost" size="sm">
                {t('trip_share_rotate')}
              </Button>
            </form>
            <form action={stopSharingTrip}>
              <Button type="submit" variant="ghost" size="sm">
                <Icon name="cross" size={14} /> {t('trip_share_stop')}
              </Button>
            </form>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            {t('trip_share_privacy')}
          </p>
        </div>
      )}
    </div>
  )
}
