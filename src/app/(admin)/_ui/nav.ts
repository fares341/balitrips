import type { IconName } from './icons'

/**
 * Sidebar, section tabs and command palette — one map of the Studio.
 *
 * Nothing here declares a capability. Whether a person sees a link is
 * decided by `canOpen(role, path)` (`_lib/route-access.ts`), the same table
 * the pages are tested against, so a link is shown exactly to the people the
 * page behind it will open for. That is presentation only — every page still
 * calls `requireCapability()` itself, because a hidden link is not a
 * permission check.
 *
 * Labels are dictionary keys (`_i18n/*`), resolved in the Shell with the
 * active Studio language; the palette also searches the other language.
 */

export interface NavItem {
  /** Path relative to the configured admin base. */
  path: string
  labelKey: string
  icon?: IconName
  /** Marks the section root so a nested detail page still highlights it. */
  exact?: boolean
  /** Extra search words (dictionary key) for the command palette. */
  keywordsKey?: string
}

export interface NavGroup {
  /** Stable id: the collapsed/open state is remembered under it. */
  id: string
  titleKey: string
  items: readonly NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'overview',
    titleKey: 'nav.group_overview',
    items: [
      { path: '', labelKey: 'nav.dashboard', icon: 'home', exact: true },
      { path: '/inbox', labelKey: 'nav.inbox', icon: 'inbox' },
      { path: '/reports', labelKey: 'nav.reports', icon: 'pulse' },
      { path: '/assistant', labelKey: 'nav.assistant', icon: 'sparkle', exact: true },
      { path: '/help', labelKey: 'nav.help', icon: 'info' },
    ],
  },
  {
    id: 'bookings',
    titleKey: 'nav.group_commerce',
    items: [
      { path: '/orders', labelKey: 'nav.orders', icon: 'bag' },
      { path: '/payments', labelKey: 'nav.payments', icon: 'card' },
      { path: '/leads', labelKey: 'nav.leads', icon: 'message' },
      { path: '/entitlements', labelKey: 'nav.entitlements', icon: 'key' },
      { path: '/discounts', labelKey: 'nav.discounts', icon: 'tag' },
      { path: '/guide', labelKey: 'nav.guide', icon: 'info' },
    ],
  },
  {
    id: 'operations',
    titleKey: 'nav.group_operations',
    items: [
      { path: '/vehicles', labelKey: 'nav.vehicles', icon: 'car' },
      { path: '/suppliers', labelKey: 'nav.suppliers', icon: 'box' },
      { path: '/payables', labelKey: 'nav.payables', icon: 'card' },
    ],
  },
  {
    id: 'people',
    titleKey: 'nav.group_people',
    items: [
      { path: '/customers', labelKey: 'nav.customers', icon: 'users' },
      { path: '/tasks', labelKey: 'nav.tasks', icon: 'check' },
      { path: '/support', labelKey: 'nav.support', icon: 'send' },
      { path: '/assistant/conversations', labelKey: 'nav.conversations', icon: 'message' },
      { path: '/duplicates', labelKey: 'nav.duplicates', icon: 'users' },
    ],
  },
  {
    id: 'catalog',
    titleKey: 'nav.group_catalog',
    items: [
      { path: '/itineraries', labelKey: 'nav.itineraries', icon: 'route' },
      { path: '/activities', labelKey: 'nav.activities', icon: 'compass' },
      { path: '/addons', labelKey: 'nav.addons', icon: 'plus' },
      { path: '/packages', labelKey: 'nav.packages', icon: 'box' },
      { path: '/places', labelKey: 'nav.places', icon: 'pin' },
      { path: '/articles', labelKey: 'nav.articles', icon: 'article' },
      { path: '/landmarks', labelKey: 'nav.landmarks', icon: 'landmark' },
      { path: '/reviews', labelKey: 'nav.reviews', icon: 'star' },
      { path: '/taxonomy', labelKey: 'nav.taxonomy', icon: 'tag' },
      { path: '/home-content', labelKey: 'nav.home_content', icon: 'home' },
      { path: '/media', labelKey: 'nav.media', icon: 'image' },
      { path: '/files', labelKey: 'nav.files', icon: 'file' },
      { path: '/archive', labelKey: 'nav.archive', icon: 'clipboard' },
      { path: '/readiness', labelKey: 'nav.readiness', icon: 'check' },
    ],
  },
  {
    id: 'finance',
    titleKey: 'nav.group_finance',
    items: [
      { path: '/profit', labelKey: 'nav.profit', icon: 'pulse' },
      { path: '/reconciliation', labelKey: 'nav.reconciliation', icon: 'clipboard' },
      { path: '/plans', labelKey: 'nav.plans', icon: 'layers' },
      { path: '/plans/vip', labelKey: 'nav.vip', icon: 'star' },
    ],
  },
  {
    id: 'marketing',
    titleKey: 'nav.group_marketing',
    items: [
      { path: '/marketing', labelKey: 'nav.marketing', icon: 'globe' },
      { path: '/notify', labelKey: 'nav.notify', icon: 'bell' },
      { path: '/whatsapp', labelKey: 'nav.whatsapp', icon: 'message' },
      { path: '/map-analytics', labelKey: 'nav.map_analytics', icon: 'map' },
    ],
  },
  {
    id: 'logs',
    titleKey: 'nav.group_logs',
    items: [
      { path: '/audit', labelKey: 'nav.audit', icon: 'clipboard' },
      { path: '/protection/activity', labelKey: 'nav.activity', icon: 'list' },
    ],
  },
  {
    id: 'protection',
    titleKey: 'nav.group_protection',
    items: [
      { path: '/protection', labelKey: 'nav.protection', icon: 'shield', exact: true },
      { path: '/protection/alerts', labelKey: 'nav.alerts', icon: 'alert' },
      { path: '/protection/sessions', labelKey: 'nav.sessions', icon: 'pulse' },
      { path: '/protection/devices', labelKey: 'nav.devices', icon: 'phone' },
    ],
  },
  {
    id: 'system',
    titleKey: 'nav.group_system',
    items: [
      { path: '/translations', labelKey: 'nav.translations', icon: 'globe' },
      { path: '/config', labelKey: 'nav.config', icon: 'sliders' },
      { path: '/assistant/settings', labelKey: 'nav.assistant_settings', icon: 'sparkle' },
      { path: '/team', labelKey: 'nav.team', icon: 'users' },
      { path: '/integrations', labelKey: 'nav.integrations', icon: 'layers' },
      { path: '/system', labelKey: 'nav.system', icon: 'pulse' },
    ],
  },
  {
    id: 'account',
    titleKey: 'nav.group_account',
    items: [
      // Always reachable: it is where an operator goes to fix the very thing
      // that is blocking them, so it is gated on entry, not on a capability.
      { path: '/security', labelKey: 'nav.security', icon: 'lock' },
    ],
  },
]

