/**
 * Place detail — minimal v3 page (prototype place.html / screen 04-place-detail).
 * Phase 7 polishes it; this exists so the map card's "Details" has a real page.
 *
 * Same paywall as the map: the place goes through `redactPlace`. A locked
 * place renders a locked state with no name, image, description or
 * coordinates — not even in <title> (metadata only names free places).
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { readSetting } from '@/app/(admin)/_lib/settings'
import { Breadcrumbs, LinkButton, Stars, Tag } from '@/components/bt'
import { ActivityCompact } from '@/components/cards'
import { Icon, Photo } from '@/components/ui'
import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { listActivities, listMapPlaces } from '@/lib/content/queries'
import { loadEntitlements, redactPlace } from '@/lib/entitlements'
import { haversineKm } from '@/lib/geo'
import { checkSecureAccess } from '@/lib/security/guard'

import '@/styles/bt-map.css'

import { pageMetadata } from '../../_meta'

import { categoryIcon } from '../../map/geo'
import { mapViewSettings } from '../../map/map-style'
import { PlaceActions } from '../../map/place-actions'
import { PlaceMiniMap } from '../../map/place-mini-map'
import { PlaceThumb } from '../../map/place-thumb'
import { relatedActivities } from './related'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  const lang: Locale = isLocale(locale) ? locale : defaultLocale
  const t = await getTranslations({ locale: lang })
  const place = (await listMapPlaces()).find((entry) => entry.slug === slug)
  // Only a free place is named here: metadata is not per-viewer.
  if (place === undefined || !place.isFree)
    return { title: t('mp3_pl_locked_t'), robots: { index: false } }
  return pageMetadata({
    locale: lang,
    path: `/places/${place.slug}`,
    title: pick(place.name, lang, place.slug),
    description: placeDescription(place, lang, t),
  })
}

type Translate = Awaited<ReturnType<typeof getTranslations>>

/**
 * The place's own description, or one line built from what is known about it
 * (name, category, area) — never an empty page or meta description (list H10).
 */
function placeDescription(
  place: {
    name: Record<string, string>
    slug: string
    description: Record<string, string> | null
    categoryLabel: Record<string, string> | null
    category: Record<string, string> | null
    regionLabel: Record<string, string> | null
    parentRegionLabel: Record<string, string> | null
  },
  lang: Locale,
  t: Translate,
): string {
  const own = pickOptional(place.description, lang)
  if (own) return own
  const category = pickOptional(place.categoryLabel, lang) ?? pickOptional(place.category, lang)
  const region =
    pickOptional(place.regionLabel, lang) ?? pickOptional(place.parentRegionLabel, lang)
  return t('pl_auto_desc', {
    name: pick(place.name, lang, place.slug),
    category: category ?? t('pl_auto_place'),
    region: region ?? t('pl_auto_bali'),
  })
}

