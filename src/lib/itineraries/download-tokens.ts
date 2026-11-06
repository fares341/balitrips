/**
 * E-mail download links for a bought itinerary (phase 4, spec §3.2).
 *
 * A link carries 32 random bytes (base64url). The database keeps only an
 * HMAC-SHA256 of it under a server secret, so a database leak gives no
 * working link and a forged token can only be found by guessing 256 bits.
 * Each link:
 *   - expires (`itinerarySales.linkValidDays`, default 7 days),
 *   - has a use limit (`itinerarySales.linkMaxUses`, default 5),
 *   - is revoked when a newer link is issued for the same order item, and
 *     when Studio asks for a new one.
 *
 * The link never reaches storage: the route that redeems it streams the PDF
 * through the same stamping path as the account download.
 */

import { createHmac, randomBytes } from 'node:crypto'

import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'

import { db } from '@/db'
import { downloadTokens } from '@/db/schema'

/** 32 bytes in base64url, no padding. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

function tokenSecret(): string {
  const secret = process.env.DOWNLOAD_TOKEN_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim()
  if (!secret) throw new Error('DOWNLOAD_TOKEN_SECRET / BETTER_AUTH_SECRET is not set')
  return secret
}

export function newDownloadToken(): string {
  return randomBytes(32).toString('base64url')
}

/** 64 hex chars — fits `download_tokens.token_hash`. */
export function hashDownloadToken(token: string, secret: string = tokenSecret()): string {
  return createHmac('sha256', secret).update(`itinerary-download:${token}`).digest('hex')
}

export type TokenRefusal = 'malformed' | 'unknown' | 'revoked' | 'expired' | 'used_up'

export interface TokenRow {
  expiresAt: Date
  revokedAt: Date | null
  uses: number
  maxUses: number
}

/** Pure: why a stored token can no longer be used, or null when it can. */
export function tokenRefusal(row: TokenRow | null, now: Date): TokenRefusal | null {
  if (row === null) return 'unknown'
  if (row.revokedAt !== null) return 'revoked'
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (row.uses >= row.maxUses) return 'used_up'
  return null
}

export interface IssuedToken {
  token: string
  expiresAt: Date
  maxUses: number
}

/**
 * A new link for `orderItemId`. Earlier live links for the item are revoked
 * in the same transaction, so only the newest e-mail works.
 */
export async function issueDownloadToken(
  orderItemId: string,
  options: { validDays: number; maxUses: number; createdById?: string | null },
  now: Date = new Date(),
): Promise<IssuedToken> {
  const token = newDownloadToken()
  const expiresAt = new Date(now.getTime() + options.validDays * 24 * 60 * 60 * 1000)
  await db.transaction(async (tx) => {
    await tx
      .update(downloadTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(downloadTokens.orderItemId, orderItemId), isNull(downloadTokens.revokedAt)))
    await tx.insert(downloadTokens).values({
      tokenHash: hashDownloadToken(token),
      orderItemId,
      expiresAt,
      maxUses: options.maxUses,
      createdById: options.createdById ?? null,
    })
  })
  return { token, expiresAt, maxUses: options.maxUses }
}

/** Revoke every live link for an item (refund, Studio). Returns how many. */
export async function revokeDownloadTokens(
  orderItemId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(downloadTokens)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(downloadTokens.orderItemId, orderItemId), isNull(downloadTokens.revokedAt)))
    .returning({ id: downloadTokens.id })
  return rows.length
}

export type Redemption =
  | { ok: true; tokenId: string; orderItemId: string; use: number }
  | { ok: false; reason: TokenRefusal }

/**
 * Spend one use of a link, atomically: the conditional UPDATE is the check,
 * so ten parallel requests on a 5-use link get exactly five successes.
 */
export async function redeemDownloadToken(
  token: string,
  now: Date = new Date(),
): Promise<Redemption> {
  if (!TOKEN_PATTERN.test(token)) return { ok: false, reason: 'malformed' }
  const hash = hashDownloadToken(token)
  const [spent] = await db
    .update(downloadTokens)
    .set({ uses: sql`${downloadTokens.uses} + 1`, lastUsedAt: now, updatedAt: now })
    .where(
      and(
        eq(downloadTokens.tokenHash, hash),
        isNull(downloadTokens.revokedAt),
        gt(downloadTokens.expiresAt, now),
        lt(downloadTokens.uses, downloadTokens.maxUses),
      ),
    )
    .returning({
      id: downloadTokens.id,
      orderItemId: downloadTokens.orderItemId,
      uses: downloadTokens.uses,
    })
  if (spent) return { ok: true, tokenId: spent.id, orderItemId: spent.orderItemId, use: spent.uses }

  const [row] = await db
    .select({
      expiresAt: downloadTokens.expiresAt,
      revokedAt: downloadTokens.revokedAt,
      uses: downloadTokens.uses,
      maxUses: downloadTokens.maxUses,
    })
    .from(downloadTokens)
    .where(eq(downloadTokens.tokenHash, hash))
    .limit(1)
  return { ok: false, reason: tokenRefusal(row ?? null, now) ?? 'used_up' }
}

/** Give a use back (the file could not be served). */
export async function refundDownloadUse(tokenId: string): Promise<void> {
  await db
    .update(downloadTokens)
    .set({ uses: sql`greatest(${downloadTokens.uses} - 1, 0)` })
    .where(eq(downloadTokens.id, tokenId))
}
