'use client'

/**
 * فلاتر الخريطة — مشتركة بين الخريطة المسطحة (map-explorer) والثلاثية (map-surface).
 *
 * كانت كل واجهة تحمل نسختها من البحث والفلترة، فانحرفتا: الثلاثية بقيت تقارن
 * بالنصوص الإنجليزية القديمة للوسوم بعد انتقالها لمفاتيح `tags.key`. مصدر
 * واحد هنا يمنع ذلك.
 *
 * يعمل على الدبابيس المرسلة لهذا الزائر فقط — الأماكن المقفلة لا تصل للمتصفح
 * أصلاً، فلا شيء هنا يحتاج أن يتذكر إخفاءها.
 *
 *  - بحث نصي + اقتراحات فورية من `/api/places/suggest` (الوثيقة 2.3)
 *  - وسوم، منطقة، تصنيف، Hidden Gems — مجتمعة (2.2)
 *  - "قريب مني" بنصف قطر، وترتيب بالأقرب (2.1)؛ خارج بالي → اختيار المنطقة
 */

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import { haversineKm, isInBali, type LatLon } from '@/lib/geo'
import type { Suggestion } from '@/lib/search/places'

import { MAP_FILTERS, type MapPin } from './projection'

const DEFAULT_RADIUS_KM = 5
const RADIUS_CHOICES = [2, 5, 10, 25] as const

export type GeoStatus = 'idle' | 'locating' | 'denied' | 'outside'

export function useMapFilters(pins: readonly MapPin[], onPickPlace: (pin: MapPin) => void) {
  const locale = useLocale() as Locale
  const [query, setQuery] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [region, setRegion] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [gemsOnly, setGemsOnly] = useState(false)
  const [near, setNear] = useState<LatLon | null>(null)
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM)
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle')
  // The answer and the query it answers: a late response for an older query is
  // ignored by comparing the two, rather than cleared from inside the effect.
  const [fetched, setFetched] = useState<{ q: string; items: Suggestion[] }>({ q: '', items: [] })
  const trimmed = query.trim()
  const suggestions = trimmed.length >= 2 && fetched.q === trimmed ? fetched.items : []

  const facets = useMemo(() => {
    const regions = new Map<string, string>()
    const categories = new Map<string, string>()
    for (const pin of pins) {
      const { regionKey, regionLabel, categoryKey, categoryLabel } = pin.place
      if (regionKey !== null) regions.set(regionKey, pick(regionLabel, locale, regionKey))
      if (categoryKey !== null)
        categories.set(categoryKey, pick(categoryLabel, locale, categoryKey))
    }
    return { regions: [...regions], categories: [...categories] }
  }, [pins, locale])

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const out = pins.filter((pin) => {
      if (filterTag !== null && !pin.place.tagKeys.includes(filterTag)) return false
      if (region !== null && pin.place.regionKey !== region) return false
      if (category !== null && pin.place.categoryKey !== category) return false
      if (gemsOnly && !pin.place.isHiddenGem) return false
      if (near !== null && haversineKm(near, pin.place) > radiusKm) return false
      return needle === '' || pin.haystack.includes(needle)
    })
    if (near !== null) out.sort((a, b) => haversineKm(near, a.place) - haversineKm(near, b.place))
    return out
  }, [pins, query, filterTag, region, category, gemsOnly, near, radiusKm])

  useEffect(() => {
    const q = trimmed
    if (q.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/places/suggest?q=${encodeURIComponent(q)}&locale=${locale}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : { suggestions: [] }))
        .then((body: { suggestions?: Suggestion[] }) =>
          setFetched({ q, items: body.suggestions ?? [] }),
        )
        .catch(() => undefined)
    }, 180)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [trimmed, locale])

  const applySuggestion = (item: Suggestion) => {
    setQuery('')
    if (item.type === 'region') setRegion(item.key)
    else if (item.type === 'category') setCategory(item.key)
    else if (item.type === 'category_in_region') {
      setRegion(item.region)
      setCategory(item.category)
    } else if (item.type === 'tag') setFilterTag(item.key)
    else {
      const target = pins.find((pin) => pin.place.slug === item.slug)
      if (target) onPickPlace(target)
    }
  }

  const locate = () => {
    if (near !== null) {
      setNear(null)
      setGeoStatus('idle')
      return
    }
    if (!('geolocation' in navigator)) {
      setGeoStatus('denied')
      return
    }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lon: position.coords.longitude }
        if (!isInBali(here)) {
          setGeoStatus('outside')
          return
        }
        setNear(here)
        setGeoStatus('idle')
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }

  return {
    query,
    setQuery,
    filterTag,
    setFilterTag,
    region,
    setRegion,
    category,
    setCategory,
    gemsOnly,
    setGemsOnly,
    near,
    radiusKm,
    setRadiusKm,
    geoStatus,
    suggestions,
    applySuggestion,
    locate,
    facets,
    matched,
  }
}