export default async function PlacePage({ params }: PageProps) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const lang: Locale = isLocale(locale) ? locale : defaultLocale

  const access = await checkSecureAccess(`place:${slug}`)
  const [t, places, held, mapSettings, activities] = await Promise.all([
    getTranslations(),
    listMapPlaces(),
    loadEntitlements(access.ok ? access.user.id : null),
    readSetting('map'),
    listActivities({ locale: lang, limit: 200 }),
  ])
  const full = places.find((entry) => entry.slug === slug)
  if (full === undefined) notFound()

  const place = redactPlace(full, held)

  if (place.locked) {
    return (
      <div className="wrap pl-wrap" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <Breadcrumbs
          trail={[
            { label: t('bt_nav_home'), href: '/' },
            { label: t('bt_nav_map'), href: '/map' },
            { label: t('mp3_pl_locked_t') },
          ]}
        />
        <div className="mp-lockcard" style={{ maxWidth: 560 }}>
          <Icon name="lock" size={26} />
          <b>{t('mp3_pl_locked_t')}</b>
          <span>{t('mp3_pl_locked_b')}</span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <LinkButton href="/plans">{t('mp3_unlock_full')}</LinkButton>
            <LinkButton href="/map" variant="glass">
              {t('map_view')}
            </LinkButton>
          </div>
        </div>
      </div>
    )
  }

  const name = pick(place.name, lang, place.slug)
  const region =
    pickOptional(place.regionLabel, lang) ?? pickOptional(place.parentRegionLabel, lang) ?? ''
  const category = pickOptional(place.categoryLabel, lang) ?? pickOptional(place.category, lang)
  // Client (Oct 2026): tourist sites (مزارات) are information only — no
  // booking link and no "book an activity" strip on their page.
  const infoOnly = place.categoryKey === 'sights'
  const description = placeDescription(place, lang, t)
  const related = relatedActivities(place, activities)
  const detailed = pickOptional(place.detailedDescription, lang)

  // Nearby: other places THIS viewer can see, nearest first.
  const nearby = places
    .filter((entry) => entry.id !== place.id)
    .map((entry) => redactPlace(entry, held))
    .filter((entry) => !entry.locked)
    .map((entry) => ({ entry, km: haversineKm(place, entry) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 4)

  // The place's own photos only; a neutral placeholder when it has none.
  const photos = [place.heroImageUrl, ...place.gallery].filter(
    (src, index, all): src is string => !!src && all.indexOf(src) === index,
  )

  return (
    <div className="wrap">
      <Breadcrumbs
        trail={[
          { label: t('bt_nav_home'), href: '/' },
          { label: t('bt_nav_map'), href: '/map' },
          ...(region ? [{ label: region }] : []),
          { label: name },
        ]}
      />
      <div className="pl-wrap">
        <div className="pl-main">
          <PlaceThumb
            className="pl-hero"
            src={photos[0]}
            alt={photos[0] ? name : t('mp5_no_photo')}
            icon={categoryIcon(place.categoryKey)}
            size={56}
            priority
          />
          {photos.length > 1 && (
            <ul className="pl-gallery" aria-label={t('mp5_gallery')}>
              {photos.slice(1, 9).map((src) => (
                <li key={src}>
                  <Photo src={src} alt="" />
                </li>
              ))}
            </ul>
          )}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {category && (
              <Tag variant="palm" icon={categoryIcon(place.categoryKey)}>
                {category}
              </Tag>
            )}
            {place.tagList.slice(0, 3).map((tag) => (
              <Tag key={tag.key}>{pick(tag.label, lang, tag.key)}</Tag>
            ))}
          </div>
          <h1>{name}</h1>
          <div className="pl-meta">
            {region && (
              <span>
                <Icon name="pin" size={15} /> {region}
              </span>
            )}
            <Stars value={place.rating} />
            {place.openingHours && (
              <span>
                <Icon name="clock" size={15} /> {t('map_hours')}{' '}
                <span dir="ltr">{place.openingHours}</span>
              </span>
            )}
          </div>
          {description && <p className="pl-desc">{description}</p>}
          {detailed && <p className="muted">{detailed}</p>}

          <PlaceMiniMap
            lat={place.lat}
            lon={place.lon}
            slug={place.slug}
            label={t('mp5_mini_map')}
            settings={mapViewSettings(mapSettings)}
          />

          {related.length > 0 && !infoOnly && (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="h3">{t('pl_related')}</h2>
              <div className="pl-related">
                {related.map((activity) => (
                  <ActivityCompact key={activity.id} activity={activity} fav={false} />
                ))}
              </div>
            </section>
          )}

          {nearby.length > 0 && (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="h3">{t('mp3_nearby')}</h2>
              <ul className="pl-near">
                {nearby.map(({ entry, km }) =>
                  entry.locked ? null : (
                    <li key={entry.id}>
                      <Link href={`/places/${entry.slug}`}>
                        <PlaceThumb
                          className="mp-res-img"
                          src={entry.heroImageUrl}
                          icon={categoryIcon(entry.categoryKey)}
                        />
                        <span className="mp-res-meta">
                          <span className="mp-res-name">{pick(entry.name, lang, entry.slug)}</span>
                          <span className="mp-res-sub">
                            <span>
                              {pickOptional(entry.categoryLabel, lang) ??
                                pickOptional(entry.category, lang) ??
                                ''}
                            </span>
                            <span dir="ltr">· {km.toFixed(1)} km</span>
                          </span>
                        </span>
                        <Icon name="chevronr" size={18} className="flip" />
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </section>
          )}
        </div>

        <aside className="pl-aside">
          <LinkButton
            href={`/map?place=${encodeURIComponent(place.slug)}`}
            variant="forest"
            icon="map"
          >
            {t('map_view')}
          </LinkButton>
          <PlaceActions
            placeId={place.id}
            canFavorite={place.canFavorite}
            canAddToTrip={place.canAddToTrip}
            layout="stack"
          />
          <LinkButton
            href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`}
            target="_blank"
            variant="ghost"
            icon="route"
          >
            {t('mp3_directions')}
          </LinkButton>
          {place.activitySlug !== null && !infoOnly && (
            <LinkButton href={`/activities/${place.activitySlug}`} variant="ghost" icon="bolt">
              {t('mp3_bookable')}
            </LinkButton>
          )}
        </aside>
      </div>
    </div>
  )
}
