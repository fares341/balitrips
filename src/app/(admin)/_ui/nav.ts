import type { Capability } from '@/lib/auth/roles'

/**
 * Sidebar structure.
 *
 * Each entry declares the capability it needs, and the shell filters the
 * list with `can()` so staff never see a link they cannot open. That is
 * presentation only — the page behind every one of these calls
 * `requireCapability()` itself, because a hidden link is not a permission
 * check.
 *
 * Labels are dictionary keys (`_i18n/common.ts`, `nav.*`), resolved in the
 * Shell with the active Studio language.
 */

export interface NavItem {
  /** Path relative to the configured admin base. */
  path: string
  labelKey: string
  capability: Capability
  /** Marks the section root so a nested detail page still highlights it. */
  exact?: boolean
}

export interface NavGroup {
  titleKey: string
  items: readonly NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    titleKey: 'nav.group_overview',
    items: [
      { path: '', labelKey: 'nav.dashboard', capability: 'admin.access', exact: true },
      { path: '/inbox', labelKey: 'nav.inbox', capability: 'admin.access' },
      { path: '/notify', labelKey: 'nav.notify', capability: 'roles.write' },
    ],
  },
  {
    titleKey: 'nav.group_people',
    items: [
      { path: '/customers', labelKey: 'nav.customers', capability: 'customers.read' },
      { path: '/leads', labelKey: 'nav.leads', capability: 'leads.read' },
    ],
  },
  {
    titleKey: 'nav.group_commerce',
    items: [
      { path: '/orders', labelKey: 'nav.orders', capability: 'orders.read' },
      { path: '/payments', labelKey: 'nav.payments', capability: 'payments.read' },
      { path: '/plans', labelKey: 'nav.plans', capability: 'content.read' },
      { path: '/entitlements', labelKey: 'nav.entitlements', capability: 'customers.read' },
      { path: '/capacity', labelKey: 'nav.capacity', capability: 'capacity.write' },
    ],
  },
  {
    titleKey: 'nav.group_catalog',
    items: [
      { path: '/places', labelKey: 'nav.places', capability: 'content.read' },
      { path: '/map', labelKey: 'nav.map', capability: 'content.read' },
      { path: '/itineraries', labelKey: 'nav.itineraries', capability: 'content.read' },
      { path: '/activities', labelKey: 'nav.activities', capability: 'content.read' },
      { path: '/packages', labelKey: 'nav.packages', capability: 'content.read' },
      { path: '/articles', labelKey: 'nav.articles', capability: 'content.read' },
      { path: '/landmarks', labelKey: 'nav.landmarks', capability: 'content.read' },
      { path: '/reviews', labelKey: 'nav.reviews', capability: 'content.read' },
      { path: '/taxonomy', labelKey: 'nav.taxonomy', capability: 'content.read' },
      { path: '/media', labelKey: 'nav.media', capability: 'media.upload' },
      { path: '/files', labelKey: 'nav.files', capability: 'content.read' },
    ],
  },
  {
    titleKey: 'nav.group_protection',
    items: [
      {
        path: '/protection',
        labelKey: 'nav.protection',
        capability: 'security.read',
        exact: true,
      },
      { path: '/protection/alerts', labelKey: 'nav.alerts', capability: 'security.read' },
      { path: '/protection/sessions', labelKey: 'nav.sessions', capability: 'security.read' },
      { path: '/protection/devices', labelKey: 'nav.devices', capability: 'security.read' },
      { path: '/protection/activity', labelKey: 'nav.activity', capability: 'security.read' },
    ],
  },
  {
    titleKey: 'nav.group_system',
    items: [
      { path: '/translations', labelKey: 'nav.translations', capability: 'translations.write' },
      { path: '/config', labelKey: 'nav.config', capability: 'config.write' },
      { path: '/audit', labelKey: 'nav.audit', capability: 'audit.read' },
      // Always reachable: it is where an operator goes to fix the very thing
      // that is blocking them, so it is gated on entry, not on a capability.
      { path: '/security', labelKey: 'nav.security', capability: 'admin.access' },
    ],
  },
]
