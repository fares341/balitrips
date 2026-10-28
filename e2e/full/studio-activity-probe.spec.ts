import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { type Page } from '@playwright/test'

import { closeDb, db } from '../support/db'
import { test } from '../support/fixtures'

import { ADMIN, OUT_DIR, settle, signInAs, uniqueTag } from './_support'

/**
 * Probe: what happens on Studio → Activities → New for the inputs an owner
 * really types. Records outcomes, never fails, so the report shows them all.
 */

test.describe.configure({ mode: 'serial' })
test.skip(!process.env.ACCOUNTS_FILE, 'test accounts not created')

let page: Page
const SHOTS = resolve(OUT_DIR, 'probe')
mkdirSync(SHOTS, { recursive: true })
const log: unknown[] = []

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.9' } })
  page = await context.newPage()
  await signInAs(page, 'admin')
})

test.afterAll(async () => {
  writeFileSync(resolve(SHOTS, 'probe.json'), JSON.stringify(log, null, 2))
  await page?.context().close()
  await closeDb()
})

async function attempt(name: string, fill: (p: Page) => Promise<void>): Promise<void> {
  const responses: string[] = []
  const onResp = (r: { status(): number; url(): string; request(): { method(): string } }) => {
    if (r.request().method() === 'POST') responses.push(`${r.status()} ${r.url()}`)
  }
  page.on('response', onResp)
  await page.goto(`${ADMIN}/activities/new`)
  await settle(page)
  await fill(page)
  const before = page.url()
  await page.locator('form.a-form button[type="submit"]').first().click()
  await page.waitForTimeout(4000)
  await settle(page)
  const invalid = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('form.a-form :invalid')].map(
      (el) => `${el.name}: ${el.validationMessage}`,
    ),
  )
  const flash = await page
    .locator('.a-flash, [role="alert"], [role="status"]')
    .allInnerTexts()
    .catch(() => [])
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true })
  page.off('response', onResp)
  log.push({ name, before, after: page.url(), invalid, flash, responses })
}

test('probe new activity save', async () => {
  const tag = uniqueTag()
  await attempt('arabic-only-no-slug', async (p) => {
    await p.locator('#name_ar, [name="name_ar"], [name="name.ar"]').first().fill('رحلة تجريبية')
  })
  await attempt('arabic-only-with-slug', async (p) => {
    await p.locator('[name$="ar"]').first().fill('رحلة تجريبية')
    await p.locator('#slug').fill(`probe-ar-${tag}`)
  })
  await attempt('full-valid', async (p) => {
    const names = await p.$$eval('fieldset input', (els) =>
      els.map((e) => (e as HTMLInputElement).name),
    )
    log.push({ fieldNames: names })
    await p.locator('[name$="ar"]').first().fill('رحلة كاملة')
    await p.locator('[name$="en"]').first().fill('Full trip')
    await p.locator('#slug').fill(`probe-full-${tag}`)
  })
  await attempt('published-on-new', async (p) => {
    await p.locator('[name$="ar"]').first().fill('رحلة منشورة')
    await p.locator('[name$="en"]').first().fill('Published trip')
    await p.locator('#slug').fill(`probe-pub-${tag}`)
    await p.locator('#status').selectOption('published')
  })
  await attempt('duplicate-slug', async (p) => {
    await p.locator('[name$="ar"]').first().fill('مكرر')
    await p.locator('[name$="en"]').first().fill('Dup')
    await p.locator('#slug').fill(`probe-full-${tag}`)
  })
  await attempt('with-region-category-price', async (p) => {
    await p.locator('[name$="ar"]').first().fill('رحلة بسعر')
    await p.locator('[name$="en"]').first().fill('Priced trip')
    await p.locator('#slug').fill(`probe-price-${tag}`)
    await p.locator('#regionId').selectOption({ index: 1 })
    await p.locator('#primaryCategoryId').selectOption({ index: 1 })
    await p.locator('#priceMinor').fill('125')
  })
  const rows = await db()`select slug, status from activities where slug like ${'probe-%'}`
  log.push({ rows })
})
