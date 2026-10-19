/**
 * A card's one-glance line, cut from the full description (client feedback,
 * Oct 2026: card text should be short and scannable).
 *
 * The description itself is untouched (the activity page shows it whole).
 * On a card: the first clause up to a dash, a sentence end or a comma, if
 * that clause says enough (MIN_CLAUSE letters); otherwise the text cut at a
 * word boundary before MAX_LINE letters with an ellipsis. Already short
 * text comes back as it is.
 */

const MAX_LINE = 72
const MIN_CLAUSE = 20

/** Separators, strongest first: em/en dash, sentence ends, then commas. */
const BREAKS: readonly RegExp[] = [/\s[—–]\s|\s-\s/, /[.!?؟؛;](?=\s|$)/, /[،,](?=\s)/]

export function cardLine(text: string, max = MAX_LINE): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max && !BREAKS.slice(0, 1).some((pattern) => pattern.test(clean))) {
    return clean.replace(/[.؛;]$/, '')
  }

  for (const pattern of BREAKS) {
    const match = pattern.exec(clean)
    if (match === null) continue
    const clause = clean.slice(0, match.index).trim()
    if (clause.length >= MIN_CLAUSE && clause.length <= max) return clause
  }

  if (clean.length <= max) return clean.replace(/[.؛;]$/, '')
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > MIN_CLAUSE ? cut.slice(0, space) : cut).replace(/[\s،,—–-]+$/, '')}…`
}
