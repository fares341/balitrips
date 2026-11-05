/**
 * The three free sources, as thin parsers over `PoliteClient`.
 *
 *  - Wikimedia Commons (no key): files geotagged near the pin
 *    (`list=geosearch`, namespace 6), full-text search by name and by
 *    «name Bali», and the P18 image of Wikidata items near the pin. Image
 *    metadata (size, licence, author) comes from `prop=imageinfo` with
 *    `extmetadata`. Commons files may be downloaded and re-hosted with the
 *    credit and licence kept.
 *  - Openverse (api.openverse.org, anonymous): licence-filtered search;
 *    anonymous callers get at most 20 results per page and ~1 req/s.
 *    Wikimedia results are skipped there (Commons is searched directly).
 *  - Unsplash (only with UNSPLASH_ACCESS_KEY): search by name. Its photos
 *    are HOTLINKED (never re-hosted), the download endpoint is triggered
 *    when one is used, and the photographer + Unsplash are credited with
 *    referral links (API guidelines).
 *
 * Every candidate leaves here with a licence that passed `normalizeLicense`.
 */

import { firstHref, stripHtml, unsplashRef } from './attribution'
import type { PoliteClient } from './http'
import { normalizeLicense, OPENVERSE_LICENSES, type FreeLicense } from './licenses'
import type { FoundVia, PhotoSource } from './score'

export interface RawCandidate {
  source: PhotoSource
  externalId: string
  via: FoundVia
  title: string
  description: string | null
  lat: number | null
  lon: number | null
  itemLabel: string | null
  width: number
  height: number
  thumbUrl: string
  /** What we download (Commons/Openverse) or hotlink (Unsplash). */
  imageUrl: string
  author: string | null
  authorUrl: string | null
  license: FreeLicense
  sourceUrl: string
  /** Unsplash only: hit when the photo is used. */
  downloadLocation: string | null
}

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const OK_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

function qs(params: Record<string, string | number>): string {
  return new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
  ).toString()
}

// ---------------------------------------------------------------- Commons

interface GeoHit {
  title: string
  lat: number
  lon: number
}

export async function commonsGeosearch(
  http: PoliteClient,
  lat: number,
  lon: number,
  radiusM = 400,
): Promise<GeoHit[]> {
  const body = await http.json<{ query?: { geosearch?: GeoHit[] } }>(
    `${COMMONS_API}?${qs({
      action: 'query',
      list: 'geosearch',
      gscoord: `${lat}|${lon}`,
      gsradius: Math.min(10_000, Math.max(10, Math.round(radiusM))),
      gsnamespace: 6,
      gslimit: 30,
      format: 'json',
      formatversion: 2,
      maxlag: 5,
    })}`,
  )
  return (body.query?.geosearch ?? []).filter((g) => typeof g.title === 'string')
}

export async function commonsSearch(
  http: PoliteClient,
  text: string,
  limit = 10,
): Promise<string[]> {
  const body = await http.json<{ query?: { search?: { title: string }[] } }>(
    `${COMMONS_API}?${qs({
      action: 'query',
      list: 'search',
      srsearch: `${text} filetype:bitmap`,
      srnamespace: 6,
      srlimit: limit,
      format: 'json',
      formatversion: 2,
      maxlag: 5,
    })}`,
  )
  return (body.query?.search ?? []).map((s) => s.title)
}

interface ExtValue {
  value?: string
}
interface CommonsPage {
  title: string
  missing?: boolean
  coordinates?: { lat: number; lon: number }[]
  imageinfo?: {
    url: string
    descriptionurl: string
    thumburl?: string
    thumbwidth?: number
    width: number
    height: number
    mime: string
    extmetadata?: Record<string, ExtValue | undefined>
  }[]
}

export interface CommonsFile {
  title: string
  lat: number | null
  lon: number | null
  width: number
  height: number
  thumbUrl: string
  imageUrl: string
  description: string | null
  author: string | null
  authorUrl: string | null
  license: FreeLicense | null
  sourceUrl: string
}

export function parseCommonsPage(page: CommonsPage): CommonsFile | null {
  const info = page.imageinfo?.[0]
  if (page.missing || !info || !OK_MIME.has(info.mime)) return null
  const meta = info.extmetadata ?? {}
  const v = (k: string) => meta[k]?.value ?? null
  const license =
    (v('NonFree') ?? '').toLowerCase() === 'true'
      ? null
      : normalizeLicense({ code: v('License'), name: v('LicenseShortName'), url: v('LicenseUrl') })
  const artistHtml = v('Artist')
  const coord = page.coordinates?.[0]
  const name = page.title.replace(/^File:/, '').replace(/ /g, '_')
  return {
    title: page.title,
    lat: coord ? coord.lat : null,
    lon: coord ? coord.lon : null,
    width: info.width,
    height: info.height,
    thumbUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=400`,
    // Wikimedia's own resizer: never pull 30 MB originals.
    imageUrl:
      info.width > 2048
        ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=2048`
        : info.url,
    description: stripHtml(v('ImageDescription')).slice(0, 300) || null,
    author: stripHtml(artistHtml) || stripHtml(v('Credit')) || null,
    authorUrl: firstHref(artistHtml),
    license,
    sourceUrl: info.descriptionurl,
  }
}

