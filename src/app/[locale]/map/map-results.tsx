'use client'

/**
 * نتائج البحث كبطاقات (الوثيقة 8.4): اسم المكان، الصورة، التصنيف، المنطقة،
 * VIP أو مجاني، المسافة التقريبية (إن سُمح بالموقع)، وأزرار: عرض على الخريطة،
 * حفظ، إضافة إلى رحلتي.
 *
 * تعمل على الدبابيس المرئية لهذا الزائر فقط — المقفلة لا تصل للمتصفح أصلاً.
 */

import { useState, useTransition } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Button, LinkButton, Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import { haversineKm, type LatLon } from '@/lib/geo'

import { addPlaceToTrip, saveFavoritePlace, type PlaceActionResult } from '../_actions/places'
import type { MapPin } from './projection'

const PAGE = 12

const MESSAGE: Record<string, string> = {
  saved: 'map_saved',
  added: 'map_trip_added',
  already: 'map_trip_already',
  signed_out: 'map_need_signin',
  upgrade: 'map_need_plan',
  not_allowed: 'map_not_allowed',
  not_found: 'map_not_allowed',
}

export function MapResults({
  pins,
  near,
  onShow,
}: {
  pins: readonly MapPin[]
  near: LatLon | null
  onShow: (pin: MapPin) => void
}) {
  const t = useTranslations()
  const [shown, setShown] = useState(PAGE)
  if (pins.length === 0) {
    return (
      <p className="muted" style={{ marginBlock: 16 }}>
        {t('map_no_results')}
      </p>
    )
  }
  return (
    <section aria-label={t('map_results_t')} style={{ marginBlockStart: 18 }}>
      <h2 style={{ fontSize: 18, color: 'inherit' }}>{t('map_results_t')}</h2>
      <div className="grid bt-grid-3" style={{ marginBlockStart: 12 }}>
        {pins.slice(0, shown).map((pin) => (
          <ResultCard key={pin.place.id} pin={pin} near={near} onShow={onShow} />
        ))}
      </div>
      {shown < pins.length && (
        <div className="center" style={{ marginBlockStart: 14 }}>
          <Button variant="ghost" size="sm" onClick={() => setShown((count) => count + PAGE)}>
            {t('map_more_results')}
          </Button>
        </div>
      )}
    </section>
  )
}

function ResultCard({
  pin,
  near,
  onShow,
}: {
  pin: MapPin
  near: LatLon | null
  onShow: (pin: MapPin) => void
}) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<PlaceActionResult | null>(null)
  const { place } = pin

  const name = pick(place.name, locale, place.slug)
  const category = pickOptional(place.categoryLabel, locale) ?? pickOptional(place.category, locale)
  const area = pickOptional(place.regionLabel, locale)
  const distance = near === null ? null : haversineKm(near, place)
  const key = result === null ? null : MESSAGE[result.ok ? result.state : result.reason]

  const run = (action: (id: string) => Promise<PlaceActionResult>) =>
    startTransition(async () => setResult(await action(place.id)))

  return (
    <article className="card" style={{ overflow: 'hidden', color: 'var(--ink, #1c2a1e)' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 10' }}>
        <Photo
          src={place.heroImageUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ padding: 14 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {place.isFree ? (
            <Tag variant="palm">{t('mp_free')}</Tag>
          ) : place.requiredEntitlement === 'vip' ? (
            <Tag variant="orange">VIP</Tag>
          ) : null}
          {place.isHiddenGem && <Tag variant="orange">{t('map_f_gems')}</Tag>}
          {category !== null && <Tag variant="forest">{category}</Tag>}
        </div>
        <h3 style={{ fontSize: 17, margin: '8px 0 2px' }}>{name}</h3>
        <div className="muted" style={{ fontSize: 13 }}>
          {area !== null && (
            <>
              <Icon name="pin" size={12} /> {area}
            </>
          )}
          {distance !== null && (
            <>
              {area !== null && ' · '}
              {t('map_distance_km', {
                km: format.number(distance, { maximumFractionDigits: distance < 10 ? 1 : 0 }),
              })}
            </>
          )}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={() => onShow(pin)}>
            <Icon name="pin" size={14} /> {t('map_view')}
          </Button>
          {place.canFavorite && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(saveFavoritePlace)}
            >
              <Icon name="heart" size={14} /> {t('map_save')}
            </Button>
          )}
          {place.canAddToTrip && (
            <Button
              variant="forest"
              size="sm"
              disabled={pending}
              onClick={() => run(addPlaceToTrip)}
            >
              <Icon name="route" size={14} color="#fff" /> {t('map_add_trip')}
            </Button>
          )}
        </div>
        {key !== null && key !== undefined && (
          <p role="status" className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            {t(key)}{' '}
            {result?.ok === false && result.reason === 'signed_out' && (
              <LinkButton href="/account" variant="ghost" size="sm">
                {t('map_signin')}
              </LinkButton>
            )}
            {result?.ok === false && result.reason === 'upgrade' && (
              <LinkButton href="/plans" variant="ghost" size="sm">
                {t('mp_unlock')}
              </LinkButton>
            )}
          </p>
        )}
      </div>
    </article>
  )
}
