import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

import { type Page } from '@playwright/test'

import { closeDb, db } from '../support/db'
import { test } from '../support/fixtures'

import { ADMIN, check, fuzzPage, settle, signInAs, Watch, XSS } from './_support'

/**
 * Every Studio form, signed in as the seeded admin (TOTP) on the CI copy.
 * Each page: load, hostile submit, empty submit (destructive buttons —
 * delete, cancel, refund, send, publish… — are never pressed by the generic
 * pass). Then one detail page per section, and the activity editor's tabs.
 */

test.describe.configure({ mode: 'serial' })
test.skip(!process.env.ACCOUNTS_FILE, 'test accounts not created')

const NAV = [
  ...readFileSync(resolve(__dirname, '..', '..', 'src/app/(admin)/_ui/nav.ts'), 'utf8').matchAll(
    /path: '([^']*)'/g,
  ),
]
  .map((m) => m[1] ?? '')
  .filter((p) => p !== '/security' && p !== '/assistant')

const ACTIVITY_TABS = [
  'content',
  'media',
  'packages',
  'included',
  'addons',
  'booking',
  'availability',
  'faq',
]

let page: Page

/** A solid-colour RGB PNG of the given size. */
function makePng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.1' } })
  page = await context.newPage()
  await signInAs(page, 'admin')
})

test.afterAll(async () => {
  await page?.context().close()
  await closeDb()
})

async function firstDetail(listPath: string): Promise<string | null> {
  const full = `${ADMIN}${listPath}`
  await page.goto(full, { waitUntil: 'domcontentloaded' })
  await settle(page)
  const hrefs = await page
    .$$eval(
      'main a[href]',
      (as, prefix) =>
        as
          .map((a) => a.getAttribute('href') ?? '')
          .filter((h) => h.startsWith(prefix + '/') && !h.includes('?') && !h.endsWith('/new')),
      full,
    )
    .catch(() => [] as string[])
  return hrefs.find((h) => !/\/(export|receipt|invoice|vip|file)(\/|$)/.test(h)) ?? null
}

test('admin signed in to the Studio', async ({ browserName: _browserName }, info) => {
  check(
    info,
    'studio sign-in',
    'admin reached dashboard (TOTP)',
    new URL(page.url()).pathname.startsWith(ADMIN),
    page.url(),
  )
})

for (const path of NAV) {
  test(`studio fuzz ${path || '/'}`, async ({ browserName: _browserName }, info) => {
    await fuzzPage(page, info, `${ADMIN}${path}`, `studio ${path || '/'}`)
    if (path === '' || path.startsWith('/protection') || path.startsWith('/reports')) return
    const detail = await firstDetail(path)
    if (detail === null) return
    if (path === '/activities') {
      for (const tab of ACTIVITY_TABS)
        await fuzzPage(page, info, `${detail}?tab=${tab}`, `studio activity ?tab=${tab}`)
    } else {
      await fuzzPage(page, info, detail, `studio ${path} detail`)
    }
  })
}

test('taxonomy: XSS category name is stored as text and never runs', async ({
  browserName: _browserName,
}, info) => {
  const watch = new Watch(page)
  await page.goto(`${ADMIN}/taxonomy`)
  await settle(page)
  const before = await db()<{ n: number }[]>`select count(*)::int n from categories`
  const form = page.locator('form').first()
  const textInputs = form.locator('input[type="text"]:visible, input:not([type]):visible')
  const n = await textInputs.count()
  for (let i = 0; i < n; i += 1) await textInputs.nth(i).fill(`${XSS}-${i}-${Date.now()}`)
  await form
    .locator('button[type="submit"]')
    .first()
    .click()
    .catch(() => {})
  await settle(page)
  await page.reload()
  await settle(page)
  const after = await db()<{ n: number }[]>`select count(*)::int n from categories`
  const problems = await watch.collect()
  check(
    info,
    'studio taxonomy',
    'submit with XSS handled (no script ran)',
    problems.length === 0,
    problems.join(' | '),
  )
  check(
    info,
    'studio taxonomy',
    'category count did not decrease',
    (after[0]?.n ?? 0) >= (before[0]?.n ?? 0),
  )
})

