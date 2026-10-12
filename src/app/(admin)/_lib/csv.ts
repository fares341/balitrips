/**
 * تصدير تقارير CSV من لوحة التحكم (الوثيقة 21.8 "تصدير التقارير").
 *
 * - كل خلية مقتبسة، و`=` `+` `-` `@` في أولها تُسبق بـ `'` (حقن صيغ Excel/Sheets).
 * - BOM في البداية كي يفتح Excel الملف بـ UTF-8 (أسماء عربية).
 * - `no-store`: تقرير فيه بيانات عملاء لا يُخزَّن في أي كاش وسيط.
 */

export const CSV_MAX_ROWS = 50_000

export function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function csvBody(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

export function csvResponse(
  name: string,
  header: readonly string[],
  rows: readonly (readonly unknown[])[],
): Response {
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(csvBody(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${stamp}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
