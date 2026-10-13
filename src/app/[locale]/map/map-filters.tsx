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
 *  - بحث ذكي (الوثيقة 8): "كافيهات في كوتا"، "Cafes near me"… يُفهم بـ
 *    `understandQuery` (src/lib/search/query.ts) — نفس فهم `/api/places/search`.
 *    المنطقة التي تسمّيها الجملة تصبح فلتر المنطقة وتظهر في القائمة؛ و"قريب
 *    مني" يطلب الموقع ويرتّب بالأقرب، وعند الرفض يشرح ويعرض المناطق.
 *  - اقتراحات فورية من `/api/places/suggest` (8.5)
 *  - وسوم، منطقة، تصنيف، Hidden Gems — مجتمعة؛ المناطق والتصنيفات من جداولها
 *    (المفعّلة، بترتيب لوحة التحكم) لا من الأماكن المحمّلة
 *  - الترتيب (8.6): الأقرب، داخل المنطقة، أولوية الإدارة، VIP لمشترك VIP، الأشهر
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import { haversineKm, isInBali, type LatLon } from '@/lib/geo'
import type { Suggestion } from '@/lib/search/places'
import {
  buildVocabulary,
  compareHits,
  matchesTerms,
  understandQuery,
  type MapTaxonomy,
  type RankFields,
} from '@/lib/search/query'

import type { MapPin } from './projection'

const DEFAULT_RADIUS_KM = 5
/** توقف الكتابة قبل تسجيل البحث (`search_map`) — لا نسجّل كل حرف. */
const SEARCH_LOG_IDLE_MS = 1500
const RADIUS_CHOICES = [2, 5, 10, 25] as const

export type GeoStatus = 'idle' | 'locating' | 'denied' | 'outside'

export interface MapFilterOptions {
  /** المناطق والتصنيفات والوسوم المفعّلة (عامة) — للقوائم ولفهم الجملة. */
  taxonomy: MapTaxonomy
  /** المستخدم يملك VIP: أماكن VIP قبل غيرها (الوثيقة 8.6، البند 4). */
  vipFirst: boolean
}

