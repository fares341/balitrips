import Link from 'next/link'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { ImportForm } from './import-form'

export const dynamic = 'force-dynamic'

/** Activities ⇄ spreadsheet: template, export, upload with a preview. */
export default async function ActivityImportPage() {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  return (
    <>
      <PageHead
        title={t('sh.title')}
        description={t('sh.description')}
        actions={
          <>
            <a className="a-btn ghost" href={adminHref('/activity-import/template')}>
              {t('sh.download_template')}
            </a>
            <a className="a-btn ghost" href={adminHref('/activity-import/template?format=csv')}>
              {t('sh.download_template_csv')}
            </a>
            <a className="a-btn ghost" href={adminHref('/activity-import/export')}>
              {t('sh.export')}
            </a>
            <Link className="a-btn ghost" href={adminHref('/activities')}>
              {t('activities.back_to_list')}
            </Link>
          </>
        }
      />
      <div className="a-card">
        <h2>{t('av2.imp_how')}</h2>
        <ol>
          <li>{t('sh.step1')}</li>
          <li>{t('sh.step2')}</li>
          <li>{t('sh.step3')}</li>
        </ol>
        <p className="a-hint">{t('sh.rules')}</p>
      </div>
      <ImportForm />
    </>
  )
}
