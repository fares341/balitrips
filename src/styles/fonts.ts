import { Noto_Kufi_Arabic, Noto_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google'

/**
 * Two families, chosen as a pair.
 *
 * - Latin: Plus Jakarta Sans — a modern geometric grotesk (drawn for the city
 *   of Jakarta), crisp at display sizes with tight tracking and very readable
 *   in body copy; it has a true italic for the highlighted hero word.
 * - Arabic (client choice: a news-portal feel): Noto Sans Arabic for running
 *   text — a clean Naskh-based sans that reads like a news site's body copy —
 *   and Noto Kufi Arabic for the big headlines (h1/h2), the firm Kufi look
 *   Arabic news sites use for headlines.
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
 * `--f-ar` / `--f-en`); Arabic h1/h2 use `arabicDisplayFont` below. To change
 * a face, replace its loader and keep its `variable` name.
 */
export const arabicFont = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
})

/** Arabic headline face (h1/h2 only, via `--f-ar-display` in tokens.css). */
export const arabicDisplayFont = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['600', '700'],
  variable: '--font-arabic-display',
  display: 'swap',
})

export const fontVariables = [
  jakarta.variable,
  arabicFont.variable,
  arabicDisplayFont.variable,
].join(' ')
