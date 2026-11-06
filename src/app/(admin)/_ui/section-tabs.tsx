import { adminHref } from '../_lib/admin-path'
import { canOpen } from '../_lib/route-access'
import { getAdminSession } from '../_lib/session'
import { uiI18n } from './i18n-server'
import { SECTION_TABS, type SectionTab, type TabSection } from './nav'
import { TabLinks } from './tab-links'

/**
 * The tab bar of a Studio section (Itineraries, Places, Activities, Reports,
 * Assistant), rendered by the section's `layout.tsx`. Tabs the viewer cannot
 * open are left out; a bar with a single tab is not shown at all.
 */
export async function SectionTabs({ section }: { section: TabSection }) {
  const session = await getAdminSession()
  if (!session) return null
  const { t } = await uiI18n()
  const tabs = (SECTION_TABS[section] as readonly SectionTab[])
    .filter((tab) => canOpen(session.role, tab.path))
    .map((tab) => ({
      href: adminHref(tab.path),
      label: t(tab.labelKey),
      exact: tab.exact ?? false,
    }))
  if (tabs.length < 2) return null
  return <TabLinks tabs={tabs} label={t(`tabs.section_${section}`)} />
}
