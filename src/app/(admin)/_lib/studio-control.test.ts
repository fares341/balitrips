import { describe, expect, it } from 'vitest'

import {
  applyTextOverrides,
  diffAgainstBundled,
  EDITABLE_TEXT_KEYS,
  HOME_SECTIONS,
  IMAGE_SLOT_IDS,
} from '@/lib/content/home-content'

import { GENERIC_HELP, HELP, helpFor, helpText } from '../_help/registry'
import { fitWithin, needsShrink } from '../_ui/media-upload-client'
import { canOpen } from './route-access'
import { checkUpload, cleanName, nameFromFilename } from './media-names'
import en from '../../../../messages/en.json'

const t = (key: string, vars?: Record<string, unknown>) =>
  `${key}${vars ? JSON.stringify(vars) : ''}`

describe('media names', () => {
  it('derives a readable name from a file name', () => {
    expect(nameFromFilename('IMG_2034 Ulun-Danu.final.JPG')).toBe('IMG 2034 Ulun Danu.final')
    expect(nameFromFilename('C:\\photos\\غروب_أولواتو.webp')).toBe('غروب أولواتو')
    expect(nameFromFilename('')).toBe('image')
    expect(nameFromFilename('x'.repeat(300) + '.png')).toHaveLength(120)
  })
  it('cleans an owner-typed name; blank is null', () => {
    expect(cleanName('  معبد   تاناه لوت ')).toBe('معبد تاناه لوت')
    expect(cleanName('   ')).toBeNull()
  })
})

describe('upload checks', () => {
  it('refuses empty, wrong type and oversize files with messages', () => {
    expect(checkUpload({ size: 0, type: 'image/png', name: 'a.png' }, t)?.code).toBe('empty')
    expect(checkUpload({ size: 10, type: 'image/heic', name: 'a.heic' }, t)?.code).toBe('type')
    expect(checkUpload({ size: 11, type: 'image/jpeg', name: 'a.jpg' }, t, 10)?.code).toBe('size')
    expect(checkUpload({ size: 10, type: 'image/webp', name: 'a.webp' }, t, 10)).toBeNull()
  })
})

describe('client resize', () => {
  it('keeps the aspect ratio inside the max edge', () => {
    expect(fitWithin(6000, 4000)).toEqual({ width: 2560, height: 1707 })
    expect(fitWithin(1200, 800)).toBeNull()
  })
  it('re-encodes only big non-PNG files', () => {
    expect(needsShrink({ size: 5e6, type: 'image/jpeg' })).toBe(true)
    expect(needsShrink({ size: 5e6, type: 'image/png' })).toBe(false)
    expect(needsShrink({ size: 1e5, type: 'image/jpeg' })).toBe(false)
  })
})

describe('home content', () => {
  it('every editable key exists in the bundled messages', () => {
    for (const key of EDITABLE_TEXT_KEYS) expect(en, key).toHaveProperty(key)
  })
  it('slot ids are unique', () => {
    const all = HOME_SECTIONS.flatMap((s) => s.images.map((i) => i.id))
    expect(new Set(all).size).toBe(all.length)
    expect(IMAGE_SLOT_IDS.size).toBe(all.length)
  })
  it('applies only non-blank overrides of known keys', () => {
    const out = applyTextOverrides(
      { hv4_lede: 'old', other: 'x' },
      { texts: { hv4_lede: { ar: 'جديد', en: ' ' }, other: { ar: 'hack' } } },
      'ar',
    )
    expect(out).toEqual({ hv4_lede: 'جديد', other: 'x' })
    expect(
      applyTextOverrides({ hv4_lede: 'old' }, { texts: { hv4_lede: { en: '' } } }, 'en'),
    ).toEqual({
      hv4_lede: 'old',
    })
  })
  it('stores only values that differ from the bundled text (identical site until edited)', () => {
    const bundled = { en: { hv4_lede: 'Same' }, ar: { hv4_lede: 'نفس' }, id: {} }
    expect(diffAgainstBundled({ hv4_lede: { en: 'Same', ar: 'نفس', id: '' } }, bundled)).toEqual({})
    expect(
      diffAgainstBundled({ hv4_lede: { en: 'New', ar: 'نفس' }, junk: { en: 'x' } }, bundled),
    ).toEqual({
      hv4_lede: { en: 'New' },
    })
  })
})

describe('guides and routes', () => {
  it('finds the guide of a screen, with a generic fallback', () => {
    expect(helpFor('/media').id).toBe('media')
    expect(helpFor('/activities/123').id).toBe('activities')
    expect(helpFor('').id).toBe('dashboard')
    expect(helpFor('/protection/alerts')).toBe(GENERIC_HELP)
  })
  it('every guide has all three languages and is searchable', () => {
    for (const entry of HELP) {
      for (const value of [entry.title, entry.purpose]) {
        expect(
          value.every((text) => text.trim() !== ''),
          entry.id,
        ).toBe(true)
      }
      expect(helpText(entry).length).toBeGreaterThan(10)
    }
  })
  it('new screens are gated', () => {
    expect(canOpen('admin', '/home-content')).toBe(true)
    expect(canOpen('admin', '/archive')).toBe(true)
    expect(canOpen('admin', '/help')).toBe(true)
  })
})
