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

import { Breadcrumbs, LinkButton, Stars, Tag } from '@/components/bt'
import { Icon, Photo } from '@/components/ui'
import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { listMapPlaces } from '@/lib/content/queries'
import { loadEntitlements, redactPlace } from '@/lib/entitlements'
import { haversineKm } from '@/lib/geo'
import { checkSecureAccess } from '@/lib/security/guard'

import '@/styles/bt-map.css'

import { categoryIcon, geoToImagePx, IMAGE_SIZE } from '../../map/geo'
import { PlaceActions } from '../../map/place-actions'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ locale: string; slug: string }> }

const FALLBACK_IMG = '/brand/jungle.jpg'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  const lang: Locale = isLocale(locale) ? locale : defaultLocale
  const t = await getTranslations({ locale: lang })
  const place = (await listMapPlaces()).find((entry) => entry.slug === slug)
  // Only a free place is named here: metadata is not per-viewer.
  if (place === undefined || !place.isFree)
    return { title: t('mp_title'), robots: { index: false } }
  return {
    title: pick(place.name, lang, place.slug),
    description: pickOptional(place.description, lang) ?? undefined,
  }
}

export default async function PlacePage({ params }: PageProps) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const lang: Locale = isLocale(locale) ? locale : defaultLocale

  const access = await checkSecureAccess(`place:${slug}`)
  const [t, places, held] = await Promise.all([
    getTranslations(),
    listMapPlaces(),
    loadEntitlements(access.ok ? access.user.id : null),
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
  const description = pickOptional(place.description, lang)
  const detailed = pickOptional(place.detailedDescription, lang)

  // Nearby: other places THIS viewer can see, nearest first.
  const nearby = places
    .filter((entry) => entry.id !== place.id)
    .map((entry) => redactPlace(entry, held))
    .filter((entry) => !entry.locked)
    .map((entry) => ({ entry, km: haversineKm(place, entry) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 4)

  const px = geoToImagePx(place.lat, place.lon)
  const fx = (px.x / IMAGE_SIZE.w) * 100
  const fy = (px.y / IMAGE_SIZE.h) * 100

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
          <div className="pl-hero">
            <Photo src={place.heroImageUrl ?? FALLBACK_IMG} alt={name} priority />
          </div>
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

          <Link
            href={`/map?place=${encodeURIComponent(place.slug)}`}
            className="pl-mini"
            aria-label={t('map_view')}
          >
            <img
              src="/brand/bali-sat.jpg"
              alt=""
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '420%',
                maxWidth: 'none',
                transform: `translate(-${fx.toFixed(2)}%, -${fy.toFixed(2)}%)`,
              }}
            />
            <i aria-hidden="true" />
          </Link>

          {nearby.length > 0 && (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="h3">{t('mp3_nearby')}</h2>
              <ul className="pl-near">
                {nearby.map(({ entry, km }) =>
                  entry.locked ? null : (
                    <li key={entry.id}>
                      <Link href={`/places/${entry.slug}`}>
                        <span className="mp-res-img">
                          <Photo src={entry.heroImageUrl ?? FALLBACK_IMG} alt="" />
                        </span>
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
          {place.activitySlug !== null && (
            <LinkButton href={`/activities/${place.activitySlug}`} variant="ghost" icon="bolt">
              {t('mp3_bookable')}
            </LinkButton>
          )}
        </aside>
      </div>
    </div>
  )
}
