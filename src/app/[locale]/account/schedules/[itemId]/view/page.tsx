/**
 * عرض جدول PDF داخل الموقع.
 *
 * الصفحة نفسها لا تفحص الملكية — `../file` يفعل ذلك عند كل جلب، فلا يمكن
 * لعنوان الصفحة أن يكشف شيئاً. هنا فقط: مستخدم مسجّل، وسطر العلامة المائية.
 */

import { and, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton } from '@/components/shared'
import { db } from '@/db'
import { orderItems, orders } from '@/db/schema'
import { getPathname } from '@/i18n/routing'
import { contactLabel } from '@/lib/auth/phone'
import { requireActiveUser } from '@/lib/security/require'

import { toLocale } from '../../../../_seo-hreflang'
import { accountMetadata } from '../../../_lib/meta'
import { SecurePdfViewer } from './secure-pdf-viewer'
import { viewerWatermark } from './watermark'

type PageParams = Promise<{ locale: string; itemId: string }>

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_sched')
}

export default async function ScheduleViewPage({ params }: { params: PageParams }) {
  const { locale: raw, itemId } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const user = await requireActiveUser('account:schedule_view')

  const src = getPathname({ href: `/account/schedules/${encodeURIComponent(itemId)}/file`, locale })
  // الوثيقة 16.3/17: العلامة فوق العارض تحمل رقم الطلب أيضاً. البحث مقصور على
  // طلبات هذا المستخدم؛ ملكية الملف نفسه يفحصها `../file` عند الجلب.
  const [order] = UUID.test(itemId)
    ? await db
        .select({ orderNumber: orders.orderNumber })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orderItems.id, itemId), eq(orders.userId, user.id)))
        .limit(1)
    : []
  const watermark = viewerWatermark(contactLabel(user), order?.orderNumber ?? null)

  return (
    <section aria-labelledby="bt-acct-view-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-view-h">{t('acct_view_t')}</h1>
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
