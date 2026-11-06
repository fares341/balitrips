import type { Role } from '@/lib/auth/roles'
import { mayExportListing, type ListingKind } from '@/lib/reports/listing'

import { adminHref } from '../_lib/admin-path'
import { uiI18n } from './i18n-server'

/**
 * «تصدير PDF» beside a screen's CSV button. Carries the screen's filters
 * (`from`, `to`, `status`, `q`) and where to come back to; shown only to a
 * role that may make this PDF.
 */
export async function PdfExportButton({
  kind,
  role,
  searchParams,
  back,
  label,
}: {
  kind: ListingKind
  role: Role
  searchParams: Record<string, string | string[] | undefined>
  back: string
  label?: string
}) {
  if (!mayExportListing(role, kind)) return null
  const { t } = await uiI18n()
  const query = new URLSearchParams()
  for (const key of ['from', 'to', 'status', 'q'] as const) {
    const value = searchParams[key]
    if (typeof value === 'string' && value.trim() !== '') query.set(key, value)
  }
  query.set('back', back)
  return (
    <a className="a-btn ghost" href={`${adminHref(`/pdf/${kind}`)}?${query.toString()}`}>
      {label ?? t('pdf.export')}
    </a>
  )
}
