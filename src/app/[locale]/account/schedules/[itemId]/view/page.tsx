/**
 * عرض جدول PDF داخل الموقع.
 *
 * الصفحة نفسها لا تفحص الملكية — `../file` يفعل ذلك عند كل جلب، فلا يمكن
 * لعنوان الصفحة أن يكشف شيئاً. هنا فقط: مستخدم مسجّل، وسطر العلامة المائية.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton } from '@/components/shared'
import { getPathname } from '@/i18n/routing'
import { requireUser } from '@/lib/auth/session'

import { toLocale } from '../../../../_seo-hreflang'
import { accountMetadata } from '../../../_lib/meta'
import { SecurePdfViewer } from './secure-pdf-viewer'

type PageParams = Promise<{ locale: string; itemId: string }>

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_sched')
}

export default async function ScheduleViewPage({ params }: { params: PageParams }) {
  const { locale: raw, itemId } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const user = await requireUser()

  const src = getPathname({ href: `/account/schedules/${encodeURIComponent(itemId)}/file`, locale })
  // تاريخ ISO لا محلي: التاريخ العربي داخل سطر لاتيني يتبعثر بسبب اتجاه النص.
  const watermark = `${user.email} · ${new Date().toISOString().slice(0, 10)}`

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
