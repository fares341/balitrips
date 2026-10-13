import type { Capability } from '@/lib/auth/roles'

/**
 * Sidebar structure.
 *
 * Each entry declares the capability it needs, and the shell filters the
 * list with `can()` so staff never see a link they cannot open. That is
 * presentation only — the page behind every one of these calls
 * `requireCapability()` itself, because a hidden link is not a permission
 * check.
 */

export interface NavItem {
  /** Path relative to the configured admin base. */
  path: string
  label: string
  capability: Capability
  /** Marks the section root so a nested detail page still highlights it. */
  exact?: boolean
}

export interface NavGroup {
  title: string
  items: readonly NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { path: '', label: 'Dashboard', capability: 'admin.access', exact: true },
      { path: '/inbox', label: 'Inbox', capability: 'admin.access' },
      { path: '/notify', label: 'Send notification', capability: 'roles.write' },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { path: '/media', label: 'Media library', capability: 'media.upload' },
      { path: '/files', label: 'PDF files', capability: 'content.read' },
      { path: '/activities', label: 'Activities', capability: 'content.read' },
      { path: '/itineraries', label: 'Itineraries', capability: 'content.read' },
      { path: '/packages', label: 'Packages', capability: 'content.read' },
      { path: '/articles', label: 'Articles', capability: 'content.read' },
      { path: '/landmarks', label: 'Landmarks', capability: 'content.read' },
      { path: '/places', label: 'Map places', capability: 'content.read' },
      { path: '/reviews', label: 'Reviews', capability: 'content.read' },
      { path: '/taxonomy', label: 'Categories & regions', capability: 'content.read' },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { path: '/orders', label: 'Orders', capability: 'orders.read' },
      { path: '/payments', label: 'Payments', capability: 'payments.read' },
      { path: '/plans', label: 'Plans', capability: 'content.read' },
      { path: '/entitlements', label: 'Entitlements', capability: 'customers.read' },
      { path: '/capacity', label: 'Driver capacity', capability: 'capacity.write' },
    ],
  },
  {
    title: 'People',
    items: [
      { path: '/customers', label: 'Customers', capability: 'customers.read' },
      { path: '/leads', label: 'Leads', capability: 'leads.read' },
    ],
  },
  {
    title: 'Protection',
    items: [
      { path: '/protection', label: 'Bans & signals', capability: 'security.read', exact: true },
      { path: '/protection/alerts', label: 'Alerts', capability: 'security.read' },
      { path: '/protection/sessions', label: 'Live sessions', capability: 'security.read' },
      { path: '/protection/devices', label: 'Devices', capability: 'security.read' },
      { path: '/protection/activity', label: 'Activity log', capability: 'security.read' },
    ],
  },
  {
    title: 'System',
    items: [
      { path: '/translations', label: 'Translations', capability: 'translations.write' },
      { path: '/config', label: 'Configuration', capability: 'config.write' },
      { path: '/audit', label: 'Audit log', capability: 'audit.read' },
      // Always reachable: it is where an operator goes to fix the very thing
      // that is blocking them, so it is gated on entry, not on a capability.
      { path: '/security', label: 'Two-factor', capability: 'admin.access' },
    ],
  },
]
