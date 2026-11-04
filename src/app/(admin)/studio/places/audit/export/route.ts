import type { NextRequest } from 'next/server'

import { adminHref } from '../../../../_lib/admin-path'
import { csvResponse } from '../../../../_lib/csv'
import { getAdminI18n } from '../../../../_lib/i18n'
import { requireCapability } from '../../../../_lib/session'
import { loadPlacesAudit } from '../data'
import { auditLang, auditT, issueLabel } from '../labels'

/** «تدقيق الأماكن» as CSV: one line per (issue, place). Catalogue data only. */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await requireCapability('content.read')
  const { locale } = await getAdminI18n()
  const lang = auditLang(request.nextUrl.searchParams.get('lang'), locale)
  const t = auditT(lang)
  const data = await loadPlacesAudit(lang, request.nextUrl.searchParams.get('hash') === '1')
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')

  const rows = data.byIssue.flatMap(({ issue, rows }) =>
    rows.map((row) => [
      issueLabel(lang, issue),
      issue,
      row.group ?? '',
      row.name,
      row.slug,
      row.category,
      row.hidden ? `${row.status} (hidden)` : row.status,
      row.detail,
      `${site}${adminHref(`/places/${row.placeId}`)}`,
    ]),
  )

  return csvResponse(
    'places-audit',
    [
      t('issue'),
      'code',
      t('group'),
      t('place'),
      'slug',
      t('category'),
      t('status'),
      t('detail'),
      t('link'),
    ],
    rows,
  )
}
