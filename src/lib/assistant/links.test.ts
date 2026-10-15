import { describe, expect, it } from 'vitest'

import { localizePath, parseInline, parseReply, sanitizeHref } from './links'

const ORIGIN = 'https://balitrips.co'

describe('sanitizeHref', () => {
  it('keeps same-site paths', () => {
    expect(sanitizeHref('/activities/ubud-swing', ORIGIN)).toBe('/activities/ubud-swing')
    expect(sanitizeHref('/map?place=tegallalang#x', ORIGIN)).toBe('/map?place=tegallalang#x')
  })

  it('turns an absolute link to this site into a path', () => {
    expect(sanitizeHref('https://balitrips.co/en/my-trip?x=1', ORIGIN)).toBe('/en/my-trip?x=1')
  })

  it('keeps Google Maps links', () => {
    expect(sanitizeHref('https://www.google.com/maps/search/?api=1&query=-8.5,115.2', ORIGIN)).toBe(
      'https://www.google.com/maps/search/?api=1&query=-8.5,115.2',
    )
    expect(sanitizeHref('https://maps.google.com/?q=Ubud', ORIGIN)).toBe(
      'https://maps.google.com/?q=Ubud',
    )
    expect(sanitizeHref('https://maps.app.goo.gl/abc123', ORIGIN)).toBe(
      'https://maps.app.goo.gl/abc123',
    )
  })

  it('refuses scripts, data, other sites and look-alikes', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      'https://evil.example/activities',
      'http://www.google.com/maps', // not https
      'https://www.google.com/search?q=x', // google, but not maps
      'https://www.google.com.evil.example/maps',
      'https://user:pass@www.google.com/maps',
      'mailto:a@b.c',
      'tel:+6281',
      '//evil.example/x',
      '/\\evil.example',
      '/acti vities',
      '/x\u0000y',
      '',
    ]) {
      expect(sanitizeHref(bad, ORIGIN)).toBeNull()
    }
  })

  it('does not treat another origin as this one', () => {
    expect(sanitizeHref('https://balitrips.co.evil.example/x', ORIGIN)).toBeNull()
    expect(sanitizeHref('http://balitrips.co/x', ORIGIN)).toBeNull()
  })

  it('refuses absurdly long links', () => {
    expect(sanitizeHref(`/${'a'.repeat(700)}`, ORIGIN)).toBeNull()
  })
})

describe('parseInline', () => {
  it('turns a disallowed link into its plain label', () => {
    expect(parseInline('see [here](javascript:alert(1)) now', ORIGIN)).toEqual([
      { type: 'text', text: 'see here now' },
    ])
  })

  it('keeps allowed links and marks external ones', () => {
    expect(
      parseInline('[Ubud](/activities/ubud) or [map](https://maps.google.com/?q=Ubud)', ORIGIN),
    ).toEqual([
      { type: 'link', text: 'Ubud', href: '/activities/ubud', external: false },
      { type: 'text', text: ' or ' },
      { type: 'link', text: 'map', href: 'https://maps.google.com/?q=Ubud', external: true },
    ])
  })

  it('leaves HTML as text (React escapes it)', () => {
    const parts = parseInline('<img src=x onerror=alert(1)> **bold**', ORIGIN)
    expect(parts).toEqual([
      { type: 'text', text: '<img src=x onerror=alert(1)> ' },
      { type: 'bold', text: 'bold' },
    ])
  })
})

describe('parseReply', () => {
  it('builds paragraphs and lists', () => {
    const blocks = parseReply(
      'Hello\nthere\n\n- one\n- **two**\n\n1. first\n2) second\n## Title',
      ORIGIN,
    )
    expect(blocks).toEqual([
      { type: 'p', parts: [{ type: 'text', text: 'Hello there' }] },
      {
        type: 'ul',
        items: [[{ type: 'text', text: 'one' }], [{ type: 'bold', text: 'two' }]],
      },
      {
        type: 'ol',
        items: [[{ type: 'text', text: 'first' }], [{ type: 'text', text: 'second' }]],
      },
      { type: 'p', parts: [{ type: 'bold', text: 'Title' }] },
    ])
  })

  it('drops code fences rather than rendering them', () => {
    expect(parseReply('```html\n<b>x</b>\n```', ORIGIN)).toEqual([
      { type: 'p', parts: [{ type: 'text', text: '<b>x</b>' }] },
    ])
  })
})

describe('localizePath', () => {
  it('adds the locale to bare paths and leaves prefixed ones', () => {
    const locales = ['ar', 'en', 'id']
    expect(localizePath('/activities/x', 'ar', locales)).toBe('/ar/activities/x')
    expect(localizePath('/en/activities/x', 'ar', locales)).toBe('/en/activities/x')
    expect(localizePath('/', 'id', locales)).toBe('/id')
    expect(localizePath('https://maps.google.com/?q=x', 'ar', locales)).toBe(
      'https://maps.google.com/?q=x',
    )
  })
})