export type MapFilters = ReturnType<typeof useMapFilters>

/** الشريط العلوي فوق الخريطة. نفس الأصناف CSS في الواجهتين. */
export function MapFilterBar({ f }: { f: MapFilters }) {
  const t = useTranslations()
  return (
    <div className="bt-mapui">
      <div className="bt-mapsearch">
        <Icon name="search" size={19} color="#5b6b5c" />
        <input
          type="search"
          value={f.query}
          onChange={(event) => f.setQuery(event.target.value)}
          placeholder={t('map_search')}
          aria-label={t('map_search')}
          autoComplete="off"
        />
      </div>
      {f.suggestions.length > 0 && (
        <ul className="bt-mapsuggest" aria-label={t('map_suggestions')}>
          {f.suggestions.map((item, index) => (
            <li key={`${item.type}-${index}`}>
              <button type="button" onClick={() => f.applySuggestion(item)}>
                <Icon
                  name={item.type === 'place' ? 'pin' : item.type === 'tag' ? 'tag' : 'search'}
                  size={14}
                />{' '}
                <bdi>{item.label}</bdi>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="bt-mapchips">
        {MAP_FILTERS.map((filter) => {
          const on = filter.tag === f.filterTag
          return (
            <button
              key={filter.labelKey}
              type="button"
              className={on ? 'bt-mchip on' : 'bt-mchip'}
              aria-pressed={on}
              onClick={() => f.setFilterTag(filter.tag)}
            >
              {t(filter.labelKey)}
            </button>
          )
        })}
        <button
          type="button"
          className={f.gemsOnly ? 'bt-mchip on' : 'bt-mchip'}
          aria-pressed={f.gemsOnly}
          onClick={() => f.setGemsOnly(!f.gemsOnly)}
        >
          <Icon name="gem" size={13} /> {t('map_f_gems')}
        </button>
      </div>

      <div className="bt-mapchips" style={{ marginTop: 8 }}>
        <select
          className="bt-mchip"
          aria-label={t('map_region')}
          value={f.region ?? ''}
          onChange={(event) => f.setRegion(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">{t('map_region_all')}</option>
          {f.facets.regions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="bt-mchip"
          aria-label={t('map_category')}
          value={f.category ?? ''}
          onChange={(event) => f.setCategory(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">{t('map_category_all')}</option>
          {f.facets.categories.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={f.near !== null ? 'bt-mchip on' : 'bt-mchip'}
          aria-pressed={f.near !== null}
          onClick={f.locate}
        >
          <Icon name="pin" size={13} />{' '}
          {f.geoStatus === 'locating' ? t('map_locating') : t('map_near_me')}
        </button>
        {f.near !== null && (
          <select
            className="bt-mchip"
            aria-label={t('map_radius')}
            value={f.radiusKm}
            onChange={(event) => f.setRadiusKm(Number(event.target.value))}
          >
            {RADIUS_CHOICES.map((km) => (
              <option key={km} value={km}>
                {t('map_within_km', { km })}
              </option>
            ))}
          </select>
        )}
      </div>
      {(f.geoStatus === 'denied' || f.geoStatus === 'outside') && (
        <p role="status" className="bt-mapnote">
          {t(f.geoStatus === 'denied' ? 'map_geo_denied' : 'map_geo_outside')}
        </p>
      )}
    </div>
  )
}
