import { IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google'

/**
 * Two families, chosen as a pair.
 *
 * - Latin: Plus Jakarta Sans — a modern geometric grotesk (drawn for the city
 *   of Jakarta), crisp at display sizes with tight tracking and very readable
 *   in body copy; it has a true italic for the highlighted hero word.
 * - Arabic: IBM Plex Sans Arabic — a professional, highly legible Naskh-based
 *   sans with a full weight range, built to sit next to a Latin grotesk.
 *
 * Both stacks list Jakarta first: its Latin glyphs win for English words,
 * prices and brand names everywhere (also inside Arabic text), and every
 * Arabic character falls through to Plex Arabic. The two weights line up
 * (400 body, 600 headings, 700 emphasis) so mixed lines look like one face.
 * next/font self-hosts and preloads both — no third-party request.
 */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-latin',
  display: 'swap',
})

export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
})

export const fontVariables = [jakarta.variable, plexArabic.variable].join(' ')
