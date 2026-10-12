/**
 * PDF templates.
 *
 * Pure string builders: localized data in, a complete self-contained HTML
 * document out. No database, no environment, no network.
 *
 * SELF-CONTAINED IS A HARD REQUIREMENT. Gotenberg runs with
 * `--chromium-allow-list=file:///tmp/.*`, so any remote font, stylesheet or
 * image is simply not fetched and the document renders without it. That is
 * the SSRF protection working as intended — these documents are built from
 * admin-authored content, and a `<img src="http://169.254.169.254/…">` in a
 * description must not turn the renderer into a proxy for the droplet's
 * metadata service. Everything below is inline.
 *
 * ARABIC. The container must have **Noto Naskh Arabic** available (Debian:
 * `fonts-noto-core`). The stack below names it first for RTL documents and
 * falls back through the other Noto Arabic faces; with no Arabic face at all
 * Chromium emits tofu, and — worse — a Latin fallback renders the code points
 * unshaped and left-to-right, which looks like text and is not.
 *
 * Unlike the email templates, this markup CAN use logical properties without
 * a physical fallback: the only renderer is a current Chromium, which
 * supports `padding-inline-start`, `border-inline-start` and `text-align:
 * start` fully. Mirroring is therefore automatic from `dir` alone.
 */

import { localeConfig, type Locale } from '@/i18n/config'
import { escapeHtml } from '@/lib/email/render'

const COLOR = {
  ink: '#1c2a1f',
  forest: '#1b3f22',
  muted: '#6e7b6f',
  line: '#e4e0d8',
  accent: '#e07e00',
  wash: '#f6f4f0',
} as const

const LATIN_STACK = "'Noto Sans','DejaVu Sans','Liberation Sans',Arial,sans-serif"
const ARABIC_STACK = "'Noto Naskh Arabic','Noto Sans Arabic','Noto Kufi Arabic',serif"

function baseStyles(locale: Locale): string {
  const { dir } = localeConfig[locale]
  const family = dir === 'rtl' ? ARABIC_STACK : LATIN_STACK
  // Arabic script has a taller x-height relative to Latin at the same point
  // size, so an Arabic document set at the Latin size reads cramped.
  const bodySize = dir === 'rtl' ? '11.5pt' : '10.5pt'
  const lineHeight = dir === 'rtl' ? '1.85' : '1.65'

  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ${family};
      font-size: ${bodySize};
      line-height: ${lineHeight};
      color: ${COLOR.ink};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .wordmark {
      font-size: 9pt;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: ${COLOR.accent};
      font-weight: 700;
      margin: 0 0 6mm;
      text-align: start;
    }
    h1 {
      font-size: 22pt;
      line-height: 1.2;
      margin: 0 0 3mm;
      color: ${COLOR.forest};
      text-align: start;
    }
    h2 {
      font-size: 12pt;
      margin: 0 0 2mm;
      color: ${COLOR.forest};
      text-align: start;
    }
    p { margin: 0 0 3mm; text-align: start; }
    .lede { font-size: 11pt; color: ${COLOR.muted}; margin: 0 0 6mm; }
    .meta {
      display: flex;
      gap: 6mm;
      flex-wrap: wrap;
      font-size: 9pt;
      color: ${COLOR.muted};
      border-block: 1px solid ${COLOR.line};
      padding-block: 3mm;
      margin: 0 0 8mm;
    }
    .day {
      /* Never split a day across a page break — the whole point of the
         document is that one day fits on one glance. */
      break-inside: avoid;
      page-break-inside: avoid;
      padding-inline-start: 12mm;
      padding-block: 0 6mm;
      position: relative;
      border-inline-start: 1px solid ${COLOR.line};
      margin-inline-start: 4mm;
    }
    .day:last-child { border-inline-start-color: transparent; }
    .day-number {
      position: absolute;
      inset-inline-start: -4mm;
      inset-block-start: 0;
      width: 8mm;
      height: 8mm;
      border-radius: 50%;
      background: ${COLOR.accent};
      color: #fff;
      font-size: 8pt;
      font-weight: 700;
      line-height: 8mm;
      text-align: center;
    }
    .day-label { font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: ${COLOR.muted}; margin: 0 0 1mm; }
    .day-area { font-size: 9pt; color: ${COLOR.muted}; margin: 0 0 2mm; }
    .free-day { color: ${COLOR.muted}; font-style: italic; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 6mm; }
    th {
      font-size: 8.5pt;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${COLOR.muted};
      border-bottom: 1px solid ${COLOR.line};
      padding: 0 0 2mm;
      text-align: start;
      font-weight: 600;
    }
    td { padding: 3mm 0; border-bottom: 1px solid ${COLOR.line}; vertical-align: top; text-align: start; }
    .numeric { text-align: end; white-space: nowrap; }
    .total td { border-bottom: none; font-weight: 700; color: ${COLOR.forest}; padding-block-start: 4mm; }
    .callout {
      background: ${COLOR.wash};
      border-radius: 3mm;
      padding: 5mm;
      margin: 0 0 6mm;
      font-size: 10pt;
    }
    .fine {
      font-size: 8.5pt;
      color: ${COLOR.muted};
      border-block-start: 1px solid ${COLOR.line};
      padding-block-start: 3mm;
      margin-block-start: 8mm;
      text-align: start;
    }
  `
}

function documentShell(locale: Locale, title: string, body: string): string {
  const { dir } = localeConfig[locale]
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>${baseStyles(locale)}</style>
  </head>
  <body dir="${dir}">
${body}
  </body>
</html>`
}

