/**
 * Curated area labels for the public map (owner, Nov 2026). Every OSM place
 * label is hidden; only these main tourist areas are written on the map,
 * each from its own zoom. Coordinates here are the fallback: a region with a
 * centre in the database (`regions.center_lat/lon`, same key) wins.
 */

export interface AreaLabel {
  key: string
  name: { en: string; ar: string; id: string }
  lat: number
  lon: number
  minZoom: number
}

export const AREA_LABELS: readonly AreaLabel[] = [
  {
    key: 'kuta',
    name: { en: 'Kuta', ar: 'كوتا', id: 'Kuta' },
    lat: -8.722,
    lon: 115.168,
    minZoom: 7.5,
  },
  {
    key: 'seminyak',
    name: { en: 'Seminyak', ar: 'سمينياك', id: 'Seminyak' },
    lat: -8.684,
    lon: 115.158,
    minZoom: 9.5,
  },
  {
    key: 'canggu',
    name: { en: 'Canggu', ar: 'تشانغو', id: 'Canggu' },
    lat: -8.648,
    lon: 115.135,
    minZoom: 8.5,
  },
  {
    key: 'ubud',
    name: { en: 'Ubud', ar: 'أوبود', id: 'Ubud' },
    lat: -8.507,
    lon: 115.263,
    minZoom: 7.5,
  },
  {
    key: 'uluwatu',
    name: { en: 'Uluwatu', ar: 'أولواتو', id: 'Uluwatu' },
    lat: -8.815,
    lon: 115.093,
    minZoom: 8.5,
  },
  {
    key: 'jimbaran',
    name: { en: 'Jimbaran', ar: 'جيمباران', id: 'Jimbaran' },
    lat: -8.79,
    lon: 115.165,
    minZoom: 9.5,
  },
  {
    key: 'nusa-dua',
    name: { en: 'Nusa Dua', ar: 'نوسا دوا', id: 'Nusa Dua' },
    lat: -8.805,
    lon: 115.225,
    minZoom: 8.5,
  },
  {
    key: 'sanur',
    name: { en: 'Sanur', ar: 'سانور', id: 'Sanur' },
    lat: -8.695,
    lon: 115.262,
    minZoom: 9.5,
  },
  {
    key: 'denpasar',
    name: { en: 'Denpasar', ar: 'دينباسار', id: 'Denpasar' },
    lat: -8.655,
    lon: 115.217,
    minZoom: 10,
  },
  {
    key: 'nusa-penida',
    name: { en: 'Nusa Penida', ar: 'نوسا بينيدا', id: 'Nusa Penida' },
    lat: -8.73,
    lon: 115.54,
    minZoom: 7.5,
  },
  {
    key: 'tanah-lot',
    name: { en: 'Tanah Lot', ar: 'تانا لوت', id: 'Tanah Lot' },
    lat: -8.62,
    lon: 115.087,
    minZoom: 9.5,
  },
  {
    key: 'kintamani',
    name: { en: 'Kintamani', ar: 'كينتاماني', id: 'Kintamani' },
    lat: -8.25,
    lon: 115.36,
    minZoom: 7.5,
  },
  {
    key: 'lovina',
    name: { en: 'Lovina', ar: 'لوفينا', id: 'Lovina' },
    lat: -8.16,
    lon: 115.03,
    minZoom: 7.5,
  },
  {
    key: 'amed',
    name: { en: 'Amed', ar: 'أميد', id: 'Amed' },
    lat: -8.34,
    lon: 115.65,
    minZoom: 7.5,
  },
]

export interface AreaLabelPoint {
  name: string
  lat: number
  lon: number
  minZoom: number
}

/** The labels in the page language, with database centres preferred. */
export function areaLabelPoints(
  locale: string,
  regions: readonly { key: string; centerLat: number | null; centerLon: number | null }[],
): AreaLabelPoint[] {
  const centres = new Map(
    regions
      .filter((one) => one.centerLat !== null && one.centerLon !== null)
      .map((one) => [one.key, { lat: one.centerLat!, lon: one.centerLon! }]),
  )
  const lang = locale === 'ar' || locale === 'id' ? locale : 'en'
  return AREA_LABELS.map((label) => {
    const db = centres.get(label.key)
    return {
      name: label.name[lang],
      lat: db?.lat ?? label.lat,
      lon: db?.lon ?? label.lon,
      minZoom: label.minZoom,
    }
  })
}
