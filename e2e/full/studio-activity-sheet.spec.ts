import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'

import { closeDb, db } from '../support/db'
import { test } from '../support/fixtures'

import { ADMIN, check, OUT_DIR, settle, signInAs, uniqueTag, Watch } from './_support'

/**
 * Activities ⇄ spreadsheet: template (.xlsx/.csv), export, upload with
 * preview, apply. Round trip: export → import unchanged = zero changes;
 * edited → exactly the expected updates. Bad rows → errors, nothing applied.
 */

test.describe.configure({ mode: 'serial' })
test.skip(!process.env.ACCOUNTS_FILE, 'test accounts not created')

const SHOTS = resolve(OUT_DIR, 'shots')
const SAMPLES = resolve(OUT_DIR, 'samples')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(SAMPLES, { recursive: true })

let page: Page
let watch: Watch
const tag = uniqueTag()
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function shots(name: string): Promise<void> {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(SHOTS, `${name}-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function download(path: string, file: string): Promise<Buffer> {
  const response = await page.request.get(`${ADMIN}${path}`)
  expect(response.status(), path).toBe(200)
  const body = Buffer.from(await response.body())
  writeFileSync(resolve(SAMPLES, file), body)
  return body
}

/** Upload and preview; returns the kinds of the preview rows and the error count. */
async function previewFile(name: string, buffer: Buffer, mimeType: string) {
  await page.goto(`${ADMIN}/activity-import`)
  await settle(page)
  await page.locator('#file').setInputFiles({ name, mimeType, buffer })
  await page.getByRole('button', { name: /^(معاينة|Preview)$/ }).click()
  await expect(page.locator('[data-testid="sheet-preview"], .a-flash').first()).toBeVisible({
    timeout: 60_000,
  })
  await page.waitForTimeout(500)
  const kinds = await page
    .locator('[data-testid="sheet-items"] tbody tr')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-kind') ?? ''))
  const errors = await page.locator('[data-testid="sheet-errors"] li').allInnerTexts()
  const message = (await page.locator('.a-flash').allInnerTexts()).join(' ')
  return { kinds, errors, message }
}

async function workbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  return wb
}

function keyIndex(ws: ExcelJS.Worksheet, key: string): number {
  const keys = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
  return keys.indexOf(key)
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.22' },
    viewport: { width: 1440, height: 900 },
  })
  page = await context.newPage()
  watch = new Watch(page)
  await signInAs(page, 'admin')
  await context.addCookies([
    { name: 'studio_lang', value: 'ar', url: page.url().replace(/(https?:\/\/[^/]+).*/, '$1') },
  ])
})

test.afterAll(async () => {
  await page?.context().close()
  await closeDb()
})

test('template downloads (.xlsx and .csv) with sheets, key row and dropdowns', async ({
  browserName: _b,
}, info) => {
  await page.goto(`${ADMIN}/activities`)
  await settle(page)
  for (const label of ['تحميل قالب', 'تصدير الأنشطة', 'رفع ملف']) {
    check(
      info,
      'activities list',
      `button «${label}»`,
      (await page.getByText(label, { exact: true }).count()) > 0,
    )
  }
  await page.goto(`${ADMIN}/activity-import`)
  await settle(page)
  await shots('20-import-page')

  const xlsx = await download('/activity-import/template', 'activities-template.xlsx')
  const wb = await workbook(xlsx)
  const names = wb.worksheets.map((ws) => ws.name)
  check(
    info,
    'template',
    'sheets',
    ['Instructions', 'Activities', 'Packages', 'AddOns', 'FAQ'].every((n) => names.includes(n)),
    names.join(','),
  )
  const acts = wb.getWorksheet('Activities')
  check(info, 'template', 'key row', acts !== undefined && keyIndex(acts, 'activity_slug') > 0)
  check(
    info,
    'template',
    'Arabic label row',
    String(acts?.getRow(1).getCell(1).value ?? '').includes('المعرّف'),
  )
  const statusCol = acts ? keyIndex(acts, 'status') : -1
  const validation = acts?.getCell(3, statusCol).dataValidation
  check(
    info,
    'template',
    'status dropdown',
    validation?.type === 'list',
    JSON.stringify(validation),
  )
  const pkg = wb.getWorksheet('Packages')
  const pv = pkg?.getCell(3, keyIndex(pkg, 'pricing')).dataValidation
  check(info, 'template', 'pricing dropdown', pv?.type === 'list')
  const rv = acts?.getCell(3, keyIndex(acts, 'region')).dataValidation
  check(info, 'template', 'region dropdown', rv?.type === 'list')
  const csv = await download('/activity-import/template?format=csv', 'activities-template.csv')
  check(info, 'template', 'csv has key row', csv.toString('utf8').includes('"activity_slug"'))

  // The template as downloaded imports to nothing (its rows are examples).
  const result = await previewFile('activities-template.xlsx', xlsx, XLSX)
  check(
    info,
    'template',
    'template import → no rows, no crash',
    result.kinds.length === 0,
    `${result.message} ${result.errors.join(' | ')}`,
  )
})

test('export → import unchanged = zero changes (xlsx and csv)', async ({
  browserName: _b,
}, info) => {
  const exported = await download('/activity-import/export', 'activities-export.xlsx')
  const wb = await workbook(exported)
  const rows = (wb.getWorksheet('Activities')?.rowCount ?? 0) - 2
  const stored = Number(
    (await db()`select count(*)::int as n from activities where deleted_at is null`)[0]?.n,
  )
  check(
    info,
    'export',
    'every activity exported',
    rows === stored,
    `${rows} rows / ${stored} stored`,
  )

  const xl = await previewFile('activities-export.xlsx', exported, XLSX)
  await shots('21-preview-unchanged')
  check(
    info,
    'round trip xlsx',
    'no errors',
    xl.errors.length === 0,
    xl.errors.slice(0, 8).join(' | '),
  )
  check(
    info,
    'round trip xlsx',
    'zero new / updated',
    xl.kinds.every((k) => k === 'same'),
    xl.kinds.filter((k) => k !== 'same').length + ' changed',
  )

  const csv = await download('/activity-import/export?format=csv', 'activities-export.csv')
  const c = await previewFile('activities-export.csv', csv, 'text/csv')
  check(
    info,
    'round trip csv',
    'no errors',
    c.errors.length === 0,
    c.errors.slice(0, 8).join(' | '),
  )
  check(
    info,
    'round trip csv',
    'zero new / updated',
    c.kinds.every((k) => k === 'same'),
    c.kinds.filter((k) => k !== 'same').length + ' changed',
  )
})

test('edited export → expected updates, applied, idempotent', async ({ browserName: _b }, info) => {
  watch.reset()
  const exported = await download('/activity-import/export', 'activities-export-2.xlsx')
  const wb = await workbook(exported)
  const acts = wb.getWorksheet('Activities') as ExcelJS.Worksheet
  const slugCol = keyIndex(acts, 'activity_slug')
  const nameCol = keyIndex(acts, 'name_ar')
  const priceCol = keyIndex(acts, 'price')
  let target = ''
  let targetRow = 0
  acts.eachRow((r, n) => {
    if (n > 2 && !target) {
      target = String(r.getCell(slugCol).value ?? '')
      targetRow = n
    }
  })
  acts.getCell(targetRow, nameCol).value = `اسم معدّل ${tag}`
  acts.getCell(targetRow, priceCol).value = '99.50'
  const newSlug = `sheet-new-${tag}`
  const added = acts.addRow([])
  added.getCell(slugCol).value = newSlug
  added.getCell(nameCol).value = 'نشاط من الجدول'
  added.getCell(keyIndex(acts, 'region')).value = 'ubud'
  added.getCell(keyIndex(acts, 'status')).value = 'draft'
  added.getCell(keyIndex(acts, 'highlights_ar')).value = 'أول | ثاني'
  added.getCell(keyIndex(acts, 'price')).value = 30
  added.getCell(keyIndex(acts, 'currency')).value = 'USD'
  const pk = wb.getWorksheet('Packages') as ExcelJS.Worksheet
  const pr = pk.addRow([])
  pr.getCell(keyIndex(pk, 'activity_slug')).value = newSlug
  pr.getCell(keyIndex(pk, 'package_key')).value = 'basic'
  pr.getCell(keyIndex(pk, 'name_ar')).value = 'أساسية'
  pr.getCell(keyIndex(pk, 'pricing')).value = 'per_group'
  pr.getCell(keyIndex(pk, 'included_persons')).value = 4
  pr.getCell(keyIndex(pk, 'price')).value = '120'
  const ad = wb.getWorksheet('AddOns') as ExcelJS.Worksheet
  const ar = ad.addRow([])
  ar.getCell(keyIndex(ad, 'activity_slug')).value = newSlug
  ar.getCell(keyIndex(ad, 'name_ar')).value = 'غداء'
  ar.getCell(keyIndex(ad, 'pricing')).value = 'per_person'
  ar.getCell(keyIndex(ad, 'price')).value = '12'
  const fq = wb.getWorksheet('FAQ') as ExcelJS.Worksheet
  const fr = fq.addRow([])
  fr.getCell(keyIndex(fq, 'activity_slug')).value = newSlug
  fr.getCell(keyIndex(fq, 'question_ar')).value = 'هل يشمل النقل؟'
  fr.getCell(keyIndex(fq, 'answer_ar')).value = 'نعم'
  const edited = Buffer.from(await wb.xlsx.writeBuffer())
  writeFileSync(resolve(SAMPLES, 'activities-edited.xlsx'), edited)

  const p = await previewFile('activities-edited.xlsx', edited, XLSX)
  await shots('22-preview-edited')
  check(info, 'edited import', 'no errors', p.errors.length === 0, p.errors.join(' | '))
  check(
    info,
    'edited import',
    'one new',
    p.kinds.filter((k) => k === 'new').length === 1,
    p.kinds.join(','),
  )
  check(
    info,
    'edited import',
    'one update',
    p.kinds.filter((k) => k === 'update').length === 1,
    p.kinds.join(','),
  )

  await page.getByRole('button', { name: /^(تطبيق التغييرات|Apply changes)$/ }).click()
  await expect(page.locator('.a-flash')).toContainText(/تم|Done/, { timeout: 120_000 })
  await shots('23-applied')
  const [upd] = await db()`select name, price_minor from activities where slug = ${target}`
  check(
    info,
    'apply',
    'name updated',
    (upd?.name as { ar?: string })?.ar === `اسم معدّل ${tag}`,
    JSON.stringify(upd?.name),
  )
  check(info, 'apply', 'price updated', Number(upd?.price_minor) === 9950, String(upd?.price_minor))
  const [created] =
    await db()`select id, status, needs_review, highlights, faq from activities where slug = ${newSlug}`
  check(
    info,
    'apply',
    'new activity created as draft',
    created?.status === 'draft',
    String(created?.status),
  )
  check(info, 'apply', 'highlights list', (created?.highlights as unknown[])?.length === 2)
  check(info, 'apply', 'faq', (created?.faq as unknown[])?.length === 1)
  const tiers = created
    ? await db()`select pricing_mode, group_max, price_minor from activity_tiers where activity_id = ${String(created.id)}`
    : []
  check(
    info,
    'apply',
    'package',
    tiers.length === 1 &&
      tiers[0]?.pricing_mode === 'per_group' &&
      tiers[0]?.group_max === 4 &&
      Number(tiers[0]?.price_minor) === 12000,
    JSON.stringify(tiers),
  )
  const addons = created
    ? await db()`select pricing from activity_addons where activity_id = ${String(created.id)}`
    : []
  check(info, 'apply', 'add-on', addons.length === 1)

  const again = await previewFile('activities-edited.xlsx', edited, XLSX)
  check(
    info,
    'apply',
    'same file again → zero changes',
    again.kinds.every((k) => k === 'same') && again.errors.length === 0,
    `${again.kinds.filter((k) => k !== 'same').length} changed; ${again.errors.join(' | ')}`,
  )
  const problems = await watch.collect()
  check(info, 'sheet import', 'no crash / 5xx', problems.length === 0, problems.join(' | '))
})

test('bad rows → clear errors per row, nothing applied', async ({ browserName: _b }, info) => {
  const header = [
    'type',
    'activity_slug',
    'name_ar',
    'region',
    'price',
    'package_key',
    'pricing',
    'max_guests',
    'min_guests',
    'map_url',
  ]
  const lines = [
    header,
    ['activity', 'Bad Slug', 'اسم', 'ubud', '10', '', '', '', '', ''],
    ['activity', `bad-region-${tag}`, 'اسم', 'mars', '10', '', '', '', '', ''],
    ['activity', `bad-price-${tag}`, 'اسم', 'ubud', 'abc', '', '', '', '', ''],
    ['activity', `no-name-${tag}`, '', 'ubud', '10', '', '', '', '', ''],
    ['activity', `bad-people-${tag}`, 'اسم', 'ubud', '10', '', '', '2', '5', ''],
    ['activity', `bad-map-${tag}`, 'اسم', 'ubud', '10', '', '', '', '', 'http://x'],
    ['package', `missing-${tag}`, 'باقة', '', '10', 'basic', 'per_person', '', '', ''],
    ['package', `bad-region-${tag}`, 'باقة', '', '10', 'basic', 'weekly', '', '', ''],
    ['unicorn', 'x', '', '', '', '', '', '', '', ''],
  ]
  const csv = '﻿' + lines.map((l) => l.map((c) => `"${c}"`).join(',')).join('\r\n')
  writeFileSync(resolve(SAMPLES, 'activities-bad.csv'), csv)
  const before = Number((await db()`select count(*)::int as n from activities`)[0]?.n)
  const p = await previewFile('activities-bad.csv', Buffer.from(csv), 'text/csv')
  await shots('24-preview-errors')
  check(
    info,
    'bad file',
    'one error per bad row',
    p.errors.length >= 9,
    `${p.errors.length}: ${p.errors.join(' | ')}`,
  )
  check(
    info,
    'bad file',
    'errors are in Arabic with row numbers',
    p.errors.every((e) => /الصف|السطر/.test(e)),
    p.errors[0] ?? '',
  )
  const apply = page.getByRole('button', { name: /^(تطبيق التغييرات|Apply changes)$/ })
  check(info, 'bad file', 'apply disabled', await apply.isDisabled())
  const after = Number((await db()`select count(*)::int as n from activities`)[0]?.n)
  check(info, 'bad file', 'nothing created', before === after)
})
