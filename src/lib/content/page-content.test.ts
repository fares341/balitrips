import { describe, expect, it } from 'vitest'

import { FAQ_GROUPS } from '@/app/[locale]/faq/groups'
import { HERO_CLIPS } from '@/app/[locale]/_home/hero-media'

import ar from '../../../messages/ar.json'
import en from '../../../messages/en.json'
import id from '../../../messages/id.json'

import {
  EMPTY_PAGE_CONTENT,
  faqFromSubmitted,
  faqItemsFromBundled,
  heroVideoSources,
  linkLabel,
  resolveFaq,
  safeHref,
  sectionShown,
  SITE_PAGES,
  slotMediaId,
} from './page-content'

const BUNDLED = { en, ar, id } as Record<string, Record<string, unknown>>
const t = (key: string) => String(en[key as keyof typeof en] ?? key)

describe('page content defaults (empty = the shipped site)', () => {
  it('every section shows and every image slot uses its fallback', () => {
    for (const page of SITE_PAGES) {
      for (const section of page.sections) {
        expect(sectionShown(EMPTY_PAGE_CONTENT, page.id, section.id)).toBe(true)
        for (const slot of section.images ?? []) {
          expect(slotMediaId(EMPTY_PAGE_CONTENT, page.id, slot.id)).toBeNull()
          expect(slot.fallback).toMatch(/^\//)
        }
      }
    }
  })

  it('every editable text key exists in all three bundles', () => {
    const missing: string[] = []
    for (const page of SITE_PAGES) {
      for (const key of page.sections.flatMap((section) => section.texts)) {
        for (const [locale, bundle] of Object.entries(BUNDLED)) {
          if (typeof bundle[key] !== 'string') missing.push(`${page.id}:${key}:${locale}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('a hidden section and a picked photo are read back', () => {
    const content = {
      ...EMPTY_PAGE_CONTENT,
      pages: {
        about: { hidden: ['why'], images: { hero: '0f8fad5b-d9cb-469f-a165-70867728950e' } },
      },
    }
    expect(sectionShown(content, 'about', 'why')).toBe(false)
    expect(sectionShown(content, 'about', 'trust')).toBe(true)
    expect(slotMediaId(content, 'about', 'hero')).toBe('0f8fad5b-d9cb-469f-a165-70867728950e')
  })

  it('hero videos fall back to the bundled pair; an upload replaces only what it has', () => {
    const clip = HERO_CLIPS[0]!
    expect(heroVideoSources(clip, undefined)).toEqual({ webm: clip.webm, mp4: clip.mp4 })
    expect(heroVideoSources(clip, {})).toEqual({ webm: clip.webm, mp4: clip.mp4 })
    expect(heroVideoSources(clip, { mp4: '/media/hero/a.mp4' })).toEqual({
      webm: null,
      mp4: '/media/hero/a.mp4',
    })
  })
})

describe('site FAQ', () => {
  it('with nothing saved, shows exactly the bundled FAQ', () => {
    const groups = resolveFaq(null, FAQ_GROUPS, 'en', t)
    expect(groups.map((group) => group.id)).toEqual(FAQ_GROUPS.map((group) => group.title))
    expect(groups.flatMap((g) => g.items.map((i) => i.q))).toEqual(
      FAQ_GROUPS.flatMap((g) => g.items.map((i) => t(i.q))),
    )
  })

  it('untouched questions stay linked to their keys; edits and new ones are stored', () => {
    const shipped = faqItemsFromBundled(FAQ_GROUPS)
    const first = shipped[0]!
    const rows = [
      {
        q: { en: t(first.qKey!), ar: String(ar[first.qKey as keyof typeof ar]) },
        a: { en: 'A better answer' },
        pkg: first.group,
      },
      { q: { en: 'Brand new?' }, a: { en: 'Yes' }, pkg: '' },
      { q: { en: 'Secret' }, a: { en: 'x' }, pkg: first.group, hidden: true },
    ]
    const saved = faqFromSubmitted(rows, FAQ_GROUPS, BUNDLED)
    expect(saved[0]).toMatchObject({ q: {}, qKey: first.qKey, a: { en: 'A better answer' } })
    expect(saved[1]!.group).toBe(FAQ_GROUPS[FAQ_GROUPS.length - 1]!.title)
    const shown = resolveFaq(saved, FAQ_GROUPS, 'en', t).flatMap((g) => g.items)
    expect(shown.map((item) => item.q)).toEqual([t(first.qKey!), 'Brand new?'])
    expect(shown[0]!.a).toBe('A better answer')
  })
})

describe('links', () => {
  it('accepts site paths and http(s) only', () => {
    expect(safeHref('/activities')).toBe('/activities')
    expect(safeHref('https://instagram.com/x')).toBe('https://instagram.com/x')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('//evil.example')).toBeNull()
  })
  it('labels: own text → bundled key → English', () => {
    expect(linkLabel({ href: '/', label: { ar: 'الرئيسية' } }, 'ar', t)).toBe('الرئيسية')
    expect(linkLabel({ href: '/faq', label: {}, key: 'faq_title' }, 'en', t)).toBe(t('faq_title'))
    expect(linkLabel({ href: '/x', label: { en: 'X' } }, 'id', t)).toBe('X')
  })
})
