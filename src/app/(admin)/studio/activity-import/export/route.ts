import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { sheetResponse } from '../respond'
import { loadContext, loadStored, storedToSheets } from '../sheet'

/**
 * «تصدير الأنشطة»: every activity (not archived-deleted) with its packages,
 * add-ons and questions, in the import format. `?ids=a,b` exports a
 * selection, `?status=published` one status; `?format=csv` for CSV.
 */
export async function GET(request: Request): Promise<Response> {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const params = new URL(request.url).searchParams
  const format = params.get('format') === 'csv' ? 'csv' : 'xlsx'
  const ids = (params.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  const status = params.get('status')
  const ctx = await loadContext()
  const stored = await loadStored(ctx, ids.length > 0 ? { ids } : null)
  const items = [...stored.values()].filter((item) => !status || item.row.status === status)
  const data = storedToSheets(items)
  // An empty export still opens: without rows it falls back to the examples,
  // so say «export» in the name to tell it from the template.
  return sheetResponse('activities-export', format, data, t, ctx)
}
