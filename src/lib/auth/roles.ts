/**
 * Roles and authorization.
 *
 * The admin is hidden behind a non-obvious, environment-configured path,
 * but obscurity carries none of the security weight. Every check below runs
 * on the server, and it runs again inside each route handler and server
 * action — never only in the proxy/middleware layer, because one missed
 * matcher pattern there would silently expose a route.
 */

/**
 * `admin` is the Super Admin: every capability, now and in future. `staff` is
 * the original all-round team role and keeps exactly the access it always
 * had. Phase 6 adds narrower team roles so an account can be given only what
 * its job needs — see docs/roles.md for the table.
 *
 * `supplier_portal` exists for a FUTURE supplier portal and holds no Studio
 * capability at all: such an account signs in like a customer and sees
 * nothing of the Studio.
 */
export const ROLES = [
  'customer',
  'staff',
  'admin',
  'operations_manager',
  'booking_agent',
  'support_agent',
  'content_editor',
  'marketing_manager',
  'accountant',
  'supplier_portal',
] as const
export type Role = (typeof ROLES)[number]

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

/**
 * Capabilities, granted per role.
 *
 * Named capabilities rather than role comparisons scattered through the
 * codebase, so `if (role === 'admin')` never has to be audited across
 * dozens of call sites when the model changes.
 */
export const CAPABILITIES = [
  'admin.access',
  'content.read',
  'content.write',
  'content.publish',
  'media.upload',
  'translations.write',
  'orders.read',
  'orders.fulfil',
  'orders.refund',
  'payments.read',
  'entitlements.grant',
  'capacity.write',
  'customers.read',
  'customers.export',
  'leads.read',
  'config.write',
  'roles.write',
  'audit.read',
  /** قراءة الأجهزة وسجل النشاط وقوائم الحظر. */
  'security.read',
  /** حظر/رفع حظر المستخدمين والأجهزة والـ IP، وإزالة الأجهزة. للمدير فقط. */
  'security.write',
  /**
   * Phase 2: add and edit suppliers and their offers (costs), see costs and
   * margins, and pay suppliers. Admin only; staff read suppliers with
   * `orders.read` and assign them to bookings with `orders.fulfil`.
   */
  'suppliers.write',
  /** Phase 4: profit, payment checks — the money picture. Admin only. */
  'finance.read',
  /** Phase 4: create and change discount codes. Admin only (financial edits). */
  'discounts.write',
  /** Phase 4: customer notes, tags, stage, assignment, tasks and support tickets. */
  'crm.write',
  /** Phase 4: merge two customer accounts. Admin only. */
  'customers.merge',
  /**
   * Phase 6: confirm a booking — move a paid order to confirmed, or record
   * the supplier's confirmation of a line. Split out of `orders.fulfil` so a
   * role can prepare bookings without confirming them.
   */
  'bookings.confirm',
  /**
   * Phase 6: change what we charge — activity package prices and seasonal
   * prices, and supplier costs imported from a file. Split out of
   * `content.write` so a content editor can fix texts without touching prices.
   */
  'prices.write',
  /** Phase 6: supplier connections (Studio → Integrations), their keys and imports. */
  'integrations.write',
  /** Phase 6: VIP map access settings (where VIP is offered). Was `config.write`. */
  'vip.manage',
  /** Phase 6: team accounts — invite, change role, deactivate. Admin only. */
  'users.manage',
  /** Phase 6: business reports and statistics. */
  'reports.read',
  /** Phase 6: system health — errors, background jobs, backups. Admin only. */
  'system.read',
] as const

export type Capability = (typeof CAPABILITIES)[number]

/*
 * Kept as plain string lists (no spreads) except for `admin`: the Studio
 * browser check (scripts/admin-check.mjs) reads this block to know which
 * pages each role should and should not open. docs/roles.md mirrors it.
 */
