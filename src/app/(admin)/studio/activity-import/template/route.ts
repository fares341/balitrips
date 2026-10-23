import { IMPORT_COLUMNS, IMPORT_EXAMPLE } from '@/lib/content/activity-import'

import { csvResponse } from '../../../_lib/csv'
import { requireCapability } from '../../../_lib/session'

/** The CSV import template (UTF-8 with BOM, opens in Excel): header + one example of each row type. */
export async function GET(): Promise<Response> {
  await requireCapability('content.write')
  return csvResponse(
    'activities-import-template',
    IMPORT_COLUMNS,
    IMPORT_EXAMPLE.map((row) => IMPORT_COLUMNS.map((column) => row[column] ?? '')),
  )
}
