import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import {
  auditLog,
  itineraries,
  itineraryDays,
  itineraryDocuments,
  orderItems,
  orders,
} from '@/db/schema'
import { getPublicItinerary } from '@/lib/itineraries/public'
import {
  createTestUser,
  deleteTestOrder,
  deleteTestUser,
  fixtureId,
  localizedFixture,
} from '@/test/integration/support'

/**
 * The Studio itinerary editor on a real database: create / save by tab /
 * duplicate / hide / delete-with-buyers guard / page content / FAQ / PDF
 * upload to the LOCAL private volume (no Spaces), and the public DTO never
 * carrying private day content. Only the session and `redirect` are mocked.
 */

const mocks = vi.hoisted(() => ({
  session: {
    userId: '',
    email: 'editor-fixture@example.test',
    name: 'Editor fixture',
    role: 'admin' as const,
    ipAddress: '127.0.0.1' as string | null,
  },
  redirects: [] as string[],
}))

vi.mock('@/app/(admin)/_lib/session', () => ({
  getAdminSession: async () => mocks.session,
  requireCapability: async () => mocks.session,
}))

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'ar' }) }),
  headers: async () => new Headers(),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    mocks.redirects.push(url)
    const error = new Error(`NEXT_REDIRECT ${url}`) as Error & { digest: string }
    error.digest = `NEXT_REDIRECT;replace;${url};307;`
    throw error
  },
  notFound: (): never => {
    throw new Error('notFound() was called')
  },
}))

const actions = await import('./actions')
const editor = await import('./editor-actions')
const upload = await import('./pdf-upload')

const storageDir = mkdtempSync(join(tmpdir(), 'itined-private-'))
const saved = {
  dir: process.env.PRIVATE_STORAGE_DIR,
  key: process.env.SPACES_KEY,
  secret: process.env.SPACES_SECRET,
}
const created: string[] = []
const orderIds: string[] = []
const userIds: string[] = []

async function run(action: () => Promise<void>): Promise<URL> {
  try {
    await action()
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('NEXT_REDIRECT')) throw error
  }
  const last = mocks.redirects.at(-1)
  if (!last) throw new Error('no redirect')
  return new URL(last, 'http://studio.test')
}

function form(entries: Record<string, string | string[] | File>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) for (const one of value) data.append(key, one)
    else data.append(key, value)
  }
  return data
}

const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

async function createViaAction(): Promise<string> {
  const slug = fixtureId()
  const url = await run(() =>
    actions.saveItinerary(
      'new',
      form({
        _sections: 'basics',
        _tab: 'basics',
        slug,
        name_ar: 'جدول اختبار',
        name_en: `Editor fixture ${slug.slice(-6)}`,
        blurb_ar: 'وصف قصير',
      }),
    ),
  )
  expect(url.searchParams.get('err')).toBeNull()
  const [row] = await db.select().from(itineraries).where(eq(itineraries.slug, slug))
  if (!row) throw new Error('not created')
  created.push(row.id)
  return row.id
}

beforeAll(async () => {
  process.env.PRIVATE_STORAGE_DIR = storageDir
  delete process.env.SPACES_KEY
  delete process.env.SPACES_SECRET
  const admin = await createTestUser('admin')
  userIds.push(admin.id)
  mocks.session.userId = admin.id
})

beforeEach(() => {
  mocks.redirects.length = 0
})

afterAll(async () => {
  for (const id of orderIds) await deleteTestOrder(id)
  for (const id of created) {
    await db.delete(auditLog).where(eq(auditLog.entityId, id))
    await db.delete(itineraries).where(eq(itineraries.id, id))
  }
  for (const id of userIds) await deleteTestUser(id)
  process.env.PRIVATE_STORAGE_DIR = saved.dir
  if (saved.key !== undefined) process.env.SPACES_KEY = saved.key
  if (saved.secret !== undefined) process.env.SPACES_SECRET = saved.secret
  rmSync(storageDir, { recursive: true, force: true })
})

