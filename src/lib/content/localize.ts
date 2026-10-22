/**
 * Localized-value resolution.
 *
 * Content is stored as `jsonb` keyed by locale (`{ en, ar, id }`), which means
 * every read has to answer one question: what do we render when the requested
 * locale is missing?
 *
 * The handoff answered it with `a.name[lang]`, which renders `undefined` — or,
 * inside a template literal, the literal string "undefined" — the moment a
 * translator has not filled a field in. Since Arabic and Indonesian are
 * translated after English, that is the *normal* state of a freshly authored
 * record, not an edge case.
 *
 * `pick` resolves in a fixed order and never returns `undefined`:
 *
 *   1. the requested locale,
 *   2. English, the authoring locale,
 *   3. any other locale that does have a value — a Bahasa string beats a blank
 *      space on an Arabic page,
 *   4. the caller's fallback, which is normally the row's stable `key` or
 *      `slug` so the value is at least identifiable in the UI and in a bug
 *      report.
 *
 * Whitespace-only values count as missing: a jsonb field set to `""` by an
 * admin form that submitted an empty input is not a translation.
 *
 * Pure and dependency-free, so it runs unchanged in Server Components, Client
 * Components, route handlers and the worker.
 */

import { defaultLocale, locales, type Locale } from '@/i18n/config'

/** A fully populated localized field, as the DTOs expose it. */
export type LocalizedText = Record<Locale, string>

/**
 * What `pick` will actually accept.
 *
 * Deliberately wider than `LocalizedText`: the column is `jsonb`, so at
 * runtime it can be `null`, partially filled, or carry locales that are no
 * longer configured. Typing the input as `LocalizedText` would be a lie the
 * compiler happily accepts and the renderer then trips over.
 */
export type LocalizedInput = Partial<Record<string, string | null | undefined>> | null | undefined

function usable(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Resolve a localized value for display.
 *
 * @param value    The stored `jsonb` object, or null.
 * @param locale   The locale being rendered.
 * @param fallback Last resort — pass the row's `key` or `slug`. Defaults to
 *                 the empty string for genuinely optional copy.
 */
export function pick(value: LocalizedInput, locale: Locale, fallback = ''): string {
  if (value) {
    const requested = value[locale]
    if (usable(requested)) return requested

    const english = value[defaultLocale]
    if (usable(english)) return english

    for (const candidate of locales) {
      const other = value[candidate]
      if (usable(other)) return other
    }
  }

  return fallback
}

/**
 * Image alt text for one locale (L12). The alt written in that language when
 * there is one; otherwise the subject's own localized name, which describes
 * the photo better on an Arabic page than an English sentence would.
 */
export function pickAlt(alt: LocalizedInput, locale: Locale, name: string): string {
  const requested = alt?.[locale]
  return usable(requested) ? requested : name
}

/**
 * Same resolution, but reports absence instead of papering over it.
 *
 * Use this for optional copy the layout should omit entirely — a blurb, an
 * area line, a cancellation policy. Rendering an empty `<p>` leaves a gap in
 * the grid; rendering nothing does not.
 */
export function pickOptional(value: LocalizedInput, locale: Locale): string | null {
  const resolved = pick(value, locale)
  return resolved === '' ? null : resolved
}

/** True when the value resolves to something renderable. */
export function hasText(value: LocalizedInput, locale: Locale): boolean {
  return pick(value, locale) !== ''
}

/**
 * Resolve a list of localized values, dropping the ones that resolve to
 * nothing. Used for `included` / `excluded` / `audience`, which are stored as
 * arrays of localized objects.
 */
export function pickList(
  values: readonly LocalizedInput[] | null | undefined,
  locale: Locale,
): string[] {
  if (!values) return []
  const out: string[] = []
  for (const value of values) {
    const resolved = pick(value, locale)
    if (resolved !== '') out.push(resolved)
  }
  return out
}

/**
 * Lowercased haystack for client-side filtering.
 *
 * Matches how `search()` behaves on the server — the requested locale plus
 * English — so an English speaker typing "Batur" finds the record on the
 * Arabic site, and a Nusantara place name matches from any locale.
 */
export function searchableText(value: LocalizedInput, locale: Locale): string {
  if (!value) return ''
  const parts = [value[locale], value[defaultLocale]].filter(usable)
  return parts.join(' ').toLowerCase()
}
