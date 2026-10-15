import { Almarai, Plus_Jakarta_Sans } from 'next/font/google'

/**
 * Two families, chosen as a pair.
 *
 * - Latin: Plus Jakarta Sans — a modern geometric grotesk (drawn for the city
 *   of Jakarta), crisp at display sizes with tight tracking and very readable
 *   in body copy; it has a true italic for the highlighted hero word.
 * - Arabic (client choice): Almarai — a clean, open, modern Arabic sans that
 *   reads well in headlines and body copy alike.
 *
 * Both stacks list Jakarta first: its Latin glyphs win for English words,
 * prices and brand names everywhere (also inside Arabic text), and every
 * Arabic character falls through to the Arabic face. The two weights line up
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

/**
 * ARABIC FACE — the single swap point.
 *
 * Every Arabic glyph in running text (public pages, Studio, not-found) comes
 * from this export through the `--font-arabic` CSS variable (tokens.css
 * `--f-ar` / `--f-en`). To change the face, replace its loader and keep
 * `variable: '--font-arabic'`.
 */
export const arabicFont = Almarai({
  subsets: ['arabic'],
  weight: ['300', '400', '700', '800'],
  variable: '--font-arabic',
  display: 'swap',
})

export const fontVariables = [jakarta.variable, arabicFont.variable].join(' ')
