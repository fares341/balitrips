import 'server-only'

import type { Translate } from '../../_i18n'
import { buildCsv, buildWorkbook, type Context, type SheetData } from './sheet'

export async function sheetResponse(
  name: string,
  format: 'xlsx' | 'csv',
  data: SheetData,
  t: Translate,
  ctx: Context,
): Promise<Response> {
  const stamp = new Date().toISOString().slice(0, 10)
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  }
  if (format === 'csv') {
    return new Response(buildCsv(data), {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}-${stamp}.csv"`,
      },
    })
  }
  const body = await buildWorkbook(data, t, ctx)
  return new Response(new Uint8Array(body), {
    headers: {
      ...headers,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}-${stamp}.xlsx"`,
    },
  })
}
