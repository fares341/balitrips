/**
 * Money and percentages as people type them ("125.00", "2,5", "١٢٥٫٥").
 *
 * Storage does not change: amounts stay integer minor units and percentages
 * stay basis points. These helpers only convert at the form boundary, with
 * exact string arithmetic (no float multiplication), using the currency's own
 * number of decimals from `minorUnitExponent`.
 */
import { minorUnitExponent } from './money'

export type AmountError = 'invalid' | 'negative' | 'too_large'
export type AmountResult = { ok: true; value: number } | { ok: false; error: AmountError }

/** Largest amount accepted, in the smallest unit (exact as a JS number). */
export const MAX_SCALED = 1_000_000_000_000_000

const DIGIT_SETS = ['٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹']

/** Arabic-Indic / Persian digits to ASCII; Arabic separators to "." and ","; spaces removed. */
export function normalizeNumberText(text: string): string {
  let out = ''
  for (const ch of text) {
    let mapped = ch
    for (const set of DIGIT_SETS) {
      const index = set.indexOf(ch)
      if (index >= 0) mapped = String(index)
    }
    if (ch === '٫') mapped = '.' // Arabic decimal separator
    if (ch === '٬' || ch === '’' || ch === "'") mapped = '' // thousands separators: Arabic, Swiss
    out += mapped
  }
  return out.replace(/[\s   ‎‏⁦-⁩]/g, '')
}

/**
 * Parse a decimal number typed by a person into an integer scaled by
 * 10^decimals, rounding half up ("19.999" at 2 decimals → 2000).
 *
 * Accepts "." or "," as the decimal separator. When both appear, the last one
 * is the decimal separator and the others group thousands ("1,250.50",
 * "1.250,50"). A single separator is always the decimal one ("2,5" = 2.5).
 */
export function parseScaled(text: string, decimals: number): AmountResult {
  const clean = normalizeNumberText(text)
  if (clean === '') return { ok: false, error: 'invalid' }
  if (clean.startsWith('-')) {
    return /^-[\d.,]+$/.test(clean)
      ? { ok: false, error: 'negative' }
      : { ok: false, error: 'invalid' }
  }
  const body = clean.startsWith('+') ? clean.slice(1) : clean
  if (!/^[\d.,]+$/.test(body) || !/\d/.test(body)) return { ok: false, error: 'invalid' }

  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')
  let whole = body
  let fraction = ''
  if (lastDot >= 0 || lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma)
    const decimalChar = body[decimalAt]
    const groupChar = decimalChar === '.' ? ',' : '.'
    whole = body.slice(0, decimalAt)
    fraction = body.slice(decimalAt + 1)
    if (whole.includes(decimalChar ?? '')) {
      // The same separator twice ("1.250.000"): grouping only, no decimals.
      const groups = body.split(decimalChar ?? '')
      if (!groups.slice(1).every((group) => /^\d{3}$/.test(group))) {
        return { ok: false, error: 'invalid' }
      }
      whole = groups.join('')
      fraction = ''
    } else if (whole.includes(groupChar)) {
      const groups = whole.split(groupChar)
      if (!/^\d{1,3}$/.test(groups[0] ?? '') || !groups.slice(1).every((g) => /^\d{3}$/.test(g))) {
        return { ok: false, error: 'invalid' }
      }
      whole = groups.join('')
    }
    if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return { ok: false, error: 'invalid' }
  }
  if (whole === '') whole = '0'

  const kept = fraction.slice(0, decimals).padEnd(decimals, '0')
  const roundUp = (fraction[decimals] ?? '0') >= '5'
  const digits = (whole + kept).replace(/^0+(?=\d)/, '')
  if (digits.length > 16) return { ok: false, error: 'too_large' }
  let value = Number(digits) + (roundUp ? 1 : 0)
  if (!Number.isSafeInteger(value)) return { ok: false, error: 'too_large' }
  if (value > MAX_SCALED) return { ok: false, error: 'too_large' }
  value = Math.max(0, value)
  return { ok: true, value }
}

/** A typed amount in `currency` → integer minor units. */
export function parseMoneyInput(text: string, currency: string): AmountResult {
  return parseScaled(text, minorUnitExponent(currency))
}

/** A typed percentage ("2.5") → basis points (250). */
export function parsePercentInput(text: string): AmountResult {
  return parseScaled(text, 2)
}

/** Integer scaled by 10^decimals → plain "125.50" (no grouping, "." separator). */
export function formatScaled(value: number, decimals: number): string {
  const negative = value < 0
  const digits = String(Math.abs(Math.trunc(value))).padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals)
  return `${negative ? '-' : ''}${whole}${decimals > 0 ? `.${fraction}` : ''}`
}

/** Minor units → what goes back into the form field ("125.00"; "1500" for JPY). */
export function formatMoneyInput(minor: number, currency: string): string {
  return formatScaled(minor, minorUnitExponent(currency))
}

/** Basis points → "2.5" (trailing zeros dropped). */
export function formatPercentInput(bps: number): string {
  return formatScaled(bps, 2).replace(/\.?0+$/, '') || '0'
}