export async function commonsFiles(
  http: PoliteClient,
  titles: readonly string[],
): Promise<CommonsFile[]> {
  const out: CommonsFile[] = []
  const unique = [...new Set(titles)]
  for (let i = 0; i < unique.length; i += 40) {
    const batch = unique.slice(i, i + 40)
    const body = await http.json<{ query?: { pages?: CommonsPage[] } }>(
      `${COMMONS_API}?${qs({
        action: 'query',
        titles: batch.join('|'),
        prop: 'imageinfo|coordinates',
        iiprop: 'url|size|mime|extmetadata',
        iiextmetadatafilter:
          'License|LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|NonFree',
        iiextmetadatalanguage: 'en',
        colimit: 'max',
        format: 'json',
        formatversion: 2,
        maxlag: 5,
      })}`,
    )
    for (const page of body.query?.pages ?? []) {
      const file = parseCommonsPage(page)
      if (file) out.push(file)
    }
  }
  return out
}

// ---------------------------------------------------------------- Wikidata

export interface WikidataItem {
  id: string
  label: string
  lat: number
  lon: number
  /** Commons file name (without «File:»). */
  image: string
}

/** Items with an image (P18) within `radiusKm` of the pin. */
export async function wikidataNear(
  http: PoliteClient,
  lat: number,
  lon: number,
  radiusKm = 1,
): Promise<WikidataItem[]> {
  const query = `SELECT ?item ?itemLabel ?image ?coord WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" . }
  ?item wdt:P18 ?image .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,id,ar". }
} LIMIT 30`
  const body = await http.json<{
    results?: { bindings?: Record<string, { value: string } | undefined>[] }
  }>(`https://query.wikidata.org/sparql?${qs({ query, format: 'json' })}`, {
    Accept: 'application/sparql-results+json',
  })
  const out: WikidataItem[] = []
  for (const b of body.results?.bindings ?? []) {
    const coord = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? '')
    const image = decodeURIComponent((b.image?.value ?? '').split('/').pop() ?? '')
    if (!coord || !image || !b.item) continue
    out.push({
      id: b.item.value.split('/').pop()!,
      label: b.itemLabel?.value ?? '',
      lon: Number(coord[1]),
      lat: Number(coord[2]),
      image: image.replace(/_/g, ' '),
    })
  }
  return out
}

// ---------------------------------------------------------------- Openverse

interface OpenverseItem {
  id: string
  title?: string | null
  url: string
  thumbnail?: string | null
  width?: number | null
  height?: number | null
  creator?: string | null
  creator_url?: string | null
  license: string
  license_version?: string | null
  license_url?: string | null
  foreign_landing_url?: string | null
  provider?: string | null
  source?: string | null
  filetype?: string | null
}

export function parseOpenverse(item: OpenverseItem): RawCandidate | null {
  if (/wikimedia/i.test(`${item.provider ?? ''} ${item.source ?? ''}`)) return null
  if (item.filetype && !/^(jpe?g|png|webp)$/i.test(item.filetype)) return null
  const license = normalizeLicense({
    code: item.license,
    version: item.license_version ?? null,
    url: item.license_url ?? null,
  })
  if (!license || !item.width || !item.height || !/^https:\/\//.test(item.url)) return null
  return {
    source: 'openverse',
    externalId: item.id,
    via: 'openverse',
    title: item.title ?? '',
    description: null,
    lat: null,
    lon: null,
    itemLabel: null,
    width: item.width,
    height: item.height,
    thumbUrl: item.thumbnail ?? item.url,
    imageUrl: item.url,
    author: item.creator ?? null,
    authorUrl: item.creator_url ?? null,
    license,
    sourceUrl: item.foreign_landing_url ?? `https://openverse.org/image/${item.id}`,
    downloadLocation: null,
  }
}

export async function openverseSearch(http: PoliteClient, text: string): Promise<RawCandidate[]> {
  const body = await http.json<{ results?: OpenverseItem[] }>(
    `https://api.openverse.org/v1/images/?${qs({
      q: text,
      license: OPENVERSE_LICENSES,
      page_size: 20,
      mature: 'false',
    })}`,
  )
  return (body.results ?? []).map(parseOpenverse).filter((c): c is RawCandidate => c !== null)
}

// ---------------------------------------------------------------- Unsplash

interface UnsplashPhoto {
  id: string
  width: number
  height: number
  description?: string | null
  alt_description?: string | null
  urls: { raw: string; regular: string; small: string }
  links: { html: string; download_location: string }
  user: { name: string; links: { html: string } }
}

export const UNSPLASH_LICENSE: FreeLicense = {
  kind: 'by',
  version: null,
  label: 'Unsplash License',
  url: 'https://unsplash.com/license',
}

export function parseUnsplash(p: UnsplashPhoto): RawCandidate {
  return {
    source: 'unsplash',
    externalId: p.id,
    via: 'unsplash',
    title: p.description || p.alt_description || '',
    description: p.alt_description ?? null,
    lat: null,
    lon: null,
    itemLabel: null,
    width: p.width,
    height: p.height,
    thumbUrl: p.urls.small,
    // Hotlinked: the returned URL, sized by Unsplash's own parameters.
    imageUrl: p.urls.regular,
    author: p.user.name,
    authorUrl: unsplashRef(p.user.links.html),
    license: UNSPLASH_LICENSE,
    sourceUrl: unsplashRef(p.links.html),
    downloadLocation: p.links.download_location,
  }
}

export async function unsplashSearch(
  http: PoliteClient,
  key: string,
  text: string,
): Promise<RawCandidate[]> {
  const body = await http.json<{ results?: UnsplashPhoto[] }>(
    `https://api.unsplash.com/search/photos?${qs({ query: text, per_page: 5, content_filter: 'high' })}`,
    { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
  )
  return (body.results ?? []).map(parseUnsplash)
}

/** API guideline: hit `download_location` when a photo is used. */
export async function unsplashTrackDownload(
  http: PoliteClient,
  key: string,
  downloadLocation: string,
): Promise<void> {
  if (!/^https:\/\/api\.unsplash\.com\//.test(downloadLocation)) return
  await http.get(downloadLocation, { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' })
}
