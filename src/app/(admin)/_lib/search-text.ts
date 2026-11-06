/** Search text matching shared by the ⌘K palette and the list search boxes. */

export function normaliseSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ̀-ͯ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every word of the query must appear somewhere in the entry. */
export function matchEntries<T extends { label: string; search: string }>(
  entries: readonly T[],
  query: string,
): T[] {
  const words = normaliseSearch(query).split(' ').filter(Boolean)
  if (words.length === 0) return [...entries]
  const scored: { entry: T; score: number }[] = []
  for (const entry of entries) {
    const label = normaliseSearch(entry.label)
    const hay = `${label} ${normaliseSearch(entry.search)}`
    if (!words.every((word) => hay.includes(word))) continue
    scored.push({
      entry,
      score: label.startsWith(words[0] ?? '') ? 0 : label.includes(words[0] ?? '') ? 1 : 2,
    })
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.entry)
}