describe('Studio itinerary editor', () => {
  it('creates a draft from the basics tab and audits it', async () => {
    const id = await createViaAction()
    const [row] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    expect(row?.status).toBe('draft')
    expect(row?.priceMinor).toBe(0)
    const audit = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, id))
    expect(audit.map((a) => a.action)).toContain('itinerary.create')
  })

  it('saving one tab never touches another tab’s fields', async () => {
    const id = await createViaAction()
    await run(() =>
      actions.saveItinerary(
        id,
        form({ _sections: 'pricing', priceMinor: '79', mapAccess: 'free_only', saleDigital: 'on' }),
      ),
    )
    const [afterPricing] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    expect(afterPricing?.priceMinor).toBe(7900)
    expect(afterPricing?.blurb?.ar).toBe('وصف قصير')

    await run(() =>
      actions.saveItinerary(
        id,
        form({ _sections: 'basics', slug: afterPricing?.slug ?? '', name_ar: 'اسم جديد' }),
      ),
    )
    const [afterBasics] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    expect(afterBasics?.name.ar).toBe('اسم جديد')
    expect(afterBasics?.priceMinor).toBe(7900)
  })

  it('saves page content and FAQ through the allow-list', async () => {
    const id = await createViaAction()
    const url = await run(() =>
      editor.savePageContent(
        id,
        form({
          pageContent__json: JSON.stringify({
            texts: { daysTitle: { ar: 'أيام رحلتك' } },
            benefits: [{ icon: 'pin', label: { ar: 'خريطة' }, text: {} }],
            sections: [{ key: 'faq' }, { key: 'gallery', hidden: true }],
            internalNotes: 'leak',
          }),
        }),
      ),
    )
    expect(url.searchParams.get('ok')).not.toBeNull()
    expect(url.searchParams.get('tab')).toBe('content')
    const [row] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    expect(JSON.stringify(row?.pageContent)).not.toContain('leak')

    const bad = await run(() => editor.savePageContent(id, form({ pageContent__json: '{oops' })))
    expect(bad.searchParams.get('err')).toBeTruthy()

    await run(() =>
      editor.saveItineraryFaq(
        id,
        form({ faq__json: JSON.stringify([{ q: { ar: 'سؤال؟' }, a: { ar: 'جواب' } }]) }),
      ),
    )
    const [withFaq] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    expect(withFaq?.faq).toHaveLength(1)
  })

  it('duplicates as a draft with its days, without the PDFs', async () => {
    const id = await createViaAction()
    await db.insert(itineraryDays).values({ itineraryId: id, dayNumber: 1, isFreeDay: true })
    await db
      .update(itineraries)
      .set({ uploadedPdfKeys: { ar: 'x.pdf' } })
      .where(eq(itineraries.id, id))
    const url = await run(() => editor.duplicateItinerary(id))
    const copyId = url.pathname.split('/').at(-1) ?? ''
    created.push(copyId)
    const [copy] = await db.select().from(itineraries).where(eq(itineraries.id, copyId))
    expect(copy?.status).toBe('draft')
    expect(copy?.slug).toMatch(/-copy$/)
    expect(copy?.uploadedPdfKeys).toBeNull()
    const days = await db.select().from(itineraryDays).where(eq(itineraryDays.itineraryId, copyId))
    expect(days).toHaveLength(1)
  })

  it('refuses to delete an itinerary with buyers, and hides it instead', async () => {
    const id = await createViaAction()
    const buyer = await createTestUser()
    userIds.push(buyer.id)
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `BT-IT-${randomUUID().slice(0, 12)}`,
        userId: buyer.id,
        status: 'paid',
        presentmentCurrency: 'SAR',
        subtotalMinor: 100,
        totalMinor: 100,
        customerSnapshot: { name: 'Buyer', email: buyer.email, locale: 'ar' },
        termsAcceptedAt: new Date(),
        termsVersion: '2026-01-v1',
        placedAt: new Date(),
      })
      .returning({ id: orders.id })
    if (!order) throw new Error('order')
    orderIds.push(order.id)
    await db.insert(orderItems).values({
      orderId: order.id,
      kind: 'itinerary',
      refId: id,
      refVersion: 1,
      nameSnapshot: localizedFixture('plan'),
      quantity: 1,
      unitPriceMinor: 100,
      lineTotalMinor: 100,
      fulfilmentStatus: 'fulfilled',
    } as typeof orderItems.$inferInsert)

    const refused = await run(() => actions.deleteItinerary(id))
    expect(refused.searchParams.get('err')).toBeTruthy()
    const [still] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    expect(still?.deletedAt).toBeNull()

    await db
      .update(itineraries)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(itineraries.id, id))
    await run(() => editor.setItineraryVisibility(id, form({ visibility: 'hidden' })))
    const [hidden] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    expect(hidden?.status).toBe('hidden')
    expect(hidden?.deletedAt).toBeNull()
    expect(await getPublicItinerary(hidden?.slug ?? '')).toBeNull()
  })

  it('deletes an itinerary without buyers', async () => {
    const id = await createViaAction()
    const url = await run(() => actions.deleteItinerary(id))
    expect(url.searchParams.get('ok')).toBeTruthy()
    const [row] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    expect(row?.deletedAt).not.toBeNull()
  })

  it('uploads a PDF to the local private volume (no Spaces) as the delivered file', async () => {
    const id = await createViaAction()
    const outcome = await upload.uploadPdfCore(
      id,
      form({ locale: 'ar', file: new File([PDF], 'plan.pdf', { type: 'application/pdf' }) }),
    )
    expect(outcome).toHaveProperty('ok')
    const [row] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    const key = row?.uploadedPdfKeys?.ar ?? ''
    expect(key).toMatch(/^itineraries\/.+\/uploaded\/ar-.+\.pdf$/)
    expect(readFileSync(join(storageDir, key)).subarray(0, 5).toString()).toBe('%PDF-')
    expect(await upload.readStoredPdf(key)).not.toBeNull()
    const docs = await db
      .select()
      .from(itineraryDocuments)
      .where(and(eq(itineraryDocuments.itineraryId, id), eq(itineraryDocuments.isCurrent, true)))
    expect(docs[0]?.fileVersion).toBe(1)

    const notPdf = await upload.uploadPdfCore(
      id,
      form({ locale: 'ar', file: new File(['hello'], 'x.pdf', { type: 'application/pdf' }) }),
    )
    expect(notPdf).toHaveProperty('err')
    expect('err' in notPdf ? notPdf.err : '').not.toMatch(/Error|ENOENT|undefined/)
  })

  it('the public DTO never carries private day content', async () => {
    const id = await createViaAction()
    await db.insert(itineraryDays).values({
      itineraryId: id,
      dayNumber: 1,
      isFreeDay: true,
      title: { ar: 'سر اليوم الأول', en: 'SECRET-DAY-TITLE', id: '' },
      description: { ar: '', en: 'SECRET-DAY-BODY', id: '' },
      teaserMood: { ar: 'هدوء', en: '', id: '' },
    })
    await db
      .update(itineraries)
      .set({
        status: 'published',
        publishedAt: new Date(),
        days: 1,
        internalNotes: 'SECRET-NOTES',
        pageContent: { texts: { daysTitle: { ar: 'أيامك' } }, days: ['SECRET-INJECTED'] },
      })
      .where(eq(itineraries.id, id))
    const [row] = await db.select().from(itineraries).where(eq(itineraries.id, id))
    const dto = await getPublicItinerary(row?.slug ?? '')
    expect(dto?.page.texts.daysTitle?.ar).toBe('أيامك')
    const json = JSON.stringify(dto)
    for (const secret of [
      'SECRET-DAY-TITLE',
      'SECRET-DAY-BODY',
      'SECRET-NOTES',
      'SECRET-INJECTED',
      'سر اليوم',
    ]) {
      expect(json).not.toContain(secret)
    }
  })
})
