/**
 * Site-level imagery chosen in Studio → Configuration.
 *
 * Same rules as `./queries.ts`: only live rows, no request-scoped state, and
 * a missing or deleted image is `null` — never a dead URL — so callers fall
 * back to their own artwork.
 */

import { and, eq, isNull } from 'drizzle-orm'

import { readSetting } from '@/app/(admin)/_lib/settings'
import { db } from '@/db'
import { media } from '@/db/schema'

import { toMedia } from './queries'
import type { MediaDto } from './types'

/** The home page hero background, or null when none is configured. */
export async function homeHeroImage(): Promise<MediaDto | null> {
  const { heroImageId } = await readSetting('home')
  if (heroImageId === null) return null

  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, heroImageId), isNull(media.deletedAt)))
    .limit(1)

  return toMedia(row)
}
