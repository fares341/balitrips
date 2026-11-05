import { describe, expect, it, vi } from 'vitest'

import { collectCandidates } from './collect'
import { PoliteClient, USER_AGENT } from './http'
import { parseCommonsPage, parseOpenverse, parseUnsplash } from './sources'

/** All network is mocked: a router over the request URL. */
function fakeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['User-Agent']).toBe(USER_AGENT)
    const u = new URL(url)
    const key =
      u.host === 'commons.wikimedia.org'
        ? (u.searchParams.get('list') ?? 'imageinfo')
        : u.host === 'query.wikidata.org'
          ? 'sparql'
          : u.host === 'api.openverse.org'
            ? 'openverse'
            : u.host === 'api.unsplash.com'
              ? 'unsplash'
              : 'other'
    const body = routes[key] ?? {}
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
}

const meta = (license: string, name: string) => ({
  License: { value: license },
  LicenseShortName: { value: name },
  Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Ana">Ana</a>' },
})
const page = (
  title: string,
  license: string,
  name: string,
  coords?: [number, number],
  width = 3000,
) => ({
  title,
  coordinates: coords ? [{ lat: coords[0], lon: coords[1] }] : undefined,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/x/${encodeURIComponent(title)}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${title.replace(/ /g, '_')}`,
      width,
      height: 2000,
      mime: 'image/jpeg',
      extmetadata: meta(license, name),
    },
  ],
})

describe('collectCandidates (mocked network)', () => {
  it('collects, filters licences and ranks the geotagged match first', async () => {
    const fetch = fakeFetch({
      geosearch: {
        query: { geosearch: [{ title: 'File:Masjid Al Huda Bali.jpg', lat: -8.6, lon: 115.2 }] },
      },
      search: {
        query: { search: [{ title: 'File:Masjid Al Huda NC.jpg' }, { title: 'File:Random.jpg' }] },
      },
      imageinfo: {
        query: {
          pages: [
            page(
              'File:Masjid Al Huda Bali.jpg',
              'cc-by-sa-4.0',
              'CC BY-SA 4.0',
              [-8.6003, 115.2002],
            ),
            page('File:Masjid Al Huda NC.jpg', 'cc-by-nc-2.0', 'CC BY-NC 2.0', [-8.6, 115.2]),
            page('File:Random.jpg', 'cc0', 'CC0', undefined, 500),
          ],
        },
      },
      sparql: { results: { bindings: [] } },
      openverse: {
        results: [
          {
            id: 'ov1',
            title: 'Masjid Al Huda',
            url: 'https://live.staticflickr.com/1.jpg',
            width: 2000,
            height: 1500,
            creator: 'Bob',
            license: 'by',
            license_version: '2.0',
            foreign_landing_url: 'https://flickr.com/p/1',
            provider: 'flickr',
          },
          {
            id: 'ov2',
            title: 'Masjid',
            url: 'https://x/2.jpg',
            width: 2000,
            height: 1500,
            license: 'by-nc',
            provider: 'flickr',
          },
          {
            id: 'ov3',
            title: 'Masjid',
            url: 'https://x/3.jpg',
            width: 2000,
            height: 1500,
            license: 'cc0',
            provider: 'wikimedia',
          },
        ],
      },
    })
    const http = new PoliteClient({ fetch, gapScale: 0 })
    const out = await collectCandidates(
      {
        name: 'Masjid Al Huda',
        names: ['Masjid Al Huda'],
        lat: -8.6,
        lon: 115.2,
        categoryKey: 'mosques',
      },
      { http, unsplashKey: null },
    )
    expect(out.map((c) => c.externalId)).toEqual(['File:Masjid Al Huda Bali.jpg', 'ov1'])
    expect(out[0]!.tier).toBe('high')
    expect(out[0]!.author).toBe('Ana')
    expect(out[0]!.authorUrl).toBe('https://commons.wikimedia.org/wiki/User:Ana')
    expect(out[0]!.license.label).toBe('CC BY-SA 4.0')
    expect(out[1]!.source).toBe('openverse')
    // No Unsplash call without a key.
    expect(fetch.mock.calls.some(([u]) => String(u).includes('unsplash'))).toBe(false)
  })

  it('asks Unsplash only with a key, for famous spots without a good free match', async () => {
    const fetch = fakeFetch({
      unsplash: {
        results: [
          {
            id: 'u1',
            width: 4000,
            height: 3000,
            description: 'Kelingking Beach',
            urls: {
              raw: 'r',
              regular: 'https://images.unsplash.com/photo-1?w=1080',
              small: 'https://images.unsplash.com/photo-1?w=400',
            },
            links: {
              html: 'https://unsplash.com/photos/u1',
              download_location: 'https://api.unsplash.com/photos/u1/download',
            },
            user: { name: 'Kim', links: { html: 'https://unsplash.com/@kim' } },
          },
        ],
      },
    })
    const http = new PoliteClient({ fetch, gapScale: 0 })
    const out = await collectCandidates(
      {
        name: 'Kelingking Beach',
        names: ['Kelingking Beach'],
        lat: -8.75,
        lon: 115.47,
        categoryKey: 'beaches',
      },
      { http, unsplashKey: 'test-key' },
    )
    expect(out[0]!.source).toBe('unsplash')
    expect(out[0]!.sourceUrl).toContain('utm_source=balitrips')
    const call = fetch.mock.calls.find(([u]) => String(u).includes('api.unsplash.com'))!
    expect((call[1]!.headers as Record<string, string>).Authorization).toBe('Client-ID test-key')
  })

  it('retries a 503 then succeeds', async () => {
    let n = 0
    const fetch = vi.fn(async () => {
      n += 1
      return n === 1
        ? new Response('busy', { status: 503 })
        : new Response('{"ok":1}', { status: 200 })
    })
    const http = new PoliteClient({ fetch, gapScale: 0 })
    expect(await http.json('https://commons.wikimedia.org/w/api.php')).toEqual({ ok: 1 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('source parsers', () => {
  it('commons: refuses non-free and non-photo files', () => {
    expect(parseCommonsPage(page('File:a.jpg', 'cc-by-nd-4.0', 'CC BY-ND 4.0'))?.license).toBeNull()
    const svg = page('File:a.svg', 'cc0', 'CC0')
    svg.imageinfo[0]!.mime = 'image/svg+xml'
    expect(parseCommonsPage(svg)).toBeNull()
  })
  it('commons: asks Wikimedia to resize big originals', () => {
    expect(
      parseCommonsPage(page('File:Big one.jpg', 'cc0', 'CC0', undefined, 6000))!.imageUrl,
    ).toContain('Special:FilePath/Big_one.jpg?width=2048')
  })
  it('openverse: skips wikimedia duplicates and bad licences', () => {
    const base = { id: 'x', url: 'https://a/b.jpg', width: 1000, height: 800 }
    expect(parseOpenverse({ ...base, license: 'by', provider: 'wikimedia' })).toBeNull()
    expect(parseOpenverse({ ...base, license: 'by-nd' })).toBeNull()
    expect(parseOpenverse({ ...base, license: 'pdm' })?.license.kind).toBe('pd')
  })
  it('unsplash: hotlink URL and download location are kept', () => {
    const c = parseUnsplash({
      id: 'u',
      width: 10,
      height: 10,
      urls: { raw: 'r', regular: 'https://images.unsplash.com/p?w=1080', small: 's' },
      links: {
        html: 'https://unsplash.com/photos/u',
        download_location: 'https://api.unsplash.com/photos/u/download',
      },
      user: { name: 'Kim', links: { html: 'https://unsplash.com/@kim' } },
    })
    expect(c.imageUrl).toBe('https://images.unsplash.com/p?w=1080')
    expect(c.downloadLocation).toBe('https://api.unsplash.com/photos/u/download')
    expect(c.license.label).toBe('Unsplash License')
  })
})