export function useMapFilters(
  pins: readonly MapPin[],
  onPickPlace: (pin: MapPin) => void,
  { taxonomy, vipFirst }: MapFilterOptions,
) {
  const locale = useLocale() as Locale
  const [query, setQueryText] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  /** المنطقة المختارة من القائمة أو الخريطة. الجملة قد تسمّي غيرها (انظر `region`). */
  const [regionChoice, setRegionChoice] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [gemsOnly, setGemsOnly] = useState(false)
  const [near, setNear] = useState<LatLon | null>(null)
  /** null = أي مسافة: "قريب مني" في الجملة يرتّب بالأقرب ولا يقطع عند 5 كم. */
  const [radiusKm, setRadiusKm] = useState<number | null>(DEFAULT_RADIUS_KM)
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle')
  // The answer and the query it answers: a late response for an older query is
  // ignored by comparing the two, rather than cleared from inside the effect.
  const [fetched, setFetched] = useState<{ q: string; items: Suggestion[] }>({ q: '', items: [] })
  const trimmed = query.trim()
  const suggestions = trimmed.length >= 2 && fetched.q === trimmed ? fetched.items : []

  const vocabulary = useMemo(() => buildVocabulary(taxonomy), [taxonomy])
  const understood = useMemo(() => understandQuery(query, vocabulary), [query, vocabulary])
  // "كافيهات في كوتا": المنطقة التي سمّتها الجملة هي الفلتر، وتظهر في القائمة.
  const region = understood.areaKey ?? regionChoice

  const facets = useMemo(() => {
    // المنطقة العامة أولاً ثم أحياؤها: "جنوب بالي" ثم "— Kuta"، "— Seminyak".
    // من جدول المناطق، فتظهر المنطقة حتى بلا أماكن بعد.
    const known = new Set(taxonomy.regions.map((entry) => entry.key))
    const regions: [string, string][] = []
    for (const top of taxonomy.regions) {
      if (top.parentKey !== null && known.has(top.parentKey)) continue
      regions.push([top.key, pick(top.label, locale, top.key)])
      for (const child of taxonomy.regions) {
        if (child.parentKey === top.key) {
          regions.push([child.key, `— ${pick(child.label, locale, child.key)}`])
        }
      }
    }
    const categories: [string, string][] = taxonomy.categories.map((entry) => [
      entry.key,
      pick(entry.label, locale, entry.key),
    ])
    // شرائح الوسوم: الموجودة على الأماكن المرئية فقط (شريحة بلا نتائج تضليل)،
    // بترتيب لوحة التحكم.
    const present = new Set(pins.flatMap((pin) => pin.place.tagKeys))
    const tags: [string, string][] = taxonomy.tags
      .filter((entry) => present.has(entry.key))
      .map((entry) => [entry.key, pick(entry.label, locale, entry.key)])
    return { regions, categories, tags }
  }, [taxonomy, pins, locale])

  const matched = useMemo(() => {
    const ranked: { pin: MapPin; rank: RankFields }[] = []
    for (const pin of pins) {
      const { place } = pin
      if (filterTag !== null && !place.tagKeys.includes(filterTag)) continue
      if (region !== null && place.regionKey !== region && place.parentRegionKey !== region)
        continue
      if (
        category !== null &&
        place.categoryKey !== category &&
        !place.subCategoryKeys.includes(category)
      )
        continue
      if (gemsOnly && !place.isHiddenGem) continue
      const distanceKm = near === null ? null : haversineKm(near, place)
      if (distanceKm !== null && radiusKm !== null && distanceKm > radiusKm) continue
      if (!matchesTerms(pin.haystack, understood.terms)) continue
      ranked.push({
        pin,
        rank: {
          distanceKm,
          inRegion:
            region !== null && (place.regionKey === region || place.parentRegionKey === region),
          priority: place.priority,
          sortOrder: place.sortOrder,
          vip: vipFirst && place.requiredEntitlement === 'vip' && !place.isFree,
          popularity: place.popularity,
          name: pick(place.name, locale, place.slug),
        },
      })
    }
    return ranked.sort((a, b) => compareHits(a.rank, b.rank)).map((item) => item.pin)
  }, [pins, understood, filterTag, region, category, gemsOnly, near, radiusKm, vipFirst, locale])

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

  // تسجيل البحث (`search_map`): الخريطة تفلتر هنا ولا تمرّ بـ /api/places/search،
  // فنرسل الجملة بعد توقف الكتابة، غير فارغة ومختلفة عن آخر ما أُرسل. بلا
  // setState — مؤقت ومرجع فقط. الخادم يتجاهل الزائر ويكرر نفس الجملة خلال دقيقة.
  const lastLogged = useRef('')
  const resultCount = matched.length
  const nearMe = understood.nearMe || near !== null
  useEffect(() => {
    const q = trimmed
    if (q.length === 0 || q === lastLogged.current) return
    const timer = window.setTimeout(() => {
      lastLogged.current = q
      void fetch('/api/places/search-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q,
          areaKey: region,
          categories: category === null ? [] : [category],
          tag: filterTag,
          gems: gemsOnly,
          nearMe,
          results: resultCount,
        }),
        keepalive: true,
      }).catch(() => undefined)
    }, SEARCH_LOG_IDLE_MS)
    return () => window.clearTimeout(timer)
  }, [trimmed, region, category, filterTag, gemsOnly, nearMe, resultCount])

  /**
   * `fromQuery`: "Cafes near me" — ترتيب بالأقرب بلا حد مسافة. الزر: نصف قطر.
   * يُستدعى من معالجات الأحداث فقط، لا من تأثير.
   */
  const requestLocation = (fromQuery: boolean) => {
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
        setRadiusKm((current) => (fromQuery ? null : (current ?? DEFAULT_RADIUS_KM)))
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }

  const setQuery = (value: string) => {
    setQueryText(value)
    // يُطلب الموقع حين تظهر "قريب مني" في الجملة — مرة، لا مع كل حرف بعدها.
    const next = understandQuery(value, vocabulary)
    if (next.nearMe && !understood.nearMe) {
      if (near === null) {
        if (geoStatus !== 'locating') requestLocation(true)
      } else {
        // الموقع معروف من زر "قريب مني": الجملة تحكم الآن (ترتيب بالمسافة بلا
        // دائرة ثابتة)، كما لو طُلب الموقع منها أول مرة.
        setRadiusKm(null)
      }
    }
  }

  /** اختيار منطقة (القائمة، دائرة على الخريطة، شريحة). يُزيل المنطقة من الجملة كي لا تغلبه. */
  const chooseRegion = (key: string | null) => {
    setRegionChoice(key)
    if (understood.areaKey !== null) setQueryText(understood.withoutArea)
  }

  const applySuggestion = (item: Suggestion) => {
    setQueryText('')
    if (item.type === 'region') setRegionChoice(item.key)
    else if (item.type === 'category') setCategory(item.key)
    else if (item.type === 'category_in_region') {
      setRegionChoice(item.region)
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
    requestLocation(false)
  }

  return {
    query,
    setQuery,
    understood,
    filterTag,
    setFilterTag,
    region,
    chooseRegion,
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

/**
 * الشريط العلوي فوق الخريطة. نفس الأصناف CSS في الواجهتين.
 * `children`: أزرار خاصة بواجهة (مثل "اعرض المناطق" في المسطحة).
 */
export function MapFilterBar({ f, children }: { f: MapFilters; children?: ReactNode }) {
  const t = useTranslations()
  const geoFailed = f.geoStatus === 'denied' || f.geoStatus === 'outside'
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
        <button
          type="button"
          className={f.filterTag === null ? 'bt-mchip on' : 'bt-mchip'}
          aria-pressed={f.filterTag === null}
          onClick={() => f.setFilterTag(null)}
        >
          {t('map_f_all')}
        </button>
        {f.facets.tags.map(([key, label]) => {
          const on = key === f.filterTag
          return (
            <button
              key={key}
              type="button"
              className={on ? 'bt-mchip on' : 'bt-mchip'}
              aria-pressed={on}
              onClick={() => f.setFilterTag(on ? null : key)}
            >
              <bdi>{label}</bdi>
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
          className={f.region !== null ? 'bt-mchip on' : 'bt-mchip'}
          aria-label={t('map_region')}
          value={f.region ?? ''}
          onChange={(event) =>
            f.chooseRegion(event.target.value === '' ? null : event.target.value)
          }
        >
          <option value="">{t('map_region_all')}</option>
          {f.facets.regions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={f.category !== null ? 'bt-mchip on' : 'bt-mchip'}
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
            value={f.radiusKm ?? ''}
            onChange={(event) =>
              f.setRadiusKm(event.target.value === '' ? null : Number(event.target.value))
            }
          >
            {RADIUS_CHOICES.map((km) => (
              <option key={km} value={km}>
                {t('map_within_km', { km })}
              </option>
            ))}
            <option value="">{t('map_any_distance')}</option>
          </select>
        )}
        {children}
      </div>

      {f.near !== null && f.understood.nearMe && (
        <p role="status" className="bt-mapnote">
          {t('map_sorted_near')}
        </p>
      )}
      {geoFailed && (
        // الموقع مرفوض أو خارج بالي: الشرح، ثم المناطق نفسها كاختيار بارز (الوثيقة 9.3).
        <div role="status" className="bt-mapnote bt-geo-areas">
          <p>
            {t(f.geoStatus === 'denied' ? 'map_geo_denied' : 'map_geo_outside')}
            {f.understood.nearMe && <> {t('map_geo_fallback')}</>}
          </p>
          <div className="bt-geo-area-list" aria-label={t('map_pick_area')}>
            {f.facets.regions.map(([key, label]) => {
              const on = key === f.region
              return (
                <button
                  key={key}
                  type="button"
                  className={on ? 'bt-mchip on' : 'bt-mchip'}
                  aria-pressed={on}
                  onClick={() => f.chooseRegion(on ? null : key)}
                >
                  <bdi>{label.replace(/^— /, '')}</bdi>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
