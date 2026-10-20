/**
 * Roles and authorization.
 *
 * The admin is hidden behind a non-obvious, environment-configured path,
 * but obscurity carries none of the security weight. Every check below runs
 * on the server, and it runs again inside each route handler and server
 * action — never only in the proxy/middleware layer, because one missed
 * matcher pattern there would silently expose a route.
 */

export const ROLES = ['customer', 'staff', 'admin'] as const
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
] as const

export type Capability = (typeof CAPABILITIES)[number]

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  customer: [],

  // Staff run the day-to-day: edit and publish content, read and fulfil
  // orders, manage capacity and leads. They cannot move money, change
  // roles, or edit pricing configuration.
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
  ],

  admin: [...CAPABILITIES],
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
  if (!isElevated(role)) return false

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
