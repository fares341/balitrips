'use client'

/**
 * فلاتر الخريطة (map-app): البحث والتصنيف والمنطقة والوسوم و"قريب مني".
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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from 'next-intl'

import { track } from '@/lib/analytics/client'

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

export type GeoStatus = 'idle' | 'locating' | 'denied' | 'outside'

export interface MapFilterOptions {
  /** المناطق والتصنيفات والوسوم المفعّلة (عامة) — للقوائم ولفهم الجملة. */
  taxonomy: MapTaxonomy
  /** المستخدم يملك VIP: أماكن VIP قبل غيرها (الوثيقة 8.6، البند 4). */
  vipFirst: boolean
  /** From the URL (`/map?q=…&cat=…&region=…`): links from the home page and search. */
  initialQuery?: string
  initialCategory?: string | null
  initialRegion?: string | null
}

export function useMapFilters(
  pins: readonly MapPin[],
  onPickPlace: (pin: MapPin) => void,
  { taxonomy, vipFirst, initialQuery, initialCategory, initialRegion }: MapFilterOptions,
) {
  const locale = useLocale() as Locale
  const [query, setQueryText] = useState(initialQuery ?? '')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  /** المنطقة المختارة من القائمة أو الخريطة. الجملة قد تسمّي غيرها (انظر `region`). */
  const [regionChoice, setRegionChoice] = useState<string | null>(() =>
    initialRegion && taxonomy.regions.some((entry) => entry.key === initialRegion)
      ? initialRegion
      : null,
  )
  const [category, setCategory] = useState<string | null>(() =>
    initialCategory && taxonomy.categories.some((entry) => entry.key === initialCategory)
      ? initialCategory
      : null,
  )
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

  // Phase 5 analytics: which filters people use (never where they are).
  const filtersSeen = useRef(false)
  useEffect(() => {
    if (!filtersSeen.current) {
      // The first values come from the URL; the page view already counted them.
      filtersSeen.current = true
      return
    }
    if (category !== null) track('select_item', { props: { filter: 'category', category } })
    if (region !== null) track('select_item', { props: { filter: 'region', region } })
    if (filterTag !== null) track('select_item', { props: { filter: 'tag', category: filterTag } })
    if (gemsOnly) track('select_item', { props: { filter: 'hidden_gems' } })
  }, [category, region, filterTag, gemsOnly])

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
    // "قريب مني" في الخريطة يرتّب بالأقرب أولاً ولا يقطع بمسافة (التصميم v3).
    requestLocation(true)
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
