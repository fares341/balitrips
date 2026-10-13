/**
 * GET /api/favorites — the signed-in visitor's saved items, for the header's
 * favorites counter, the account popover and the hearts on catalogue cards.
 *
 * The header and the cards are served from the cache and never read the
 * session on the server; they ask here after hydration. A visitor without a
 * session cookie is answered at once, without touching the database.
 *
 * `keys` are `"<kind>:<refId>"`, e.g. `"activity:4f1c…"`.
 */

import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { favorites } from '@/db/schema'
import { getUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const SIGNED_OUT = { signedIn: false, keys: [] as string[] }

export async function GET(): Promise<NextResponse> {
  const jar = await cookies()
  if (!jar.has('bt.session_token') && !jar.has('__Secure-bt.session_token')) {
    return NextResponse.json(SIGNED_OUT, { headers: NO_STORE })
  }
  const user = await getUser()
  if (user === null) return NextResponse.json(SIGNED_OUT, { headers: NO_STORE })

  const rows = await db
    .select({ kind: favorites.kind, refId: favorites.refId })
    .from(favorites)
    .where(eq(favorites.userId, user.id))

  return NextResponse.json(
    { signedIn: true, keys: rows.map((row) => `${row.kind}:${row.refId}`) },
    { headers: NO_STORE },
  )
}
