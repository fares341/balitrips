/**
 * Email rendering.
 *
 * Mail is not the web. There is no external stylesheet, no `<link>`, no
 * flexbox worth relying on, and Outlook still lays out through Word. So every
 * template here is a single-column table with inline styles, and it is built
 * from a small block model that emits the HTML **and** the plain-text part
 * from one description — the two can never drift apart, which is the usual
 * way the text alternative rots into a stale copy of last year's copy.
 *
 * RTL, which is the part most senders get wrong:
 *
 *  1. `dir` is set on `<html>` AND on the container table. Several clients
 *     (Gmail's web view among them) strip the outer document and re-host the
 *     body, taking `<html dir>` with it. The container has to carry it too.
 *  2. Direction-neutral spacing. Padding is symmetric everywhere, so a client
 *     that drops a rule cannot produce a lopsided layout.
 *  3. Where a side genuinely matters, the physical value is emitted FIRST and
 *     the logical keyword second: `text-align:right;text-align:start`. A
 *     client that understands `start` uses it; Word ignores it and keeps the
 *     physical value, which was computed from the same `dir`. Emitting only
 *     the logical form would silently left-align the entire Arabic email in
 *     Outlook.
 *  4. Column order is source order. With `dir="rtl"` on a table the cells
 *     mirror themselves, so the item/quantity/price columns need no
 *     per-locale branching.
 */

import { localeConfig, type Locale } from '@/i18n/config'

/**
 * Palette, mirrored from `src/styles/tokens.css`.
 *
 * Duplicated deliberately: CSS custom properties do not survive an email
 * client, so these have to be literal hex. If the brand colours change, both
 * files move together.
 */
const COLOR = {
  page: '#f6f4f0',
  card: '#fffbf8',
  ink: '#1c2a1f',
  forest: '#1b3f22',
  muted: '#6e7b6f',
  line: '#e4e0d8',
  accent: '#e07e00',
  accentText: '#fffbf8',
} as const

const LATIN_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
/**
 * Arabic needs a stack that actually contains an Arabic face on each
 * platform: Segoe UI on Windows, Geeza Pro on Apple, Tahoma as the ancient
 * fallback. Falling through to a Latin-only face renders disconnected
 * letterforms rather than nothing, which is worse — it looks like text.
 */
const ARABIC_STACK = "'Segoe UI','Geeza Pro',Tahoma,Arial,sans-serif"

export type Dir = 'ltr' | 'rtl'

/**
 * Minimal HTML escaping.
 *
 * Every value interpolated below is user-, admin- or provider-controlled: a
 * display name, an itinerary title an editor typed, a callback URL. Escaping
 * at the one point of interpolation is far cheaper to audit than trusting
 * each call site to have remembered.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** See rule 3 in the header: physical fallback first, logical keyword second. */
function align(dir: Dir, side: 'start' | 'end'): string {
  const physical =
    side === 'start' ? (dir === 'rtl' ? 'right' : 'left') : dir === 'rtl' ? 'left' : 'right'
  return `text-align:${physical};text-align:${side}`
}

/* --------------------------------------------------------------------------
   Blocks
   -------------------------------------------------------------------------- */

export interface FactRow {
  label: string
  value: string
}

export interface LineItemRow {
  name: string
  /** Travel date, guests, vehicle — whatever distinguishes this line. */
  detail?: string
  quantity: string
  amount: string
}

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'muted'; text: string }
  | { kind: 'button'; label: string; href: string }
  | { kind: 'facts'; rows: readonly FactRow[] }
  | {
      kind: 'items'
      columns: { item: string; quantity: string; amount: string }
      rows: readonly LineItemRow[]
      totals: readonly FactRow[]
    }
  | { kind: 'divider' }

