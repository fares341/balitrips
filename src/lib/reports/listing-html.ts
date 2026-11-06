import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { escapeHtml as e } from './export'
import type { ListingDoc } from './listing'

/**
 * The listing PDF as one self-contained HTML page for Gotenberg (the network
 * is closed there): the brand logo and the Almarai faces are posted next to
 * it as files and referenced by bare file name; page numbers come from
 * Gotenberg's `footer.html` (`.pageNumber` / `.totalPages`).
 *
 * Arabic shaping and right-to-left order are Chromium's, which is why this
 * goes through Gotenberg rather than pdf-lib (pdf-lib draws glyphs one by
 * one, unjoined).
 */

export interface ListingMeta {
  dir: 'rtl' | 'ltr'
  lang: string
  brand: string
  period: string
  filters: [string, string][]
  generatedAt: string
  labels: {
    period: string
    filters: string
    noFilters: string
    generated: string
    totals: string
    truncated: (n: number) => string
    empty: string
  }
}

const FONT_FILES = [
  ['almarai-400.woff', 400],
  ['almarai-700.woff', 700],
  ['almarai-800.woff', 800],
] as const

export const LOGO_FILE = 'bt-logo.png'

/** The files the HTML refers to: the Almarai faces (site font) and the logo. */
export async function listingAssets(): Promise<
  { name: string; content: Uint8Array; contentType: string }[]
> {
  const root = process.cwd()
  const fonts = await Promise.all(
    FONT_FILES.map(async ([name]) => ({
      name,
      content: new Uint8Array(await readFile(join(root, 'src', 'styles', 'fonts', name))),
      contentType: 'font/woff',
    })),
  )
  const logo = {
    name: LOGO_FILE,
    content: new Uint8Array(await readFile(join(root, 'public', LOGO_FILE))),
    contentType: 'image/png',
  }
  return [...fonts, logo]
}

export function listingHtml(doc: ListingDoc, meta: ListingMeta): string {
  const { labels } = meta
  const faces = FONT_FILES.map(
    ([file, weight]) =>
      `@font-face{font-family:'Almarai';src:url('${file}') format('woff');font-weight:${weight};font-style:normal}`,
  ).join('\n')

  const filters =
    meta.filters.length === 0
      ? e(labels.noFilters)
      : meta.filters.map(([k, v]) => `<span class="chip">${e(k)}: <b>${e(v)}</b></span>`).join(' ')

  const sections = doc.sections
    .map((s) => {
      const head = s.columns
        .map((c) => `<th class="${c.num ? 'num' : ''}">${e(c.label)}</th>`)
        .join('')
      const body =
        s.rows.length === 0
          ? `<tr><td colspan="${s.columns.length}" class="empty">${e(labels.empty)}</td></tr>`
          : s.rows
              .map(
                (row) =>
                  `<tr>${row
                    .map(
                      (cell, i) => `<td class="${s.columns[i]?.num ? 'num' : ''}">${e(cell)}</td>`,
                    )
                    .join('')}</tr>`,
              )
              .join('')
      const totals = s.totals
        .map(([k, v]) => `<div class="tot"><span>${e(k)}</span><b>${e(v)}</b></div>`)
        .join('')
      return `<section>
<h2>${e(s.title)}</h2>
<div class="totals" aria-label="${e(labels.totals)}">${totals}</div>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
${s.truncated > 0 ? `<p class="note">${e(labels.truncated(s.rows.length))}</p>` : ''}
</section>`
    })
    .join('')

  return `<!doctype html><html lang="${e(meta.lang)}" dir="${meta.dir}"><head><meta charset="utf-8"><title>${e(doc.title)}</title>
<style>
${faces}
@page{size:A4;margin:14mm 12mm 16mm}
*{box-sizing:border-box}
body{font-family:'Almarai','Noto Naskh Arabic','DejaVu Sans',sans-serif;color:#1c2a1f;font-size:10.5px;line-height:1.55;margin:0}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid #26552e;padding-bottom:8px;margin-bottom:10px}
header img{height:34px}
h1{font-size:19px;font-weight:800;margin:0;color:#1b3f22}
.meta{color:#5b675c;font-size:10px;margin-top:2px}
.filters{margin:6px 0 4px;color:#3a4a3d;font-size:10px}
.chip{display:inline-block;background:#f1eee7;border-radius:999px;padding:1px 8px;margin-inline-end:4px}
h2{font-size:13.5px;font-weight:700;margin:16px 0 6px;color:#1b3f22}
.totals{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.tot{border:1px solid #e2ded4;border-radius:6px;padding:4px 10px;background:#faf8f4}
.tot span{color:#5b675c;margin-inline-end:8px}.tot b{font-weight:800;unicode-bidi:isolate}
table{width:100%;border-collapse:collapse;font-size:9.8px}
thead{display:table-header-group}
tr{break-inside:avoid}
th,td{border-bottom:1px solid #e2ded4;padding:4px 5px;text-align:start;vertical-align:top}
th{background:#26552e;color:#fff;font-weight:700}
tbody tr:nth-child(even) td{background:#faf8f4}
.num{text-align:end;unicode-bidi:isolate;white-space:nowrap;font-variant-numeric:tabular-nums}
.empty{color:#5b675c;text-align:center}
.note{color:#5b675c;font-size:9.5px}
section{break-inside:auto}
</style></head><body>
<header><div><h1>${e(doc.title)}</h1>
<div class="meta">${e(meta.brand)} · ${e(labels.period)}: <b>${e(meta.period)}</b> · ${e(labels.generated)}: ${e(meta.generatedAt)}</div></div>
<img src="${LOGO_FILE}" alt="${e(meta.brand)}"></header>
<div class="filters">${e(labels.filters)}: ${filters}</div>
${sections}
</body></html>`
}

/** Gotenberg footer: page X of Y, in the document's direction. */
export function listingFooterHtml(meta: {
  dir: 'rtl' | 'ltr'
  page: string
  of: string
  brand: string
}): string {
  return `<html dir="${meta.dir}"><head><style>
body{font-family:'DejaVu Sans',sans-serif;font-size:8px;color:#5b675c;width:100%;margin:0 12mm;display:flex;justify-content:space-between}
</style></head><body><span>${e(meta.brand)}</span><span>${e(meta.page)} <span class="pageNumber"></span> ${e(meta.of)} <span class="totalPages"></span></span></body></html>`
}