test('whatsapp: test send without a provider fails gracefully', async ({
  browserName: _browserName,
}, info) => {
  const watch = new Watch(page)
  await page.goto(`${ADMIN}/whatsapp`)
  await settle(page)
  const sendTest = page.getByRole('button', { name: /test|تجرب|اختبار/i }).first()
  if (!(await sendTest.isVisible().catch(() => false))) {
    check(info, 'studio whatsapp', 'test-send button present', false, 'not found')
    return
  }
  const phone = page.locator('input[type="tel"], input[name*="phone" i]').first()
  await phone.fill('+6281234567890').catch(() => {})
  await sendTest.click()
  await settle(page, 20_000)
  const problems = await watch.collect()
  check(
    info,
    'studio whatsapp',
    'test send handled (no provider in CI)',
    problems.length === 0,
    problems.join(' | '),
  )
})

test('media: upload a small image', async ({ browserName: _browserName }, info) => {
  const watch = new Watch(page)
  await page.goto(`${ADMIN}/media`)
  await settle(page)
  const file = page.locator('input[type="file"]').first()
  if (!(await file.count())) {
    check(info, 'studio media', 'file input present', false)
    return
  }
  const before = await db()<{ n: number }[]>`select count(*)::int n from media`
  // 1x1 PNG.
  // Too small first: the pipeline refuses anything under 320px wide.
  const tiny = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  await file.setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: tiny })
  await page.locator('form:has(input[type="file"]) button[type="submit"]').first().click()
  await settle(page, 20_000)
  const afterTiny = await db()<{ n: number }[]>`select count(*)::int n from media`
  check(
    info,
    'studio media',
    'tiny (1x1) image refused, no row',
    afterTiny[0]?.n === before[0]?.n,
    `${before[0]?.n} → ${afterTiny[0]?.n}`,
  )
  await page.goto(`${ADMIN}/media`)
  await settle(page)
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'full-test.png', mimeType: 'image/png', buffer: makePng(640, 400) })
  await page
    .locator('input[name^="alt"]')
    .first()
    .fill(`${XSS} 🌴`)
    .catch(() => {})
  const submit = page.locator('form:has(input[type="file"]) button[type="submit"]').first()
  if (await submit.isVisible().catch(() => false)) await submit.click()
  await settle(page, 20_000)
  await page.waitForTimeout(2000)
  const after = await db()<{ n: number }[]>`select count(*)::int n from media`
  const problems = await watch.collect()
  check(
    info,
    'studio media',
    'upload stored a media row',
    (after[0]?.n ?? 0) > (before[0]?.n ?? 0),
    `${before[0]?.n} → ${after[0]?.n}`,
  )
  check(info, 'studio media', 'upload no crash', problems.length === 0, problems.join(' | '))
  // A non-image disguised as one must be refused without a crash.
  watch.reset()
  await page.goto(`${ADMIN}/media`)
  await settle(page)
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'evil.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<svg onload=alert(1)>'),
    })
  if (await submit.isVisible().catch(() => false)) await submit.click()
  await settle(page, 20_000)
  const evil = await watch.collect()
  check(info, 'studio media', 'fake image refused gracefully', evil.length === 0, evil.join(' | '))
})

test('activity CSV import: junk file handled', async ({ browserName: _browserName }, info) => {
  const watch = new Watch(page)
  await page.goto(`${ADMIN}/activity-import`)
  await settle(page)
  const file = page.locator('input[type="file"]').first()
  if (!(await file.count())) {
    check(info, 'studio activity-import', 'file input present', false)
    return
  }
  await file.setInputFiles({
    name: 'junk.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`name,price\n"${XSS}",-5\n,abc\n`),
  })
  const submit = page.locator('form:has(input[type="file"]) button[type="submit"]').first()
  if (await submit.isVisible().catch(() => false)) await submit.click()
  await settle(page, 20_000)
  const problems = await watch.collect()
  check(
    info,
    'studio activity-import',
    'junk CSV handled',
    problems.length === 0,
    problems.join(' | '),
  )
  const template = await page.request.get(`${ADMIN}/activity-import/template`)
  check(
    info,
    'studio activity-import',
    'template downloads',
    template.status() === 200,
    `${template.status()}`,
  )
})
