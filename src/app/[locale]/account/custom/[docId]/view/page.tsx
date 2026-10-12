/** عرض جدول مخصص داخل الموقع — نفس العارض الآمن، مصدره `../file`. */

import { and, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton } from '@/components/shared'
import { db } from '@/db'
import { customTripDocuments, customTripRequests } from '@/db/schema'
import { getPathname } from '@/i18n/routing'
import { contactLabel } from '@/lib/auth/phone'
import { requireActiveUser } from '@/lib/security/require'

import { toLocale } from '../../../../_seo-hreflang'
import { accountMetadata } from '../../../_lib/meta'
import { SecurePdfViewer } from '../../../schedules/[itemId]/view/secure-pdf-viewer'
import { viewerWatermark } from '../../../schedules/[itemId]/view/watermark'

type PageParams = Promise<{ locale: string; docId: string }>

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_sched')
}

export default async function CustomPlanViewPage({ params }: { params: PageParams }) {
  const { locale: raw, docId } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const t = await getTranslations({ locale })
  const user = await requireActiveUser('account:custom_view')

  const src = getPathname({ href: `/account/custom/${encodeURIComponent(docId)}/file`, locale })
  // نفس رقم الطلب المختوم في الملف (`CT-<8 أحرف من معرّف الطلب>`، schedule-file.ts).
  const [request] = UUID.test(docId)
    ? await db
        .select({ requestId: customTripDocuments.requestId })
        .from(customTripDocuments)
        .innerJoin(customTripRequests, eq(customTripRequests.id, customTripDocuments.requestId))
        .where(and(eq(customTripDocuments.id, docId), eq(customTripRequests.userId, user.id)))
        .limit(1)
    : []
  const watermark = viewerWatermark(
    contactLabel(user),
    request ? `CT-${request.requestId.slice(0, 8).toUpperCase()}` : null,
  )

  return (
    <section aria-labelledby="bt-acct-cview-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-cview-h">{t('acct_custom_t')}</h1>
        <LinkButton href="/account/schedules" variant="ghost" size="sm">
          {t('acct_view_back')}
        </LinkButton>
      </div>
      <p className="muted" style={{ marginBlockEnd: 16, maxWidth: '60ch' }}>
        {t('acct_view_notice')}
      </p>
      <SecurePdfViewer
        src={src}
        watermark={watermark}
        labels={{
          loading: t('acct_view_loading'),
          error: t('acct_view_error'),
          printBlocked: t('acct_view_print'),
          page: t('acct_view_page'),
        }}
      />
    </section>
  )
}
