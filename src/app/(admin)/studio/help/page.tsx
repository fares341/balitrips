import { adminBasePath } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { GuidesList } from './guides-list'

export const dynamic = 'force-dynamic'

/** «دليل لوحة التحكم»: every screen guide, searchable, in ar / en / id. */
export default async function HelpPage() {
  await requireCapability('admin.access')
  const { t } = await getAdminI18n()
  return (
    <>
      <PageHead title={t('help.page_title')} description={t('help.page_description')} />
      <GuidesList base={adminBasePath()} />
    </>
  )
}
