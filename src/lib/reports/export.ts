import { formatMoney } from '@/lib/money'

import { changeText, kpiChange, kpiText, prevText } from './format'
import { lineGeometry, polyline } from './svg'
import type { ReportResult } from './types'

/**
 * A report as a spreadsheet (CSV) or a printable document (HTML → PDF).
 *
 * CSV: one file, sections one after the other (numbers, then each chart's
 * data, then each table), with the raw values (minor units with their
 * currency) so a spreadsheet can add them up. The UTF-8 byte-order mark goes
 * first so Excel opens Arabic correctly.
 */

export const UTF8_BOM = '﻿'

export function csvEscape(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : String(value)
  // Formula injection (Excel / Sheets): neutralise a leading = + - @.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export interface ExportLabels {
  metric: string
  value: string
  previous: string
  change: string
  definition: string
  period: string
  comparedWith: string
  newLabel: string
  points: string
  hours: string
  generated: string
}

export function reportCsv(
  result: ReportResult,
  meta: { period: string; compared: string | null; intl: string; labels: ExportLabels },
): string {
  const { labels, intl } = meta
  const lines: unknown[][] = []
  lines.push([result.title])
  lines.push([labels.period, meta.period])
  if (meta.compared) lines.push([labels.comparedWith, meta.compared])
  lines.push([])
  lines.push([labels.metric, labels.value, labels.previous, labels.change, labels.definition])
  for (const kpi of result.kpis) {
    lines.push([
      kpi.label,
      kpiText(kpi, intl, labels.hours).join(' · '),
      prevText(kpi, intl),
      changeText(kpi, kpiChange(kpi), intl, { newLabel: labels.newLabel, points: labels.points }),
      kpi.definition,
    ])
  }
  for (const block of result.blocks) {
    lines.push([])
    lines.push([block.title])
    if (block.kind === 'line') {
      lines.push(['', block.currentLabel, block.previous ? block.previousLabel : ''])
      block.labels.forEach((label, i) => {
        lines.push([label, block.current[i] ?? 0, block.previous ? (block.previous[i] ?? 0) : ''])
      })
      if (block.unit === 'money' && block.currency) lines.push([`(${block.currency}, minor units)`])
    } else if (block.kind === 'bar') {
      for (const row of block.rows) lines.push([row.label, row.value, row.display])
    } else {
      lines.push(block.columns.map((c) => c.label))
      for (const row of block.rows) {
        lines.push(block.columns.map((c) => row[c.key]?.raw ?? row[c.key]?.text ?? ''))
      }
    }
  }
  if (result.notes.length > 0) {
    lines.push([])
    for (const note of result.notes) lines.push([note])
  }
  return `${UTF8_BOM}${lines.map((line) => line.map(csvEscape).join(',')).join('\r\n')}\r\n`
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Self-contained printable HTML (no external resources — Gotenberg renders
 * with the network closed). Same content as the page: numbers with their
 * comparison and definition, charts, tables, notes.
 */
export function reportHtml(
  result: ReportResult,
  meta: {
    period: string
    compared: string | null
    intl: string
    dir: 'rtl' | 'ltr'
    lang: string
    brand: string
    generatedAt: string
    labels: ExportLabels
  },
): string {
  const { labels, intl } = meta
  const e = escapeHtml
  const kpis = result.kpis
    .map((kpi) => {
      const change = kpiChange(kpi)
      const changeLabel = changeText(kpi, change, intl, {
        newLabel: labels.newLabel,
        points: labels.points,
      })
      const tone = change.good === null ? '' : change.good ? 'good' : 'bad'
      return `<div class="kpi"><div class="kl">${e(kpi.label)}</div>${kpiText(
        kpi,
        intl,
        labels.hours,
      )
        .map((v) => `<div class="kv">${e(v)}</div>`)
        .join('')}${changeLabel ? `<div class="kc ${tone}">${e(changeLabel)}</div>` : ''}${
        kpi.note ? `<div class="kn">${e(kpi.note)}</div>` : ''
      }</div>`
    })
    .join('')

  const blocks = result.blocks
    .map((block) => {
      if (block.kind === 'line') {
        const g = lineGeometry({
          labels: block.labels,
          current: block.current,
          previous: block.previous,
          rtl: meta.dir === 'rtl',
          width: 700,
          height: 220,
        })
        const fmt = (v: number) =>
          block.unit === 'money' && block.currency
            ? formatMoney(v, block.currency, intl)
            : new Intl.NumberFormat(intl).format(v)
        const axisX = meta.dir === 'rtl' ? g.plot.right + 6 : g.plot.left - 6
        const anchor = meta.dir === 'rtl' ? 'start' : 'end'
        return `<section><h2>${e(block.title)}</h2><svg viewBox="0 0 ${g.width} ${g.height}" width="100%" role="img" aria-label="${e(block.title)}">
${g.ticks.map((tick) => `<line x1="${g.plot.left}" x2="${g.plot.right}" y1="${tick.y}" y2="${tick.y}" stroke="#e2ded4"/><text x="${axisX}" y="${tick.y + 4}" font-size="10" text-anchor="${anchor}" fill="#5b675c">${e(fmt(tick.value))}</text>`).join('')}
${g.xLabels.map((l) => `<text x="${l.x}" y="${g.height - 8}" font-size="10" text-anchor="middle" fill="#5b675c">${e(l.text)}</text>`).join('')}
${g.previous ? `<polyline points="${polyline(g.previous)}" fill="none" stroke="#8a948b" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
<polyline points="${polyline(g.current)}" fill="none" stroke="#26552e" stroke-width="2.5"/>
</svg><p class="legend"><span class="sw cur"></span>${e(block.currentLabel)}${
          block.previous ? ` &nbsp; <span class="sw prev"></span>${e(block.previousLabel)}` : ''
        }</p><p class="def">${e(block.definition)}</p></section>`
      }
      if (block.kind === 'bar') {
        const max = Math.max(1, ...block.rows.map((r) => r.value))
        return `<section><h2>${e(block.title)}</h2>${
          block.rows.length === 0
            ? '<p class="def">—</p>'
            : block.rows
                .map(
                  (r) =>
                    `<div class="bar"><span class="bl">${e(r.label)}</span><span class="bt"><span class="bf" style="width:${((r.value / max) * 100).toFixed(1)}%"></span></span><span class="bv">${e(r.display)}</span></div>`,
                )
                .join('')
        }<p class="def">${e(block.definition)}</p></section>`
      }
      return `<section><h2>${e(block.title)}</h2>${
        block.rows.length === 0
          ? `<p class="def">${e(block.empty)}</p>`
          : `<table><thead><tr>${block.columns
              .map((c) => `<th class="${c.num ? 'num' : ''}">${e(c.label)}</th>`)
              .join('')}</tr></thead><tbody>${block.rows
              .slice(0, 300)
              .map(
                (row) =>
                  `<tr>${block.columns
                    .map(
                      (c) => `<td class="${c.num ? 'num' : ''}">${e(row[c.key]?.text ?? '')}</td>`,
                    )
                    .join('')}</tr>`,
              )
              .join('')}</tbody></table>`
      }${block.definition ? `<p class="def">${e(block.definition)}</p>` : ''}</section>`
    })
    .join('')

  const definitions = result.kpis
    .map((kpi) => `<li><b>${e(kpi.label)}:</b> ${e(kpi.definition)}</li>`)
    .join('')

  return `<!doctype html><html lang="${e(meta.lang)}" dir="${meta.dir}"><head><meta charset="utf-8"><title>${e(result.title)}</title>
<style>
@page{size:A4;margin:14mm 12mm}
body{font-family:'Noto Naskh Arabic','Noto Sans','DejaVu Sans',sans-serif;color:#1c2a1f;font-size:11px;line-height:1.5}
header{border-bottom:2px solid #26552e;padding-bottom:6px;margin-bottom:10px}
h1{font-size:18px;margin:0;color:#1b3f22}h2{font-size:13px;margin:14px 0 6px;color:#1b3f22}
.meta{color:#5b675c;font-size:10.5px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.kpi{border:1px solid #e2ded4;border-radius:6px;padding:6px 8px;break-inside:avoid}
.kl{color:#5b675c;font-size:10px}.kv{font-size:14px;font-weight:700;direction:ltr;unicode-bidi:isolate}
.kc{font-size:10px;direction:ltr;unicode-bidi:isolate}.kc.good{color:#1f6b33}.kc.bad{color:#b42318}.kn{font-size:9.5px;color:#5b675c}
section{break-inside:avoid}
table{width:100%;border-collapse:collapse;font-size:10px}th,td{border-bottom:1px solid #e2ded4;padding:3px 4px;text-align:start}
th{background:#f1eee7}.num{text-align:end;direction:ltr;unicode-bidi:isolate}
.bar{display:grid;grid-template-columns:38% 1fr 30%;gap:6px;align-items:center;margin:2px 0}
.bt{background:#f1eee7;border-radius:3px;height:9px;overflow:hidden}.bf{display:block;height:9px;background:#26552e}
.bv{font-size:10px;direction:ltr;unicode-bidi:isolate;text-align:end}
.def{color:#5b675c;font-size:9.5px;margin:4px 0 0}
.legend{font-size:10px;color:#3a4a3d}.sw{display:inline-block;width:14px;height:3px;vertical-align:middle;margin-inline-end:4px}
.sw.cur{background:#26552e}.sw.prev{background:repeating-linear-gradient(90deg,#8a948b 0 4px,transparent 4px 7px)}
ul.defs{padding-inline-start:16px;color:#3a4a3d;font-size:9.5px}
</style></head><body>
<header><h1>${e(result.title)}</h1><div class="meta">${e(meta.brand)} · ${e(labels.period)}: ${e(meta.period)}${
    meta.compared ? ` · ${e(labels.comparedWith)}: ${e(meta.compared)}` : ''
  } · ${e(labels.generated)}: ${e(meta.generatedAt)}</div></header>
<div class="kpis">${kpis}</div>
${blocks}
<h2>${e(labels.definition)}</h2><ul class="defs">${definitions}${result.notes
    .map((n) => `<li>${e(n)}</li>`)
    .join('')}</ul>
</body></html>`
}
