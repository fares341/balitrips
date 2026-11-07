import { describe, expect, it } from 'vitest'

import ar from '../../../messages/ar.json'
import en from '../../../messages/en.json'
import id from '../../../messages/id.json'

import { applyTextOverrides } from './home-content'
import {
  applyMessageOverrides,
  isBundledKey,
  overrideFor,
  overrideProblem,
  placeholdersOf,
  wordDiff,
} from './message-overrides'

const BUNDLED = { en, ar, id } as Record<'en' | 'ar' | 'id', Record<string, unknown>>

describe('applyMessageOverrides — precedence', () => {
  const messages = { title: 'Bundled title', count: '{n} trips', other: 'Other' }

  it('leaves the bundle identical when there is nothing to apply', () => {
    expect(applyMessageOverrides(messages, {}, 'en')).toEqual(messages)
  })

  it('an override wins over the bundled text, for its own locale only', () => {
    const out = applyMessageOverrides(messages, { title: { en: 'Edited', ar: 'معدّل' } }, 'en')
    expect(out.title).toBe('Edited')
    expect(applyMessageOverrides(messages, { title: { ar: 'معدّل' } }, 'en').title).toBe(
      'Bundled title',
    )
  })

  it('blank overrides keep the bundled text (reset = empty)', () => {
    expect(applyMessageOverrides(messages, { title: { en: '   ' } }, 'en').title).toBe(
      'Bundled title',
    )
  })

  it('ignores keys the bundle does not have', () => {
    const out = applyMessageOverrides(messages, { stray: { en: 'x' } }, 'en')
    expect(out).not.toHaveProperty('stray')
  })

  it('skips an override that would break ICU formatting', () => {
    const bad = { count: { en: '{count} trips' }, title: { en: 'Oops {' } }
    expect(applyMessageOverrides(messages, bad, 'en')).toEqual(messages)
    expect(applyMessageOverrides(messages, { count: { en: '{n} رحلات' } }, 'en').count).toBe(
      '{n} رحلات',
    )
  })

  it('Studio overrides are laid over the legacy home layer', () => {
    const key = 'hv4_bali'
    const base = { [key]: 'Bali', other: 'x' }
    const home = applyTextOverrides(base, { texts: { [key]: { en: 'Home layer' } } }, 'en')
    expect(home[key]).toBe('Home layer')
    const final = applyMessageOverrides(home, { [key]: { en: 'Translations screen' } }, 'en')
    expect(final[key]).toBe('Translations screen')
    expect(applyMessageOverrides(home, {}, 'en')[key]).toBe('Home layer')
  })
})

describe('overrideFor — what gets stored', () => {
  it('stores only languages that differ from the bundle', () => {
    const key = 'faq_title'
    const kept = overrideFor(
      key,
      { en: 'Questions!', ar: String(ar[key as keyof typeof ar]) },
      BUNDLED,
    )
    expect(kept).toEqual({ en: 'Questions!' })
  })

  it('returns null (reset) when everything matches the bundle or is blank', () => {
    const key = 'faq_title'
    expect(
      overrideFor(key, { en: String(en[key as keyof typeof en]), ar: '', id: ' ' }, BUNDLED),
    ).toBeNull()
  })
})

describe('placeholders', () => {
  it('reads simple and plural arguments', () => {
    expect([...placeholdersOf('{n} of {count, plural, one {# day} other {# days}}')]).toEqual([
      'n',
      'count',
    ])
  })
  it('refuses new placeholders and unbalanced braces', () => {
    expect(overrideProblem('{n} trips', '{n} رحلة')).toBeNull()
    expect(overrideProblem('{n} trips', 'trips')).toBeNull()
    expect(overrideProblem('{n} trips', '{x} trips')).toBe('placeholder')
    expect(overrideProblem('a', 'a {')).toBe('braces')
  })
  it('knows the bundled keys', () => {
    expect(isBundledKey('faq_title', BUNDLED)).toBe(true)
    expect(isBundledKey('no_such_key_here', BUNDLED)).toBe(false)
  })
})

describe('wordDiff', () => {
  it('marks removed and added words, and rebuilds both texts', () => {
    const before = 'Book your trip today'
    const after = 'Book your Bali trip'
    const parts = wordDiff(before, after)
    const join = (ops: string[]) =>
      parts
        .filter((part) => ops.includes(part.op))
        .map((part) => part.text)
        .join('')
    expect(join(['eq', 'del'])).toBe(before)
    expect(join(['eq', 'ins'])).toBe(after)
    expect(parts[0]).toEqual({ op: 'eq', text: 'Book your ' })
    expect(parts.some((part) => part.op === 'ins' && part.text.includes('Bali'))).toBe(true)
    expect(parts.some((part) => part.op === 'del' && part.text.includes('today'))).toBe(true)
  })
  it('equal texts are one equal part', () => {
    expect(wordDiff('same text', 'same text')).toEqual([{ op: 'eq', text: 'same text' }])
  })
})
