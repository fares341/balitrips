import { Tajawal } from 'next/font/google'

/**
 * One family for the whole product: Tajawal, in both Arabic and Latin.
 *
 * Tajawal was drawn as a bilingual family, so Arabic and English set side by
 * side (prices, place names, the language switcher) share stroke weight and
 * x-height instead of two unrelated faces meeting mid-line. next/font
 * self-hosts and preloads it — no third-party request on the critical path.
 */
export const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '700', '800', '900'],
  variable: '--font-tajawal',
  display: 'swap',
})

export const fontVariables = tajawal.variable
