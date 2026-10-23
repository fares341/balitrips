import Link from 'next/link'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { ImportForm } from './import-form'

export const dynamic = 'force-dynamic'

/** Bulk import of activities from the CSV template (client spec §15). */
export default async function ActivityImportPage() {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  return (
    <>
      <PageHead
        title={t('av2.imp_title')}
        description={t('av2.imp_description')}
        actions={
          <>
            <a className="a-btn ghost" href={adminHref('/activity-import/template')}>
              {t('av2.imp_template')}
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
          <li>{t('av2.imp_step1')}</li>
          <li>{t('av2.imp_step2')}</li>
          <li>{t('av2.imp_step3')}</li>
        </ol>
        <p className="a-hint">{t('av2.imp_rules')}</p>
      </div>
      <ImportForm />
    </>
  )
}
