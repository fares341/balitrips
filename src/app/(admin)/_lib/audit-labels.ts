import type { AdminLocale, Translate } from '../_i18n'

/**
 * Plain-language rendering of change-history rows.
 *
 * Rows store short codes (`activity.publish`, `map_place`, `priceMinor`) and
 * the changed fields as data. The owner reads "Activity — published" and
 * "Price (cents): 2500 → 3000" instead; codes without a dictionary entry fall
 * back to readable words so a new action never shows up blank.
 */

function translated(t: Translate, key: string): string | null {
  const text = t(key)
  return text === key ? null : text
}

/** `map_place` / `priceMinor` → "map place" / "price minor". */
function words(code: string): string {
  const spaced = code
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function auditEntityLabel(t: Translate, entityType: string): string {
  return translated(t, `audit.entity_${entityType}`) ?? words(entityType)
}

export function auditActionLabel(t: Translate, action: string): string {
  const dot = action.indexOf('.')
  if (dot < 0) return translated(t, `protection.action_${action}`) ?? words(action)
  const entity = action.slice(0, dot)
  const verb = action.slice(dot + 1)
  const verbLabel = translated(t, `audit.verb_${verb}`) ?? words(verb).toLowerCase()
  return `${auditEntityLabel(t, entity)} — ${verbLabel}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/
const LOCALES = ['en', 'ar', 'id'] as const

function isLocalized(value: object): value is Record<string, unknown> {
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((key) => (LOCALES as readonly string[]).includes(key))
}

function clip(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function auditValue(
  t: Translate,
  value: unknown,
  locale: AdminLocale,
  intl: string,
): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no')
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'string') {
    if (UUID.test(value)) return t('audit.linked_item')
    if (ISO_DATE.test(value)) {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat(intl, {
          dateStyle: 'medium',
          ...(value.length > 10 ? { timeStyle: 'short' } : {}),
        }).format(date)
      }
    }
    return clip(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    const shown = value.slice(0, 5).map((item) => auditValue(t, item, locale, intl))
    return value.length > 5
      ? `${shown.join(', ')} ${t('audit.and_more', { count: value.length - 5 })}`
      : shown.join(', ')
  }
  if (typeof value === 'object') {
    if (isLocalized(value)) {
      const text = value[locale] ?? value.en ?? Object.values(value)[0]
      return auditValue(t, text, locale, intl)
    }
    return t('audit.linked_item')
  }
  return '—'
}

export interface AuditLine {
  field: string
  value: string
}

/** One line per changed field: "Price (cents): 2500". */
export function auditLines(
  t: Translate,
  data: unknown,
  locale: AdminLocale,
  intl: string,
): AuditLine[] {
  if (data === null || data === undefined) return []
  if (typeof data !== 'object' || Array.isArray(data)) {
    return [{ field: '', value: auditValue(t, data, locale, intl) }]
  }
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
    field: translated(t, `audit.field_${key}`) ?? words(key),
    value: auditValue(t, value, locale, intl),
  }))
}
