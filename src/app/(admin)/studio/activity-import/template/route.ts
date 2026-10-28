import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { sheetResponse } from '../respond'
import { loadContext } from '../sheet'

/**
 * «تحميل قالب»: the empty workbook (.xlsx, default) or CSV (`?format=csv`),
 * one example row per sheet (skipped on import: its slug starts «example-»).
 */
export async function GET(request: Request): Promise<Response> {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const ctx = await loadContext()
  return sheetResponse(
    'activities-template',
    format,
    { activities: [], packages: [], addons: [], faq: [] },
    t,
    ctx,
  )
}
