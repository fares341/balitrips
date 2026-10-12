import { desc, eq, or } from 'drizzle-orm'

import { db } from '@/db'
import {
  auditLog,
  cartItems,
  carts,
  contactMessages,
  customTripRequests,
  entitlements,
  favorites,
  orderItems,
  orders,
  payments,
  sessions,
  users,
} from '@/db/schema'

/**
 * Subject access export (GDPR art. 15 / PDPL art. 12).
 *
 * "Everything held about that user", assembled from every table that carries
 * their id or their e-mail address. The obligation is to be COMPLETE, so this
 * enumerates tables explicitly and the list is the thing to update when a
 * migration adds another one — a query that silently misses a table produces
 * an export that is confidently wrong, which is worse than one that fails.
 *
 * Deliberately excluded, with reasons the operator can defend:
 *
 *  - `users.two_factor_secret` and `accounts.password_hash`. Credentials, not
 *    personal data. Handing back a TOTP seed in a plain-text file that is
 *    routinely e-mailed to the subject would be an own goal; art. 15(4) is
 *    explicit that the right of access must not adversely affect others, and
 *    in practice a leaked export is exactly how an account gets taken over.
 *  - `sessions.token`. A live bearer credential — the export would be a
 *    session-hijack kit. The session's device, IP and expiry ARE included,
 *    because those are what the subject is entitled to know.
 *  - Provider payloads on `payments.raw_payload`. They contain the acquirer's
 *    own data about other parties and, depending on provider, truncated card
 *    metadata. The amount, currency, status and provider reference are all
 *    included instead.
 *
 * The export is a snapshot, not a stream: one user's data is small, and a
 * consistent single-transaction read is worth more than the memory saved.
 */

export interface DataExport {
  meta: {
    generatedAt: string
    subjectId: string
    /** Named so the recipient of a support ticket knows who ran it. */
    exportedBy: string
    schemaVersion: 1
    excluded: string[]
  }
  account: Record<string, unknown> | null
  sessions: unknown[]
  orders: unknown[]
  payments: unknown[]
  carts: unknown[]
  entitlements: unknown[]
  favorites: unknown[]
  customTripRequests: unknown[]
  contactMessages: unknown[]
  adminActions: unknown[]
}

const EXCLUDED = [
  'users.two_factor_secret and accounts.password_hash — credentials, not personal data',
  'sessions.token — a live bearer credential; the device, IP and expiry are included instead',
  'payments.raw_payload — the acquirer’s own data about other parties',
]

/**
 * Build the export.
 *
 * `actorLabel` is recorded in the file itself so a copy found later can be
 * traced back to the request it answered.
 */
export async function buildDataExport(userId: string, actorLabel: string): Promise<DataExport> {
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)

    const [sessionRows, orderRows, cartRows, entitlementRows, favoriteRows, tripRows, auditRows] =
      await Promise.all([
        tx
          .select({
            id: sessions.id,
            ipAddress: sessions.ipAddress,
            userAgent: sessions.userAgent,
            expiresAt: sessions.expiresAt,
            createdAt: sessions.createdAt,
            updatedAt: sessions.updatedAt,
          })
          .from(sessions)
          .where(eq(sessions.userId, userId))
          .orderBy(desc(sessions.createdAt)),
        tx.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)),
        tx.select().from(carts).where(eq(carts.userId, userId)),
        tx.select().from(entitlements).where(eq(entitlements.userId, userId)),
        tx.select().from(favorites).where(eq(favorites.userId, userId)),
        tx
          .select()
          .from(customTripRequests)
          .where(
            account
              ? // Leads submitted while signed out carry the e-mail but no id,
                // and they are unambiguously the subject's data.
                (or(
                  eq(customTripRequests.userId, userId),
                  eq(customTripRequests.email, account.email),
                ) ?? eq(customTripRequests.userId, userId))
              : eq(customTripRequests.userId, userId),
          ),
        tx
          .select({
            id: auditLog.id,
            action: auditLog.action,
            entityType: auditLog.entityType,
            entityId: auditLog.entityId,
            before: auditLog.before,
            after: auditLog.after,
            createdAt: auditLog.createdAt,
          })
          .from(auditLog)
          .where(eq(auditLog.entityId, userId))
          .orderBy(desc(auditLog.createdAt)),
      ])

    const orderIds = orderRows.map((row) => row.id)
    const cartIds = cartRows.map((row) => row.id)

    // Children are fetched per parent rather than with a single `inArray`
    // because both lists are tiny and an empty `inArray` is a SQL error in
    // some drivers — the guard is cheaper than the special case.
    const [items, paymentRows, cartItemRows, contactRows] = await Promise.all([
      Promise.all(
        orderIds.map((orderId) =>
          tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
        ),
      ),
      Promise.all(
        orderIds.map((orderId) =>
          tx
            .select({
              id: payments.id,
              orderId: payments.orderId,
              provider: payments.provider,
              providerPaymentId: payments.providerPaymentId,
              status: payments.status,
              amountMinor: payments.amountMinor,
              currency: payments.currency,
              createdAt: payments.createdAt,
            })
            .from(payments)
            .where(eq(payments.orderId, orderId)),
        ),
      ),
      Promise.all(
        cartIds.map((cartId) => tx.select().from(cartItems).where(eq(cartItems.cartId, cartId))),
      ),
      account
        ? tx.select().from(contactMessages).where(eq(contactMessages.email, account.email))
        : Promise.resolve([]),
    ])

    const itemsByOrder = new Map<string, unknown[]>()
    for (const group of items) {
      for (const item of group) {
        const list = itemsByOrder.get(item.orderId)
        if (list) list.push(item)
        else itemsByOrder.set(item.orderId, [item])
      }
    }

    const cartItemsByCart = new Map<string, unknown[]>()
    for (const group of cartItemRows) {
      for (const item of group) {
        const list = cartItemsByCart.get(item.cartId)
        if (list) list.push(item)
        else cartItemsByCart.set(item.cartId, [item])
      }
    }

    return {
      meta: {
        generatedAt: new Date().toISOString(),
        subjectId: userId,
        exportedBy: actorLabel,
        schemaVersion: 1 as const,
        excluded: EXCLUDED,
      },
      account: account
        ? {
            id: account.id,
            email: account.email,
            emailVerifiedAt: account.emailVerifiedAt,
            name: account.name,
            phone: account.phone,
            country: account.country,
            locale: account.locale,
            role: account.role,
            twoFactorEnabled: account.twoFactorEnabled,
            image: account.image,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            deletedAt: account.deletedAt,
          }
        : null,
      sessions: sessionRows,
      orders: orderRows.map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
      })),
      payments: paymentRows.flat(),
      carts: cartRows.map((cart) => ({ ...cart, items: cartItemsByCart.get(cart.id) ?? [] })),
      entitlements: entitlementRows,
      favorites: favoriteRows,
      customTripRequests: tripRows,
      contactMessages: contactRows,
      adminActions: auditRows,
    } satisfies DataExport
  })
}

/** Filename for the download. Predictable, sortable, no personal data in it. */
export function exportFilename(userId: string, at = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-')
  return `data-export-${userId}-${stamp}.json`
}
