import { HELP } from '../../_help/registry'
import { adminBasePath } from '../../_lib/admin-path'
import { canOpen } from '../../_lib/route-access'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { GuidesList } from './guides-list'

export const dynamic = 'force-dynamic'

/** «دليل لوحة التحكم»: every screen guide, searchable, in ar / en / id. */
export default async function HelpPage() {
  const session = await requireCapability('admin.access')
  // Every guide is readable; the «open this screen» button only for screens this role can open.
  const openable = HELP.filter((entry) => canOpen(session.role, entry.href || '/')).map(
    (entry) => entry.id,
  )
  const { t } = await getAdminI18n()
  return (
    <>
      <PageHead title={t('help.page_title')} description={t('help.page_description')} />
      <GuidesList base={adminBasePath()} openable={openable} />
    </>
  )
}
