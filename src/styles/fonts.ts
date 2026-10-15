import localFont from 'next/font/local'

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
 *
 * Both faces are bundled in src/styles/fonts/ (OFL licences alongside) and
 * loaded with next/font/local, so the build never downloads anything from
 * Google: the server build cannot fail or fall back to a system font because
 * fonts.googleapis.com is slow or unreachable.
 */
export const jakarta = localFont({
  src: [
    { path: './fonts/plus-jakarta-sans.woff', weight: '200 800', style: 'normal' },
    { path: './fonts/plus-jakarta-sans-italic.woff', weight: '200 800', style: 'italic' },
  ],
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
export const arabicFont = localFont({
  src: [
    { path: './fonts/almarai-300.woff', weight: '300', style: 'normal' },
    { path: './fonts/almarai-400.woff', weight: '400', style: 'normal' },
    { path: './fonts/almarai-700.woff', weight: '700', style: 'normal' },
    { path: './fonts/almarai-800.woff', weight: '800', style: 'normal' },
  ],
  variable: '--font-arabic',
  display: 'swap',
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
})

export const fontVariables = [jakarta.variable, arabicFont.variable].join(' ')
