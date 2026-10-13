import type { Translate } from '../../_i18n'

/**
 * Label for a value that comes from outside the Studio (activity actions, rule
 * ids, device statuses…): `<prefix><value>` when the dictionary has it, else
 * the raw value, so a new action added in `src/lib/security` still renders.
 */
export function labelOr(t: Translate, prefix: string, value: string, fallback = value): string {
  const key = `${prefix}${value}`
  const label = t(key)
  return label === key ? fallback : label
}
