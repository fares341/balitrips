/**
 * "Places in this itinerary" (spec 4.2 / 21.3).
 *
 * `itineraries.linked_place_ids` is set in the admin; this is where it shows.
 * Places come back from `linkedPlacesForItinerary` already redacted for the
 * viewer: a place they can see has its name, image and area and links to the
 * map; a locked one is a lock and a link to the plans — no name, slug, image
 * or coordinates, because the teaser type does not carry them.
 */

import { getTranslations } from 'next-intl/server'

import { LinkButton } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { linkedPlacesForItinerary } from '@/lib/content/extra-queries'
import { pick } from '@/lib/content/localize'
import { emptyEntitlements, loadEntitlements } from '@/lib/entitlements'
import { checkSecureAccess } from '@/lib/security/guard'

const PLANS_HREF = '/plans'

export async function LinkedPlaces({
  itineraryId,
  locale,
}: {
  itineraryId: string
  locale: Locale
}) {
  const access = await checkSecureAccess('itinerary:places')
  const held = access.ok ? await loadEntitlements(access.user.id) : emptyEntitlements()
  const [t, places] = await Promise.all([
    getTranslations({ locale }),
    linkedPlacesForItinerary(itineraryId, held),
  ])
  if (places.length === 0) return null

  return (
    <div className="bt-detail-block">
      <h2 className="bt-detail-h">{t('itin_places_t')}</h2>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        }}
      >
        {places.map((place, index) =>
          place.locked ? (
            <article
              key={`locked-${index}`}
              className="card card-pad"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}
            >
              <span className="bt-paywall-ic">
                <Icon name="lock" size={18} color="#fff" />
              </span>
              <h3 style={{ fontSize: 15, textAlign: 'center', margin: 0 }}>
                {t('trip_locked_place')}
                {place.requiredEntitlement === 'vip' && (
                  <span className="tag tag-orange" style={{ marginInlineStart: 6 }}>
                    VIP
                  </span>
                )}
              </h3>
              <LinkButton href={PLANS_HREF} variant="orange" size="sm" block>
                {t('mp_unlock')}
              </LinkButton>
            </article>
          ) : (
            <article
              key={place.id}
              className="card bt-cardhover"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <Link href={place.href} className="bt-card-media" tabIndex={-1} aria-hidden="true">
                <Photo src={place.heroImageUrl} alt="" style={{ height: 130 }} />
                {place.isFree && <span className="bt-card-badge">{t('mp_free')}</span>}
              </Link>
              <div className="card-pad" style={{ display: 'grid', gap: 4 }}>
                <h3 style={{ fontSize: 15.5, margin: 0, color: 'var(--forest)' }}>
                  <Link href={place.href}>{pick(place.name, locale, place.slug)}</Link>
                </h3>
                {place.regionLabel !== null && (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    <Icon name="pin" size={12} color="var(--muted)" />{' '}
                    {pick(place.regionLabel, locale)}
                  </span>
                )}
              </div>
            </article>
          ),
        )}
      </div>
    </div>
  )
}
