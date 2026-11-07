import Link from 'next/link'

import { SITE_PAGES } from '@/lib/content/page-content'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { readSetting } from '../../_lib/settings'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Pill } from '../../_ui/table'

export const dynamic = 'force-dynamic'

/** «محتوى الموقع» — one card per public page; each opens its own screen. */
export default async function SiteContentIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const content = await readSetting('pageContent')

  return (
    <>
      <PageHead title={t('sc.title')} description={t('sc.description')} />
      <Flash searchParams={params} />
      <div className="sc-grid">
        <Link className="a-card sc-card" href={adminHref('/home-content')}>
          <b>{t('nav.home_content')}</b>
          <span className="a-hint">{t('sc.home_hint')}</span>
        </Link>
        {SITE_PAGES.map((page) => {
          const hidden = content.pages[page.id]?.hidden?.length ?? 0
          return (
            <Link
              key={page.id}
              className="a-card sc-card"
              href={adminHref(`/site-content/${page.id}`)}
            >
              <b>{t(`sc.page_${page.id}`)}</b>
              <span className="a-hint">{t(`sc.page_${page.id}_hint`)}</span>
              {hidden > 0 ? <Pill tone="warn">{t('sc.hidden_n', { n: hidden })}</Pill> : null}
            </Link>
          )
        })}
        <Link className="a-card sc-card" href={adminHref('/translations')}>
          <b>{t('translations.title')}</b>
          <span className="a-hint">{t('sc.translations_hint')}</span>
        </Link>
      </div>
    </>
  )
}
