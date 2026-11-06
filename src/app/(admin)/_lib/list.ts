import { normaliseSearch } from './search-text'

/**
 * Search (`?q=`) and paging (`?page=`) for the smaller Studio lists — the
 * pattern of `studio/orders/page.tsx`, applied to lists whose rows are
 * already loaded whole and bounded (extras, discount codes, suppliers,
 * support, tasks, team, access plans, payables). Search ignores case,
 * Arabic diacritics and hamza/ta-marbuta spellings, so «باقه» finds «باقة».
 */

export const LIST_PAGE_SIZE = 25

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function listParams(params: Record<string, string | string[] | undefined>) {
  const q = first(params.q).slice(0, 100) || null
  const parsed = Number.parseInt(first(params.page), 10)
  const page = Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 10_000) : 1
  return { q, page, offset: (page - 1) * LIST_PAGE_SIZE, pageSize: LIST_PAGE_SIZE }
}

/** Does any of `texts` contain every word of `q`? An empty query matches. */
export function matchesQuery(q: string | null, ...texts: unknown[]): boolean {
  if (!q) return true
  const hay = normaliseSearch(
    texts
      .flatMap((text) =>
        text && typeof text === 'object' ? Object.values(text as Record<string, unknown>) : [text],
      )
      .filter((text) => text !== null && text !== undefined)
      .join(' '),
  )
  return normaliseSearch(q)
    .split(' ')
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

/** Filter by `q`, then cut out the requested page. */
export function searchAndPage<T>(
  rows: readonly T[],
  params: Record<string, string | string[] | undefined>,
  texts: (row: T) => unknown[],
): { rows: T[]; total: number; page: number; pageSize: number; q: string | null } {
  const { q, page, offset, pageSize } = listParams(params)
  const hits = q ? rows.filter((row) => matchesQuery(q, ...texts(row))) : [...rows]
  return { rows: hits.slice(offset, offset + pageSize), total: hits.length, page, pageSize, q }
}