function blockHtml(block: Block, dir: Dir): string {
  const start = align(dir, 'start')
  const end = align(dir, 'end')

  switch (block.kind) {
    case 'heading':
      return `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${COLOR.forest};${start}">${escapeHtml(block.text)}</h1>`

    case 'text':
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLOR.ink};${start}">${escapeHtml(block.text)}</p>`

    case 'muted':
      return `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${COLOR.muted};${start}">${escapeHtml(block.text)}</p>`

    case 'button':
      // A table wrapper, not a bare <a>: Outlook drops padding on inline
      // anchors and the button collapses to plain underlined text.
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px" dir="${dir}">
  <tr><td style="border-radius:12px;background:${COLOR.accent}">
    <a href="${escapeHtml(block.href)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:${COLOR.accentText};text-decoration:none">${escapeHtml(block.label)}</a>
  </td></tr>
</table>`

    case 'facts':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="margin:0 0 20px;border-collapse:collapse">
${block.rows
  .map(
    (row) => `  <tr>
    <td style="padding:6px 0;font-size:13px;color:${COLOR.muted};${start}">${escapeHtml(row.label)}</td>
    <td style="padding:6px 0;font-size:14px;font-weight:600;color:${COLOR.ink};${end}">${escapeHtml(row.value)}</td>
  </tr>`,
  )
  .join('\n')}
</table>`

    case 'items':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="margin:0 0 20px;border-collapse:collapse">
  <tr>
    <th style="padding:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.muted};border-bottom:1px solid ${COLOR.line};${start}">${escapeHtml(block.columns.item)}</th>
    <th style="padding:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.muted};border-bottom:1px solid ${COLOR.line};${end}">${escapeHtml(block.columns.quantity)}</th>
    <th style="padding:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.muted};border-bottom:1px solid ${COLOR.line};${end}">${escapeHtml(block.columns.amount)}</th>
  </tr>
${block.rows
  .map(
    (row) => `  <tr>
    <td style="padding:12px 0;font-size:14px;line-height:1.5;color:${COLOR.ink};border-bottom:1px solid ${COLOR.line};${start}">${escapeHtml(row.name)}${
      row.detail === undefined
        ? ''
        : `<br><span style="font-size:12px;color:${COLOR.muted}">${escapeHtml(row.detail)}</span>`
    }</td>
    <td style="padding:12px 0;font-size:14px;color:${COLOR.muted};border-bottom:1px solid ${COLOR.line};${end}">${escapeHtml(row.quantity)}</td>
    <td style="padding:12px 0;font-size:14px;font-weight:600;color:${COLOR.ink};border-bottom:1px solid ${COLOR.line};${end}">${escapeHtml(row.amount)}</td>
  </tr>`,
  )
  .join('\n')}
${block.totals
  .map(
    (total, index) => `  <tr>
    <td colspan="2" style="padding:${index === 0 ? '14px' : '4px'} 0 4px;font-size:14px;color:${COLOR.muted};${start}">${escapeHtml(total.label)}</td>
    <td style="padding:${index === 0 ? '14px' : '4px'} 0 4px;font-size:15px;font-weight:700;color:${COLOR.forest};${end}">${escapeHtml(total.value)}</td>
  </tr>`,
  )
  .join('\n')}
</table>`

    case 'divider':
      return `<hr style="border:none;border-top:1px solid ${COLOR.line};margin:24px 0">`
  }
}

function blockText(block: Block): string[] {
  switch (block.kind) {
    case 'heading':
    case 'text':
    case 'muted':
      return [block.text]
    case 'button':
      return [`${block.label}: ${block.href}`]
    case 'facts':
      return block.rows.map((row) => `${row.label}: ${row.value}`)
    case 'items':
      return [
        ...block.rows.map((row) =>
          [row.name, row.detail, `x${row.quantity}`, row.amount].filter(Boolean).join(' — '),
        ),
        ...block.totals.map((total) => `${total.label}: ${total.value}`),
      ]
    case 'divider':
      return ['---']
  }
}

/* --------------------------------------------------------------------------
   Document
   -------------------------------------------------------------------------- */

export interface EmailDocument {
  locale: Locale
  /** Inbox preview line. Without one, clients show the first link's URL. */
  preheader: string
  blocks: readonly Block[]
  /** Small print under the divider at the bottom. */
  footer: readonly string[]
}

export function renderDocument(document: EmailDocument): { html: string; text: string } {
  const { dir } = localeConfig[document.locale]
  const font = dir === 'rtl' ? ARABIC_STACK : LATIN_STACK
  const start = align(dir, 'start')

  const body = document.blocks.map((block) => blockHtml(block, dir)).join('\n          ')

  const footer = document.footer
    .map(
      (line) =>
        `<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${COLOR.muted};${start}">${escapeHtml(line)}</p>`,
    )
    .join('\n            ')

  const html = `<!doctype html>
<html lang="${document.locale}" dir="${dir}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(document.preheader)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLOR.page};font-family:${font};color:${COLOR.ink}" dir="${dir}">
    <!-- Preheader: shown in the inbox list, never in the message itself. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(document.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="background:${COLOR.page}">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="max-width:560px;background:${COLOR.card};border-radius:16px;border:1px solid ${COLOR.line}">
            <tr>
              <td style="padding:32px">
          ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px">
                <hr style="border:none;border-top:1px solid ${COLOR.line};margin:0 0 16px">
            ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    ...document.blocks.flatMap((block) => blockText(block)),
    '---',
    ...document.footer,
  ].join('\n\n')

  return { html, text }
}