/**
 * Sub-tab bars, shown at the top of a section (its `layout.tsx` renders
 * `<SectionTabs section=… />`). Each tab is filtered with `canOpen` like the
 * sidebar. `match` is the path prefix that marks a tab current; the first
 * tab of a section is current only on an exact match.
 */
export interface SectionTab {
  path: string
  labelKey: string
  exact?: boolean
}

export const SECTION_TABS = {
  itineraries: [
    { path: '/itineraries', labelKey: 'tabs.itineraries_list', exact: true },
    { path: '/itineraries/pricing', labelKey: 'nav.itineraries_pricing' },
    { path: '/vehicles', labelKey: 'nav.vehicles' },
  ],
  places: [
    { path: '/places', labelKey: 'tabs.places_list', exact: true },
    { path: '/map', labelKey: 'nav.map' },
    { path: '/places/audit', labelKey: 'nav.places_audit' },
    { path: '/places/google', labelKey: 'nav.places_google' },
    { path: '/places/free-photos', labelKey: 'nav.places_free_photos' },
  ],
  activities: [
    { path: '/activities', labelKey: 'tabs.activities_list', exact: true },
    { path: '/activities/images', labelKey: 'nav.activities_images' },
    { path: '/activity-import', labelKey: 'nav.activity_import' },
  ],
  reports: [
    { path: '/reports', labelKey: 'tabs.reports_overview', exact: true },
    { path: '/reports/financial', labelKey: 'rp.r_financial' },
    { path: '/reports/bookings', labelKey: 'rp.r_bookings' },
    { path: '/reports/itineraries', labelKey: 'rp.r_itineraries' },
    { path: '/reports/vip', labelKey: 'rp.r_vip' },
    { path: '/reports/activities', labelKey: 'rp.r_activities' },
    { path: '/reports/customers', labelKey: 'rp.r_customers' },
    { path: '/reports/marketing', labelKey: 'rp.r_marketing' },
    { path: '/reports/suppliers', labelKey: 'rp.r_suppliers' },
    { path: '/reports/operations', labelKey: 'rp.r_operations' },
    { path: '/reports/records', labelKey: 'nav.reports_records' },
    { path: '/reports/exports', labelKey: 'rp.exports_title' },
    { path: '/reports/schedules', labelKey: 'rp.schedules_title' },
  ],
  assistant: [
    { path: '/assistant', labelKey: 'nav.assistant', exact: true },
    { path: '/assistant/conversations', labelKey: 'nav.conversations' },
    { path: '/assistant/settings', labelKey: 'nav.assistant_settings' },
  ],
} as const satisfies Record<string, readonly SectionTab[]>

export type TabSection = keyof typeof SECTION_TABS

/** Every screen the command palette offers: sidebar entries, then section tabs. */
export function paletteEntries(): { path: string; labelKey: string; groupKey: string }[] {
  const seen = new Set<string>()
  const out: { path: string; labelKey: string; groupKey: string }[] = []
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (seen.has(item.path)) continue
      seen.add(item.path)
      out.push({ path: item.path, labelKey: item.labelKey, groupKey: group.titleKey })
    }
  }
  for (const [section, tabs] of Object.entries(SECTION_TABS)) {
    for (const tab of tabs as readonly SectionTab[]) {
      if (seen.has(tab.path)) continue
      seen.add(tab.path)
      out.push({ path: tab.path, labelKey: tab.labelKey, groupKey: `tabs.section_${section}` })
    }
  }
  return out
}
