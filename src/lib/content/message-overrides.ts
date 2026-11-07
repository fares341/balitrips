/**
 * Site text overrides (owner, Nov 2026: "every text I edit in Studio must
 * show on the site").
 *
 * Every visible text on the public site is a message key in
 * messages/{ar,en,id}.json. Studio → «الترجمات» and the «محتوى الموقع»
 * screens store an override per key and language (`message_overrides`), and
 * `i18n/request.ts` lays them over the bundled messages. Rules:
 *
 *  - a blank override is "use the bundled text", so the live site looks
 *    identical until something is edited;
 *  - only keys the bundle knows are applied (a typo cannot add stray keys);
 *  - an override may not introduce a placeholder the bundled text does not
 *    have, and its braces must balance — otherwise next-intl would fail to
 *    format the message on a public page. Such a value is refused on save
 *    and skipped on read.
 *
 * Pure: imported by the request config, Studio and the unit tests.
 */

export type MessageLocale = 'en' | 'ar' | 'id'
export const MESSAGE_LOCALES: readonly MessageLocale[] = ['ar', 'en', 'id']

export type LocaleText = Partial<Record<MessageLocale, string>>
export type MessageOverrides = Record<string, LocaleText>

export const MAX_OVERRIDE_LENGTH = 4000

/** Placeholder names used by an ICU message ("{n}", "{count, plural, …}"). */
export function placeholdersOf(text: string): Set<string> {
  const names = new Set<string>()
  for (const match of text.matchAll(/\{\s*([A-Za-z_][\w]*)\s*[,}]/g)) {
    if (match[1]) names.add(match[1])
  }
  return names
}

function bracesBalanced(text: string): boolean {
  let depth = 0
  for (const char of text) {
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth < 0) return false
    }
  }
  return depth === 0
}

export type OverrideProblem = 'placeholder' | 'braces' | 'too_long'

/** Why `value` cannot replace `bundled`, or null when it can. */
export function overrideProblem(bundled: string, value: string): OverrideProblem | null {
  if (value.length > MAX_OVERRIDE_LENGTH) return 'too_long'
  if (!bracesBalanced(value)) return 'braces'
  const allowed = placeholdersOf(bundled)
  for (const name of placeholdersOf(value)) {
    if (!allowed.has(name)) return 'placeholder'
  }
  return null
}

/**
 * Lay the overrides for one locale over a flat message bundle. Unknown keys,
 * blank values and unsafe values are ignored (the bundled text stays).
 */
export function applyMessageOverrides<M extends Record<string, unknown>>(
  messages: M,
  overrides: MessageOverrides,
  locale: string,
): M {
  const out: Record<string, unknown> = { ...messages }
  for (const [key, values] of Object.entries(overrides)) {
    const bundled = messages[key]
    if (typeof bundled !== 'string') continue
    const value = values?.[locale as MessageLocale]
    if (typeof value !== 'string' || value.trim() === '') continue
    if (overrideProblem(bundled, value) !== null) continue
    out[key] = value
  }
  return out as M
}

/**
 * The override worth storing for one key: languages whose submitted text is
 * blank or equal to the bundled text are dropped. Null = nothing to store
 * (the key follows the bundle again).
 */
export function overrideFor(
  key: string,
  submitted: LocaleText,
  bundled: Record<MessageLocale, Record<string, unknown>>,
): LocaleText | null {
  const kept: LocaleText = {}
  for (const locale of MESSAGE_LOCALES) {
    const text = (submitted[locale] ?? '').replace(/\r\n/g, '\n').trim()
    const base = bundled[locale]?.[key]
    if (text === '' || text === (typeof base === 'string' ? base.trim() : '')) continue
    kept[locale] = text
  }
  return Object.keys(kept).length > 0 ? kept : null
}

/** Whether `key` is a message of the bundle (any locale). */
export function isBundledKey(
  key: string,
  bundled: Record<MessageLocale, Record<string, unknown>>,
): boolean {
  return MESSAGE_LOCALES.some((locale) => typeof bundled[locale]?.[key] === 'string')
}

export type DiffPart = { op: 'eq' | 'del' | 'ins'; text: string }

/**
 * Word-level diff of the bundled text against the edited one, for the
 * Studio «الفرق» view. Plain LCS over whitespace-separated tokens; messages
 * are short, so the quadratic table is fine (guarded for long ones).
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter((part) => part !== '')
  const b = after.split(/(\s+)/).filter((part) => part !== '')
  if (a.length * b.length > 250_000) {
    return [
      { op: 'del', text: before },
      { op: 'ins', text: after },
    ]
  }
  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint16Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j]
          ? (table[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0)
    }
  }
  const parts: DiffPart[] = []
  const push = (op: DiffPart['op'], text: string) => {
    const last = parts[parts.length - 1]
    if (last && last.op === op) last.text += text
    else parts.push({ op, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('eq', a[i] ?? '')
      i += 1
      j += 1
    } else if ((table[(i + 1) * cols + j] ?? 0) >= (table[i * cols + j + 1] ?? 0)) {
      push('del', a[i] ?? '')
      i += 1
    } else {
      push('ins', b[j] ?? '')
      j += 1
    }
  }
  while (i < a.length) push('del', a[i++] ?? '')
  while (j < b.length) push('ins', b[j++] ?? '')
  return parts
}
