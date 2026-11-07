import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { activities, media, users } from '@/db/schema'

import { restoreArchived } from './archive'
import { ingestUpload } from './media-upload'
import { publishedReferences, referencesTo } from './media-refs'
import type { AdminSession } from './session'

/**
 * Full-control pass: upload → name → rename, the "used in X places" guard
 * that blocks archiving an image on a published page, and archive restore.
 */

const t = (key: string) => key
// A real 640×480 PNG (the pipeline refuses anything narrower than 320 px).
const PNG = await sharp({
  create: { width: 640, height: 480, channels: 3, background: { r: 38, g: 85, b: 46 } },
})
  .png()
  .toBuffer()

const created: string[] = []

async function session(): Promise<AdminSession> {
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1)
  if (!admin) throw new Error('integration DB needs an admin user')
  return {
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role as AdminSession['role'],
    sessionId: randomUUID(),
    ipAddress: null,
  }
}

afterAll(async () => {
  for (const id of created) {
    await db.update(activities).set({ heroImageId: null }).where(eq(activities.heroImageId, id))
    await db.delete(media).where(eq(media.id, id))
    rmSync(resolve('public/media', id), { recursive: true, force: true })
  }
})

describe('media upload', () => {
  it('stores the file named from its file name, and can be renamed', async () => {
    const file = new File([new Uint8Array(PNG)], 'Ulun_Danu-temple.png', { type: 'image/png' })
    const row = await ingestUpload({ file, session: await session(), t })
    created.push(row.id)
    expect(row.name).toBe('Ulun Danu temple')

    const [stored] = await db.select().from(media).where(eq(media.id, row.id))
    expect(stored?.name).toBe('Ulun Danu temple')

    await db.update(media).set({ name: 'معبد أولون دانو' }).where(eq(media.id, row.id))
    const [renamed] = await db.select({ name: media.name }).from(media).where(eq(media.id, row.id))
    expect(renamed?.name).toBe('معبد أولون دانو')
  })

  it('refuses a non-image', async () => {
    const file = new File([Buffer.from('%PDF-1.4')], 'menu.pdf', { type: 'application/pdf' })
    await expect(ingestUpload({ file, session: await session(), t })).rejects.toThrow('mc.err_type')
  })

  it('counts where an image is used and blocks archiving when a page is live', async () => {
    const file = new File([new Uint8Array(PNG)], 'hero.png', { type: 'image/png' })
    const row = await ingestUpload({ file, session: await session(), t })
    created.push(row.id)

    const [live] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.status, 'published'))
      .limit(1)
    if (!live) throw new Error('integration DB needs a published activity')
    const [before] = await db
      .select({ hero: activities.heroImageId })
      .from(activities)
      .where(eq(activities.id, live.id))
    await db.update(activities).set({ heroImageId: row.id }).where(eq(activities.id, live.id))
    try {
      const refs = await referencesTo(row.id)
      expect(refs.length).toBe(1)
      expect(publishedReferences(refs)).toHaveLength(1)
    } finally {
      await db
        .update(activities)
        .set({ heroImageId: before?.hero ?? null })
        .where(eq(activities.id, live.id))
    }
    expect(publishedReferences(await referencesTo(row.id))).toHaveLength(0)
  })
})

describe('archive bin', () => {
  it('restores an archived record and refuses one that is not archived', async () => {
    const [row] = await db.select({ id: activities.id }).from(activities).limit(1)
    if (!row) throw new Error('integration DB needs an activity')
    const [orig] = await db
      .select({ deletedAt: activities.deletedAt })
      .from(activities)
      .where(eq(activities.id, row.id))
    try {
      await db.update(activities).set({ deletedAt: new Date() }).where(eq(activities.id, row.id))
      expect(await restoreArchived('activities', row.id)).toBe(true)
      const [after] = await db
        .select({ deletedAt: activities.deletedAt })
        .from(activities)
        .where(eq(activities.id, row.id))
      expect(after?.deletedAt).toBeNull()
      expect(await restoreArchived('activities', row.id)).toBe(false)
    } finally {
      await db
        .update(activities)
        .set({ deletedAt: orig?.deletedAt ?? null })
        .where(eq(activities.id, row.id))
    }
  })
})
