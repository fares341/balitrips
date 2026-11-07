import { can, type Capability, type Role } from '@/lib/auth/roles'

import { adminBasePath } from './admin-path'

/**
 * Which capabilities each Studio page needs, by path (relative to the
 * configured admin base, as `adminHref()` takes it).
 *
 * The pages enforce their own capability with `requireCapability()`; this
 * table only mirrors it so links can be shown to the roles that can open
 * them — a link that answers 404 for the person who clicked it looks like a
 * broken Studio. `route-access.test.ts` reads every page and route handler
 * under `studio/` and fails if this table disagrees with the code.
 *
 * Order matters: the first matching pattern wins, so specific paths come
 * before their section.
 */
type Rule =
  readonly [RegExp, readonly Capability[]] | readonly [RegExp, readonly Capability[], 'any']

const ROUTES: readonly Rule[] = [
  [/^$/, ['admin.access']],
  [/^\/inbox$/, ['admin.access']],
  [/^\/security$/, ['admin.access']],

  // Listing PDFs (Studio v2): each kind checks its own capability; the
  // downloads list shows a person only their own files (admin: all).
  [/^\/pdf\/[^/]+$/, ['admin.access']],
  [/^\/reports\/exports(\/[^/]+)?$/, ['admin.access']],

  // Reports: two reports also need the data they show.
  [/^\/reports\/financial(\/export)?$/, ['reports.read', 'finance.read']],
  [/^\/reports\/customers(\/export)?$/, ['reports.read', 'customers.read']],
  [/^\/reports\/schedules$/, ['config.write']],
  [/^\/reports(\/.*)?$/, ['reports.read']],
  [/^\/map-analytics$/, ['reports.read']],

  [/^\/assistant$/, ['admin.access']],
  [/^\/assistant\/settings$/, ['config.write']],
  [/^\/assistant\/conversations(\/[^/]+)?$/, ['customers.read']],
  // Broadcast to customers: admin and marketing (was roles.write).
  [/^\/notify$/, ['marketing.send']],

  // Personal data leaves the system only through an export capability.
  [/^\/(customers|leads|orders|payments)\/export$/, ['customers.export']],
  [/^\/customers\/[^/]+\/export$/, ['customers.export']],
  [/^\/protection\/activity\/export$/, ['customers.export']],

  [/^\/customers(\/[^/]+)?$/, ['customers.read']],
  [/^\/leads(\/[^/]+)?$/, ['leads.read']],
  [/^\/(tasks|support)(\/.*)?$/, ['crm.write']],
  [/^\/(duplicates|entitlements)$/, ['customers.read']],

  [/^\/orders(\/[^/]+(\/(invoice|receipt))?)?$/, ['orders.read']],
  [/^\/payments$/, ['payments.read']],
  [/^\/plans$/, ['content.read']],
  [/^\/plans\/vip$/, ['vip.manage']],
  [/^\/plans\/[^/]+$/, ['config.write']],
  // «السيارات والسائق»: one screen; each section needs its own capability
  // (driver fleet: capacity.write, package vehicles: content.write). The old
  // addresses only redirect to it.
  [/^\/vehicles$/, ['capacity.write', 'content.write'], 'any'],
  [
    /^\/(capacity|itineraries\/driver|packages\/vehicles)$/,
    ['capacity.write', 'content.write'],
    'any',
  ],
  [/^\/suppliers(\/[^/]+)?$/, ['orders.read']],
  [/^\/payables(\/.*)?$/, ['suppliers.write']],
  [/^\/discounts(\/[^/]+)?$/, ['discounts.write']],
  [/^\/(profit|reconciliation)(\/export)?$/, ['finance.read']],

  // Owner, Oct 2026: the operator contract (staff with prices only).
  [/^\/activities\/[^/]+\/contract$/, ['content.write', 'prices.write']],
  // Owner, Nov 2026: read-only places audit and its CSV (before /places/[id]).
  [/^\/places\/audit(\/export)?$/, ['content.read']],
  // Owner, Oct 2026: launch readiness and its photo-trip CSV.
  [/^\/readiness(\/export)?$/, ['content.read']],
  // Owner, Oct 2026: how bookings and custom trips run, step by step.
  [/^\/guide$/, ['orders.read']],

  // Itineraries phase 1 (owner, Nov 2026): pricing and driver settings
  // (before /itineraries/[id]).
  [/^\/itineraries\/pricing$/, ['content.read']],

  // v2: bulk import of activities (CSV) and its template.
  [/^\/activity-import(\/template|\/export)?$/, ['content.write']],
  // Catalogue: lists read, editors write.
  [
    /^\/(places|map|itineraries|activities|addons|packages|articles|landmarks|reviews|files)$/,
    ['content.read'],
  ],
  [
    /^\/(places|itineraries|activities|addons|packages|articles|landmarks|reviews)\/[^/]+$/,
    ['content.write'],
  ],
  [/^\/taxonomy$/, ['content.write']],
  [/^\/media$/, ['media.upload']],
  [/^\/home-content$/, ['config.write']],
  [/^\/archive$/, ['content.write']],
  [/^\/help$/, ['admin.access']],

  [/^\/protection(\/(alerts|sessions|devices|activity))?$/, ['security.read']],
  [/^\/translations$/, ['translations.write']],
  [/^\/(config|marketing|whatsapp)$/, ['config.write']],
  [/^\/audit$/, ['audit.read']],
  [/^\/team$/, ['users.manage']],
  [/^\/integrations(\/.*)?$/, ['integrations.write']],
  [/^\/system$/, ['system.read']],
]

/** The path part of a Studio href (no query, no fragment, no trailing slash). */
function routePath(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? ''
  return bare.replace(/\/+$/, '')
}

/** Capabilities the page at `path` needs, or null for a path this table does not know. */
export function studioPathCapabilities(path: string): readonly Capability[] | null {
  return studioPathRule(path)?.capabilities ?? null
}

/** The capabilities and whether ALL (default) or ANY of them open the page. */
export function studioPathRule(
  path: string,
): { capabilities: readonly Capability[]; any: boolean } | null {
  const bare = routePath(path)
  for (const rule of ROUTES) {
    if (rule[0].test(bare)) return { capabilities: rule[1], any: rule[2] === 'any' }
  }
  return null
}

/**
 * Can `role` open the Studio page at `path`? Unknown paths need the admin
 * (a link to a page this table has never heard of is shown to nobody else).
 */
export function canOpen(role: Role, path: string): boolean {
  const rule = studioPathRule(path)
  if (rule === null) return can(role, 'config.write')
  return rule.any
    ? rule.capabilities.some((capability) => can(role, capability))
    : rule.capabilities.every((capability) => can(role, capability))
}

/** `canOpen` for a full Studio href (as `adminHref()` builds it). Other hrefs are not Studio pages: true. */
export function canOpenHref(role: Role, href: string): boolean {
  const base = adminBasePath()
  if (href !== base && !href.startsWith(`${base}/`) && !href.startsWith(`${base}?`)) return true
  return canOpen(role, href.slice(base.length))
}