/* --------------------------------------------------------------------------
   Itinerary
   -------------------------------------------------------------------------- */

export interface ItineraryPdfDay {
  dayNumber: number
  /** Authored title, or the linked activity's name. Null on a free day. */
  title: string | null
  description: string | null
  area: string | null
  isFreeDay: boolean
}

export interface ItineraryPdfInput {
  locale: Locale
  /** Localized itinerary name. */
  name: string
  blurb: string | null
  version: number
  days: readonly ItineraryPdfDay[]
  /** Pre-formatted, already localized. */
  labels: {
    brand: string
    dayByDay: string
    dayNumber: (n: number) => string
    freeDay: string
    version: string
    generated: string
    confidential: string
    daysCount: string
  }
}

export function itineraryPdfHtml(input: ItineraryPdfInput): string {
  const { labels } = input

  const days = input.days
    .map((day) => {
      const heading =
        day.isFreeDay && (day.title === null || day.title.trim() === '')
          ? `<h2 class="free-day">${escapeHtml(labels.freeDay)}</h2>`
          : `<h2>${escapeHtml(day.title ?? labels.freeDay)}</h2>`

      return `      <section class="day">
        <span class="day-number">${escapeHtml(String(day.dayNumber))}</span>
        <p class="day-label">${escapeHtml(labels.dayNumber(day.dayNumber))}</p>
        ${heading}
        ${day.area === null ? '' : `<p class="day-area">${escapeHtml(day.area)}</p>`}
        ${day.description === null ? '' : `<p>${escapeHtml(day.description)}</p>`}
      </section>`
    })
    .join('\n')

  const body = `    <p class="wordmark">${escapeHtml(labels.brand)}</p>
    <h1>${escapeHtml(input.name)}</h1>
    ${input.blurb === null ? '' : `<p class="lede">${escapeHtml(input.blurb)}</p>`}
    <div class="meta">
      <span>${escapeHtml(labels.daysCount)}</span>
      <span>${escapeHtml(labels.version)}</span>
      <span>${escapeHtml(labels.generated)}</span>
    </div>
    <h2>${escapeHtml(labels.dayByDay)}</h2>
${days}
    <p class="fine">${escapeHtml(labels.confidential)}</p>`

  return documentShell(input.locale, input.name, body)
}

/* --------------------------------------------------------------------------
   Voucher
   -------------------------------------------------------------------------- */

export interface VoucherPdfLine {
  name: string
  detail: string | null
  quantity: string
  amount: string
}

export interface VoucherPdfInput {
  locale: Locale
  orderNumber: string
  travellerName: string
  lines: readonly VoucherPdfLine[]
  totalLabel: string
  totalAmount: string
  labels: {
    brand: string
    title: string
    intro: string
    orderNumber: string
    traveller: string
    placed: string
    placedValue: string
    columnItem: string
    columnQuantity: string
    columnAmount: string
    confidential: string
  }
}

export function voucherPdfHtml(input: VoucherPdfInput): string {
  const { labels } = input

  const rows = input.lines
    .map(
      (line) => `      <tr>
        <td>${escapeHtml(line.name)}${
          line.detail === null ? '' : `<br><span class="day-area">${escapeHtml(line.detail)}</span>`
        }</td>
        <td class="numeric">${escapeHtml(line.quantity)}</td>
        <td class="numeric">${escapeHtml(line.amount)}</td>
      </tr>`,
    )
    .join('\n')

  const body = `    <p class="wordmark">${escapeHtml(labels.brand)}</p>
    <h1>${escapeHtml(labels.title)}</h1>
    <div class="meta">
      <span>${escapeHtml(labels.orderNumber)}: ${escapeHtml(input.orderNumber)}</span>
      <span>${escapeHtml(labels.traveller)}: ${escapeHtml(input.travellerName)}</span>
      <span>${escapeHtml(labels.placed)}: ${escapeHtml(labels.placedValue)}</span>
    </div>
    <div class="callout">${escapeHtml(labels.intro)}</div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(labels.columnItem)}</th>
          <th class="numeric">${escapeHtml(labels.columnQuantity)}</th>
          <th class="numeric">${escapeHtml(labels.columnAmount)}</th>
        </tr>
      </thead>
      <tbody>
${rows}
        <tr class="total">
          <td colspan="2">${escapeHtml(input.totalLabel)}</td>
          <td class="numeric">${escapeHtml(input.totalAmount)}</td>
        </tr>
      </tbody>
    </table>
    <p class="fine">${escapeHtml(labels.confidential)}</p>`

  return documentShell(input.locale, `${labels.title} ${input.orderNumber}`, body)
}
