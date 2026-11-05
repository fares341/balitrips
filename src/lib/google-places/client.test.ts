import { describe, expect, it, vi } from 'vitest'

import {
  createGoogleClient,
  GoogleCapError,
  GoogleDisabledError,
  GoogleHttpError,
  parsePhotos,
  type GoogleCallKind,
} from './client'

const KEY = 'test-key-not-real'

function mockFetch(
  handler: (url: string, init: RequestInit) => { status?: number; body: unknown },
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { status = 200, body } = handler(String(input), init ?? {})
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

function client(
  fetchImpl: typeof fetch,
  take = vi.fn(async (_kind: GoogleCallKind) => undefined),
  key: string | null = KEY,
) {
  return {
    take,
    google: createGoogleClient({ key, base: 'https://places.example/v1', fetch: fetchImpl, take }),
  }
}

describe('Google client (mocked, no network)', () => {
  it('Text Search sends the smallest field mask, a location bias and the key in a header only', async () => {
    const fetchImpl = mockFetch(() => ({
      body: {
        places: [
          {
            id: 'ChIJabcdefghij',
            displayName: { text: 'Pantai Kuta' },
            location: { latitude: -8.71, longitude: 115.16 },
            types: ['beach'],
          },
          { id: 'bad' },
        ],
      },
    }))
    const { google, take } = client(fetchImpl as unknown as typeof fetch)
    const hits = await google.textSearch({ query: 'Kuta Beach Kuta Bali', lat: -8.7, lon: 115.1 })
    expect(hits).toEqual([
      {
        id: 'ChIJabcdefghij',
        name: 'Pantai Kuta',
        lat: -8.71,
        lon: 115.16,
        types: ['beach'],
        address: null,
      },
    ])
    expect(take).toHaveBeenCalledWith('text_search')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('https://places.example/v1/places:searchText')
    expect(String(url)).not.toContain(KEY)
    const headers = init!.headers as Record<string, string>
    expect(headers['X-Goog-Api-Key']).toBe(KEY)
    expect(headers['X-Goog-FieldMask']).toBe(
      'places.id,places.displayName,places.location,places.types',
    )
    const body = JSON.parse(String(init!.body))
    expect(body.locationBias.circle.center).toEqual({ latitude: -8.7, longitude: 115.1 })
  })

  it('photo list asks Place Details for `photos` only (IDs Only SKU)', async () => {
    const fetchImpl = mockFetch(() => ({
      body: {
        photos: [
          {
            name: 'places/ChIJabcdefghij/photos/AbC_1',
            widthPx: 4000,
            heightPx: 3000,
            authorAttributions: [
              {
                displayName: 'Made W.',
                uri: 'https://maps.google.com/maps/contrib/1',
                photoUri: '//lh3/x',
              },
            ],
            googleMapsUri: 'https://www.google.com/maps/place//data=photo',
          },
          { name: 'javascript:alert(1)' },
        ],
      },
    }))
    const { google, take } = client(fetchImpl as unknown as typeof fetch)
    const photos = await google.placePhotos('ChIJabcdefghij')
    expect(photos).toHaveLength(1)
    expect(photos[0]!.authors).toEqual([
      { displayName: 'Made W.', uri: 'https://maps.google.com/maps/contrib/1' },
    ])
    expect(take).toHaveBeenCalledWith('details_photos')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('https://places.example/v1/places/ChIJabcdefghij')
    expect((init!.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('photos')
    // A malformed id is never sent.
    expect(await google.placePhotos('../../etc')).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('photo media uses skipHttpRedirect and returns the https photoUri', async () => {
    const fetchImpl = mockFetch(() => ({
      body: { name: 'x', photoUri: 'https://lh3.googleusercontent.com/p/abc=s1280' },
    }))
    const { google, take } = client(fetchImpl as unknown as typeof fetch)
    expect(await google.photoUri('places/ChIJabcdefghij/photos/AbC_1', 99999)).toBe(
      'https://lh3.googleusercontent.com/p/abc=s1280',
    )
    expect(take).toHaveBeenCalledWith('photo_media')
    const url = String(fetchImpl.mock.calls[0]![0])
    expect(url).toBe(
      'https://places.example/v1/places/ChIJabcdefghij/photos/AbC_1/media?maxWidthPx=4800&skipHttpRedirect=true',
    )
  })

  it('refuses without a key, stops at the cap, and reports HTTP errors without the key', async () => {
    const fetchImpl = mockFetch(() => ({ status: 429, body: { error: { message: `key ${KEY}` } } }))
    await expect(
      client(fetchImpl as unknown as typeof fetch, undefined, null).google.placePhotos(
        'ChIJabcdefghij',
      ),
    ).rejects.toBeInstanceOf(GoogleDisabledError)

    const capped = vi.fn(async (kind: GoogleCallKind) => {
      throw new GoogleCapError(kind)
    })
    await expect(
      client(fetchImpl as unknown as typeof fetch, capped).google.textSearch({
        query: 'x',
        lat: 0,
        lon: 0,
      }),
    ).rejects.toBeInstanceOf(GoogleCapError)
    expect(fetchImpl).not.toHaveBeenCalled()

    const error = await client(fetchImpl as unknown as typeof fetch)
      .google.placePhotos('ChIJabcdefghij')
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GoogleHttpError)
    expect((error as GoogleHttpError).retryable).toBe(true)
    expect(String((error as Error).message)).not.toContain(KEY)
  })

  it('parsePhotos tolerates junk', () => {
    expect(parsePhotos(null)).toEqual([])
    expect(parsePhotos({ photos: 'x' })).toEqual([])
    expect(
      parsePhotos({
        photos: [
          { name: 'places/a/photos/b', authorAttributions: [{ displayName: '', uri: 'http://x' }] },
        ],
      })[0]!.authors,
    ).toEqual([])
  })
})