const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  customer: [],

  // Staff run the day-to-day: edit and publish content, read and fulfil
  // orders, manage capacity and leads. They cannot move money, change
  // roles, or edit pricing configuration. Phase 6 split `bookings.confirm`
  // out of `orders.fulfil`, `prices.write` out of `content.write` and
  // `reports.read` out of `orders.read` (Phase 5 reports); staff hold all
  // three, so what a staff account can do is exactly what it could before.
  staff: [
    'admin.access',
    'content.read',
    'content.write',
    'content.publish',
    'media.upload',
    'translations.write',
    'orders.read',
    'orders.fulfil',
    'payments.read',
    'capacity.write',
    'customers.read',
    'leads.read',
    'audit.read',
    'security.read',
    'crm.write',
    'bookings.confirm',
    'prices.write',
    'reports.read',
  ],

  // Runs bookings, suppliers' day-to-day and the team's queue; no money moves,
  // no settings, no team accounts.
  operations_manager: [
    'admin.access',
    'orders.read',
    'orders.fulfil',
    'bookings.confirm',
    'payments.read',
    'capacity.write',
    'customers.read',
    'leads.read',
    'crm.write',
    'audit.read',
    'security.read',
    'prices.write',
    'vip.manage',
    'reports.read',
  ],

  // Prepares and confirms bookings and keeps availability right.
  booking_agent: [
    'admin.access',
    'orders.read',
    'orders.fulfil',
    'bookings.confirm',
    'capacity.write',
    'customers.read',
    'leads.read',
    'crm.write',
  ],

  // Answers customers: tickets, notes, tasks. Reads orders, changes none.
  support_agent: ['admin.access', 'orders.read', 'customers.read', 'leads.read', 'crm.write'],

  // Texts, photos, translations and publishing — never prices.
  content_editor: [
    'admin.access',
    'content.read',
    'content.write',
    'content.publish',
    'media.upload',
    'translations.write',
  ],

  // Content and campaigns: discount codes, leads and reports. No customer
  // export (personal data leaves the system only through an admin).
  marketing_manager: [
    'admin.access',
    'content.read',
    'content.write',
    'content.publish',
    'media.upload',
    'translations.write',
    'leads.read',
    'customers.read',
    'discounts.write',
    'reports.read',
  ],

  // The money picture: payments, profit, payment checks, what we owe
  // suppliers. Refunds stay with the admin.
  accountant: [
    'admin.access',
    'orders.read',
    'payments.read',
    'finance.read',
    'suppliers.write',
    'customers.read',
    'audit.read',
    'reports.read',
  ],

  // Reserved for the future supplier portal: no Studio access at all.
  supplier_portal: [],

  admin: [...CAPABILITIES],
}

/** Every capability a role holds (a copy — callers cannot change the table). */
export function capabilitiesOf(role: Role): Capability[] {
  return [...ROLE_CAPABILITIES[role]]
}

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability)
}

export function isElevated(role: Role): boolean {
  return can(role, 'admin.access')
}

/**
 * Two-factor is mandatory for any non-customer role, enforced at login
 * rather than offered as an opt-in setting. An admin account with a
 * reused password is the whole system's weakest point.
 */
export function requiresTwoFactor(role: Role): boolean {
  // Every role except `customer` — including `supplier_portal`, which has no
  // Studio access today but will sign in to a supplier portal later.
  if (role === 'customer') return false

  /**
   * Escape hatch for staging and local development.
   *
   * TOTP is right for a server that holds real customer data and real money:
   * this admin can change prices, issue refunds, grant map access and export
   * customer records, and a reused or phished password is otherwise the only
   * thing in the way. It is pure friction on a demo box seeded with generated
   * content and a payment provider that cannot charge anything.
   *
   * Gated as an explicit opt-OUT rather than an opt-in, so the safe behaviour
   * is what happens when nobody configures anything. A deployment that forgets
   * this variable gets two-factor, not a hole.
   *
   * NEVER set this on a server that takes real bookings.
   */
  // في الوضع الحقيقي لا يمكن تعطيله (انظر src/lib/live-mode.ts).
  if (process.env.LIVE_MODE === 'true') return true
  return process.env.DISABLE_ADMIN_2FA !== 'true'
}

export class AuthorizationError extends Error {
  constructor(readonly capability: Capability) {
    super(`Missing capability: ${capability}`)
    this.name = 'AuthorizationError'
  }
}

/** Throwing guard for use at the top of route handlers and server actions. */
export function assertCan(role: Role, capability: Capability): void {
  if (!can(role, capability)) throw new AuthorizationError(capability)
}

/* --------------------------------------------------------------------------
   Team management (Phase 6)
   -------------------------------------------------------------------------- */

/** Roles that belong to the team (everything but `customer`). */
export const TEAM_ROLES: readonly Role[] = ROLES.filter((role) => role !== 'customer')

/** Roles that can open the Studio — the people a task or ticket can be assigned to. */
export const STUDIO_ROLES: readonly Role[] = ROLES.filter((role) => isElevated(role))

/** A stored role string that can open the Studio (unknown strings cannot). */
export function isStudioRole(value: string): boolean {
  return isRole(value) && isElevated(value)
}

/** Does `role` hold every capability `other` holds? */
export function covers(role: Role, other: Role): boolean {
  return ROLE_CAPABILITIES[other].every((capability) => can(role, capability))
}

/**
 * May `actor` give an account the role `target`, or change an account that
 * currently has `target`?
 *
 * Two rules, both needed:
 *  1. only a role with `users.manage` manages accounts (today: admin);
 *  2. no escalation — the actor must already hold every capability of the
 *     role in question, so nobody can hand out (or take away) more than
 *     they have themselves.
 */
export function canAssignRole(actor: Role, target: Role): boolean {
  return can(actor, 'users.manage') && covers(actor, target)
}

/** The roles `actor` may hand out, in display order. */
export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((role) => canAssignRole(actor, role))
}
