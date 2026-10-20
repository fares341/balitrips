import { describe, expect, it } from 'vitest'

import {
  expandMapsLink,
  findUrl,
  isGoogleMapsHost,
  isShortMapsLink,
  placeNameFromUrl,
} from './maps-link'

/** A fake fetch that answers from a table of URL → redirect target (or a 200). */
function redirects(table: Record<string, string | number>) {
  const seen: { url: string; init: RequestInit | undefined }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init })
    const target = table[url]
    if (target === undefined) return new Response('page', { status: 200 })
    if (typeof target === 'number') return new Response('', { status: target })
    return new Response(null, { status: 302, headers: { location: target } })
  }) as unknown as typeof fetch
  return { fetchImpl, seen }
}

describe('recognising Google Maps links', () => {
  it('knows Google hosts and nothing else', () => {
    for (const host of [
      'maps.app.goo.gl',
      'goo.gl',
      'www.google.com',
      'maps.google.com',
      'google.co.id',
      'www.google.com.au',
      'consent.google.com',
    ]) {
      expect(isGoogleMapsHost(host)).toBe(true)
    }
    for (const host of ['google.com.evil.io', 'evilgoogle.com', 'example.com', 'goo.gl.evil.io']) {
      expect(isGoogleMapsHost(host)).toBe(false)
    }
  })

  it('tells short links apart', () => {
    expect(isShortMapsLink(new URL('https://maps.app.goo.gl/AbC123'))).toBe(true)
    expect(isShortMapsLink(new URL('https://goo.gl/maps/AbC123'))).toBe(true)
    expect(isShortMapsLink(new URL('https://goo.gl/other'))).toBe(false)
    expect(isShortMapsLink(new URL('https://www.google.com/maps/@-8.5,115.2,15z'))).toBe(false)
  })

  it('finds the link inside a sentence, without trailing punctuation', () => {
    expect(findUrl('add this please: https://maps.app.goo.gl/AbC123).')?.href).toBe(
      'https://maps.app.goo.gl/AbC123',
    )
    expect(findUrl('no link here')).toBeNull()
  })

  it('reads the place name from /maps/place/<name>/', () => {
    expect(
      placeNameFromUrl(new URL('https://www.google.com/maps/place/Tirta+Empul+Temple/data=!4m2')),
    ).toBe('Tirta Empul Temple')
    expect(placeNameFromUrl(new URL('https://www.google.com/maps/@-8.5,115.2,15z'))).toBeNull()
  })
})

describe('expandMapsLink (server-side, redirects only)', () => {
  it('follows a short link and reads the pin from the redirect', async () => {
    const { fetchImpl, seen } = redirects({
      'https://maps.app.goo.gl/AbC123':
        'https://www.google.com/maps/place/Cafe/@-8.50,115.26,17z/data=!3d-8.5069!4d115.2625',
    })
    const result = await expandMapsLink('https://maps.app.goo.gl/AbC123', { fetchImpl })
    expect(result).toMatchObject({ ok: true, coords: { lat: -8.5069, lon: 115.2625 } })
    // one request: the coordinates were in the first Location header
    expect(seen).toHaveLength(1)
    expect(seen[0]?.init?.redirect).toBe('manual')
  })

  it('follows several hops on Google hosts', async () => {
    const { fetchImpl } = redirects({
      'https://goo.gl/maps/xyz': 'https://maps.app.goo.gl/xyz',
      'https://maps.app.goo.gl/xyz': 'https://www.google.com/maps?q=-8.6478,115.1385',
    })
    const result = await expandMapsLink('https://goo.gl/maps/xyz', { fetchImpl })
    expect(result).toMatchObject({ ok: true, coords: { lat: -8.6478, lon: 115.1385 } })
  })

  it('lands on a place page with no position: ok, coords null, final URL given', async () => {
    const { fetchImpl } = redirects({
      'https://maps.app.goo.gl/name': 'https://www.google.com/maps/place/Tirta+Empul/',
    })
    const result = await expandMapsLink('https://maps.app.goo.gl/name', { fetchImpl })
    expect(result).toEqual({
      ok: true,
      url: 'https://www.google.com/maps/place/Tirta+Empul/',
      coords: null,
    })
  })

  it('never requests a non-Google address, and never starts on one', async () => {
    const { fetchImpl, seen } = redirects({
      'https://maps.app.goo.gl/bad': 'https://169.254.169.254/latest/meta-data',
    })
    expect(await expandMapsLink('https://maps.app.goo.gl/bad', { fetchImpl })).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
    expect(seen.map((s) => s.url)).toEqual(['https://maps.app.goo.gl/bad'])

    expect(await expandMapsLink('https://example.com/maps', { fetchImpl })).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
    expect(await expandMapsLink('http://maps.app.goo.gl/AbC', { fetchImpl })).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
    expect(await expandMapsLink('not a url', { fetchImpl })).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })

  it('refuses a downgrade to http in a redirect', async () => {
    const { fetchImpl } = redirects({
      'https://maps.app.goo.gl/http': 'http://www.google.com/maps/@-8.5,115.2,15z',
    })
    expect(await expandMapsLink('https://maps.app.goo.gl/http', { fetchImpl })).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })

  it('stops after too many redirects', async () => {
    const { fetchImpl } = redirects({
      'https://maps.app.goo.gl/loop': 'https://maps.app.goo.gl/loop2',
      'https://maps.app.goo.gl/loop2': 'https://maps.app.goo.gl/loop',
    })
    expect(
      await expandMapsLink('https://maps.app.goo.gl/loop', { fetchImpl, maxRedirects: 3 }),
    ).toEqual({ ok: false, reason: 'too_many_redirects' })
  })

  it('gives up on a timeout and on errors, without throwing', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as unknown as typeof fetch
    expect(
      await expandMapsLink('https://maps.app.goo.gl/slow', { fetchImpl: hanging, timeoutMs: 20 }),
    ).toEqual({ ok: false, reason: 'timeout' })

    const broken = (async () => {
      throw new Error('dns')
    }) as unknown as typeof fetch
    expect(await expandMapsLink('https://maps.app.goo.gl/x', { fetchImpl: broken })).toEqual({
      ok: false,
      reason: 'network',
    })

    const { fetchImpl: gone } = redirects({ 'https://maps.app.goo.gl/gone': 404 })
    expect(await expandMapsLink('https://maps.app.goo.gl/gone', { fetchImpl: gone })).toEqual({
      ok: false,
      reason: 'bad_response',
    })
  })
})
