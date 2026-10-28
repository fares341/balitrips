import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

import { expect, type Page } from '@playwright/test'

import { closeDb, db } from '../support/db'
import { test } from '../support/fixtures'

import { ADMIN, check, OUT_DIR, settle, signInAs, uniqueTag, Watch } from './_support'

/**
 * Studio → Activities → New, end to end, as the seeded admin, in Arabic (the
 * owner's Studio language): every field of every tab, saved, reloaded and
 * read back from the database; then edit, publish/unpublish, duplicate and
 * preview. Plus each basic field valid / empty / invalid.
 *
 * Screenshots (1440 and 390) go to full-test-out/shots/.
 */

test.describe.configure({ mode: 'serial' })
test.skip(!process.env.ACCOUNTS_FILE, 'test accounts not created')

const SHOTS = resolve(OUT_DIR, 'shots')
mkdirSync(SHOTS, { recursive: true })

let page: Page
let watch: Watch
const tag = uniqueTag()
const slug = `full-trip-${tag}`
let activityId = ''

function makePng(width: number, height: number, shade: number): Buffer {
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
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, shade)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Full-page screenshots at 1440 and 390, then back to 1440. */
async function shots(name: string): Promise<void> {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(SHOTS, `${name}-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function row(): Promise<Record<string, unknown>> {
  const [found] = await db()`select * from activities where id = ${activityId}`
  return (found ?? {}) as Record<string, unknown>
}

async function submitMain(): Promise<void> {
  const before = page.url()
  await page.locator('form.a-form > .a-actions button[type="submit"]').first().click()
  // The action redirects on the client: wait for the new URL (?ok= / ?err=).
  await page.waitForURL((url) => url.href !== before, { timeout: 30_000 }).catch(() => {})
  await page.waitForLoadState('domcontentloaded')
  await settle(page)
}

async function flash(): Promise<string> {
  return (
    await page
      .locator('.a-flash')
      .allInnerTexts()
      .catch(() => [])
  ).join(' | ')
}

/** Adds a row to the LocalizedRepeater whose hidden input is `${name}__json`. */
async function repeaterAdd(name: string, ar: string, en: string): Promise<void> {
  const box = page.locator(`fieldset:has(input[name="${name}__json"])`)
  await box.locator('button.a-btn.ghost.small').last().click()
  const last = box.locator('li.a-rep-row').last()
  await last.locator('input[lang="ar"]').fill(ar)
  await last.locator('input[lang="en"]').fill(en)
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.21' },
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

test('new activity: basic fields valid / empty / invalid', async ({ browserName: _b }, info) => {
  await page.goto(`${ADMIN}/activities/new`)
  await settle(page)
  await shots('01-new-empty')

  // Empty: the server answers with a clear message, nothing is created.
  const before = Number((await db()`select count(*)::int as n from activities`)[0]?.n)
  await submitMain()
  const emptyMsg = await flash()
  check(info, 'new activity', 'empty form → clear error', /الاسم|name/i.test(emptyMsg), emptyMsg)
  check(
    info,
    'new activity',
    'empty form → stays on /new',
    page.url().includes('/activities/new'),
    page.url(),
  )
  const after = Number((await db()`select count(*)::int as n from activities`)[0]?.n)
  check(
    info,
    'new activity',
    'empty form → nothing created',
    before === after,
    `${before}→${after}`,
  )
  await shots('02-new-empty-error')

  // Invalid slug: the browser refuses, the summary names the field.
  await page.locator('#name_ar').fill('رحلة برابط خاطئ')
  await page.locator('#slug').fill('Bad Slug!')
  await page.locator('form.a-form > .a-actions button[type="submit"]').first().click()
  const summary = page.getByTestId('form-errors')
  await expect(summary).toBeVisible()
  check(
    info,
    'new activity',
    'invalid slug → error summary',
    (await summary.innerText()).length > 0,
  )
  await shots('03-new-invalid-slug')

  // Invalid price: server error, and what was typed is kept.
  await page.locator('#slug').fill(`bad-price-${tag}`)
  await page.locator('#priceMinor').fill('abc')
  await submitMain()
  const priceMsg = await flash()
  check(info, 'new activity', 'invalid price → error', page.url().includes('err='), priceMsg)
  check(
    info,
    'new activity',
    'invalid price → typed values kept',
    (await page.locator('#name_ar').inputValue()) === 'رحلة برابط خاطئ',
    await page.locator('#name_ar').inputValue(),
  )
  await shots('04-new-invalid-price-kept')

  // Negative price.
  await page.locator('#priceMinor').fill('-5')
  await submitMain()
  check(info, 'new activity', 'negative price → error', page.url().includes('err='), await flash())

  // Arabic-only name, no slug: saved (the owner's case), slug made automatically.
  await page.goto(`${ADMIN}/activities/new`)
  await settle(page)
  await page.locator('#name_ar').fill(`رحلة عربية فقط ${tag}`)
  await submitMain()
  const arabicOk = /\/activities\/[0-9a-f-]{36}/.test(page.url())
  check(
    info,
    'new activity',
    'Arabic-only name, empty slug → created',
    arabicOk,
    `${page.url()} ${await flash()}`,
  )
  const [arRow] =
    await db()`select slug, status from activities where name->>'ar' = ${`رحلة عربية فقط ${tag}`}`
  check(
    info,
    'new activity',
    'auto slug valid',
    /^[a-z0-9-]+$/.test(String(arRow?.slug ?? '')),
    String(arRow?.slug),
  )
  check(info, 'new activity', 'created as draft', arRow?.status === 'draft', String(arRow?.status))
})

test('new activity: every tab filled, saved, reloaded, persisted', async ({
  browserName: _b,
}, info) => {
  watch.reset()
  await page.goto(`${ADMIN}/activities/new`)
  await settle(page)
  await page.locator('#name_ar').fill('رحلة كاملة')
  await page.locator('#name_en').fill(`Full Trip ${tag}`)
  await page.locator('#name_id').fill('Perjalanan Lengkap')
  await page.locator('#status').selectOption('published') // new + published → saved as draft
  await page.locator('#area_ar').fill('أوبود')
  await page.locator('#area_en').fill('Ubud')
  await page.locator('#duration_ar').fill('٥ ساعات')
  await page.locator('#duration_en').fill('5 hours')
  await page.locator('#regionId').selectOption({ index: 1 })
  await page.locator('#primaryCategoryId').selectOption({ index: 1 })
  const extra = page.locator('input[name="categoryIds"]')
  if ((await extra.count()) > 2) await extra.nth(2).check()
  const tagBox = page.locator('input[name="tagIds"]')
  if ((await tagBox.count()) > 0) await tagBox.first().check()
  await page.locator('input[name="isFeatured"]').check()
  await page.locator('input[name="showOnHome"]').check()
  await page.locator('#priceMinor').fill('125')
  await page.locator('#currency').fill('USD')
  await shots('05-basics-filled')
  await submitMain()
  const m = /\/activities\/([0-9a-f-]{36})/.exec(page.url())
  activityId = m?.[1] ?? ''
  check(
    info,
    'new activity',
    'full basics → created',
    activityId !== '',
    `${page.url()} ${await flash()}`,
  )
  check(
    info,
    'new activity',
    'continues to the content step',
    page.url().includes('tab=content'),
    page.url(),
  )
  await shots('06-created-content-step')
  expect(activityId).not.toBe('')

  let r = await row()
  check(info, 'basics', 'slug from English name', r.slug === slug, String(r.slug))
  check(info, 'basics', 'saved as draft', r.status === 'draft', String(r.status))
  check(
    info,
    'basics',
    'name ar/en/id',
    JSON.stringify(r.name) ===
      JSON.stringify({ ar: 'رحلة كاملة', en: `Full Trip ${tag}`, id: 'Perjalanan Lengkap' }) ||
      ((r.name as { ar: string }).ar === 'رحلة كاملة' &&
        (r.name as { id: string }).id === 'Perjalanan Lengkap'),
    JSON.stringify(r.name),
  )
  check(info, 'basics', 'area', (r.area as { en?: string })?.en === 'Ubud')
  check(info, 'basics', 'duration', (r.duration as { ar?: string })?.ar === '٥ ساعات')
  check(info, 'basics', 'region', r.region_id !== null)
  check(info, 'basics', 'category', r.primary_category_id !== null)
  check(info, 'basics', 'price 125.00', Number(r.price_minor) === 12500, String(r.price_minor))
  check(info, 'basics', 'featured + home', r.is_featured === true && r.show_on_home === true)
  const cats =
    await db()`select count(*)::int as n from activity_categories where activity_id = ${activityId}`
  check(info, 'basics', 'categories saved', Number(cats[0]?.n) >= 1, String(cats[0]?.n))

  // --- content
  await page.goto(`${ADMIN}/activities/${activityId}?tab=content`)
  await settle(page)
  await page.locator('#headline_ar').fill('مغامرة لا تُنسى')
  await page.locator('#headline_en').fill('An unforgettable adventure')
  await page.locator('#shortDescription_ar').fill('وصف مختصر')
  await page.locator('#shortDescription_en').fill('Short description')
  await page.locator('#description_ar').fill('## الوصف\nنص طويل بالعربية')
  await page.locator('#description_en').fill('## Description\nLong English text')
  await repeaterAdd('highlights', 'شروق الشمس', 'Sunrise')
  await repeaterAdd('highlights', 'فطور', '')
  await repeaterAdd('included', 'مرشد', 'Guide')
  await repeaterAdd('excluded', 'تذاكر الطيران', 'Flights')
  await repeaterAdd('suitableFor', 'العائلات', 'Families')
  await repeaterAdd('importantNotes', 'أحضر حذاءً مريحًا', 'Comfortable shoes')
  await shots('07-content-filled')
  await submitMain()
  r = await row()
  check(
    info,
    'content',
    'headline',
    (r.headline as { en?: string })?.en === 'An unforgettable adventure',
  )
  check(
    info,
    'content',
    'short description',
    (r.short_description as { ar?: string })?.ar === 'وصف مختصر',
  )
  check(
    info,
    'content',
    'description markdown',
    String((r.description as { ar?: string })?.ar).includes('نص طويل'),
  )
  const hl = r.highlights as { ar: string; en: string }[]
  check(
    info,
    'content',
    'highlights incl. Arabic-only line',
    hl?.length === 2 && hl[1]?.ar === 'فطور',
    JSON.stringify(hl),
  )
  check(
    info,
    'content',
    'included/excluded/suitable/notes',
    [r.included, r.excluded, r.suitable_for, r.important_notes].every(
      (v) => Array.isArray(v) && v.length === 1,
    ),
  )

  // --- media: upload two photos, pick hero + gallery
  await page.goto(`${ADMIN}/media`)
  await settle(page)
  for (const shade of [0x40, 0x90]) {
    await page.goto(`${ADMIN}/media`)
    await settle(page)
    const mediaUrl = page.url()
    await page.locator('input[type="file"][name="file"]').setInputFiles({
      name: `act-${tag}-${shade}.png`,
      mimeType: 'image/png',
      buffer: makePng(1600, 1000, shade),
    })
    await page.locator('form:has(input[name="file"]) button[type="submit"]').first().click()
    await page.waitForURL((url) => url.href !== mediaUrl, { timeout: 60_000 }).catch(() => {})
    await settle(page, 30_000)
  }
  const media =
    await db()`select id from media where deleted_at is null and created_at > now() - interval '5 minutes' order by created_at desc limit 2`
  check(
    info,
    'media',
    'two photos uploaded',
    media.length === 2,
    `${media.length} ${await flash()}`,
  )
  await page.goto(`${ADMIN}/activities/${activityId}?tab=media`)
  await settle(page)
  const heroId = String(media[0]?.id ?? '')
  await page
    .locator(`input[type="radio"][name="heroImageId"][value="${heroId}"]`)
    .evaluate((el: HTMLInputElement) => {
      el.checked = true
    })
  const fieldset = page
    .locator('fieldset:has(input[name="galleryIds"]), fieldset:has(button[aria-expanded])')
    .first()
  await page.getByRole('button', { name: /إضافة صور من المكتبة|Add photos from the library/ }).click()
  const pick = page.locator('fieldset button[aria-pressed="false"]')
  if ((await pick.count()) > 0) await pick.first().click()
  if ((await pick.count()) > 0) await pick.first().click()
  void fieldset
  await shots('08-media-filled')
  await submitMain()
  r = await row()
  check(info, 'media', 'hero saved', r.hero_image_id === heroId, String(r.hero_image_id))
  const gal =
    await db()`select count(*)::int as n from activity_images where activity_id = ${activityId}`
  check(info, 'media', 'gallery saved', Number(gal[0]?.n) >= 1, String(gal[0]?.n))

  // --- packages: one per pricing mode, Arabic-only names and lists
  const modes: [string, string, string | null][] = [
    ['per-person', 'per_person', null],
    ['group', 'per_group', '4'],
    ['couple', 'per_couple', null],
    ['fixed', 'fixed', null],
  ]
  for (const [key, mode, group] of modes) {
    await page.goto(`${ADMIN}/activities/${activityId}?tab=packages`)
    await settle(page)
    const form = page.locator('form:has(#new_tier_key)')
    await form.locator('#new_tier_key').fill(key)
    await form.locator('input[name="name_ar"]').fill(`باقة ${key}`)
    await form.locator('input[name="priceMinor"]').fill('80')
    await form.locator('#new_tier_mode').selectOption(mode)
    if (group) await form.locator('#new_tier_group').fill(group)
    await form.locator('textarea[name="includes_ar"]').fill('مرشد\nنقل')
    await form.locator('textarea[name="features_ar"]').fill('خاص')
    if (key === 'per-person') await shots('09-package-new')
    await form.locator('button[type="submit"]').first().click()
    await settle(page)
    check(info, 'packages', `add ${mode}`, !page.url().includes('err='), await flash())
  }
  const tiers =
    await db()`select key, pricing_mode, group_max, includes, name from activity_tiers where activity_id = ${activityId} and deleted_at is null order by sort_order`
  check(info, 'packages', 'four packages saved', tiers.length === 4, String(tiers.length))
  check(
    info,
    'packages',
    'pricing modes',
    tiers.map((t) => t.pricing_mode).join(',') === 'per_person,per_group,per_couple,fixed',
    tiers.map((t) => t.pricing_mode).join(','),
  )
  check(
    info,
    'packages',
    'Arabic-only includes kept',
    (tiers[0]?.includes as unknown[] | null)?.length === 2,
    JSON.stringify(tiers[0]?.includes),
  )
  check(info, 'packages', 'group size', tiers[1]?.group_max === 4)
  await page.goto(`${ADMIN}/activities/${activityId}?tab=packages`)
  await settle(page)
  await shots('10-packages-list')

  // --- add-ons: each pricing mode
  for (const [mode, qty] of [
    ['per_person', null],
    ['per_booking', null],
    ['per_qty', '3'],
    ['per_hour', '4'],
  ] as const) {
    await page.goto(`${ADMIN}/activities/${activityId}?tab=addons`)
    await settle(page)
    const form = page.locator('form:has(#new_addon_pricing)')
    await form.locator('input[name="name_ar"]').fill(`إضافة ${mode}`)
    await form.locator('input[name="priceMinor"]').fill('10')
    await form.locator('#new_addon_pricing').selectOption(mode)
    if (qty) await form.locator('#new_addon_max').fill(qty)
    await form.locator('button[type="submit"]').first().click()
    await settle(page)
    check(info, 'add-ons', `add ${mode}`, !page.url().includes('err='), await flash())
  }
  const addons =
    await db()`select pricing, max_qty from activity_addons where activity_id = ${activityId} and deleted_at is null`
  check(info, 'add-ons', 'four add-ons saved', addons.length === 4, String(addons.length))
  await shots('11-addons')

  // --- booking: invalid first, then valid
  await page.goto(`${ADMIN}/activities/${activityId}?tab=booking`)
  await settle(page)
  await page.locator('#meetingLat').fill('-8.5')
  await page.locator('#meetingLng').fill('')
  await submitMain()
  check(info, 'booking', 'lat without lng → error', page.url().includes('err='), await flash())
  await page.goto(`${ADMIN}/activities/${activityId}?tab=booking`)
  await settle(page)
  await page.locator('#minGuests').fill('9')
  await page.locator('#maxGuests').fill('3')
  await submitMain()
  check(info, 'booking', 'min > max → error', page.url().includes('err='), await flash())
  await page.goto(`${ADMIN}/activities/${activityId}?tab=booking`)
  await settle(page)
  await page.locator('#timeSlots').fill('25:00')
  await submitMain()
  check(info, 'booking', 'bad time → error', page.url().includes('err='), await flash())

  await page.goto(`${ADMIN}/activities/${activityId}?tab=booking`)
  await settle(page)
  await page.locator('#leadTimeHours').fill('12')
  await page.locator('#minGuests').fill('2')
  await page.locator('#maxGuests').fill('10')
  await page.locator('#timeSlots').fill('08:00\n14:30')
  await page.locator('#meetingPoint_ar').fill('بهو الفندق')
  await page.locator('#meetingPoint_en').fill('Hotel lobby')
  await page.locator('#meetingLat').fill('-8.5069')
  await page.locator('#meetingLng').fill('115.2625')
  await page.locator('#meetingMapUrl').fill('https://maps.google.com/?q=-8.5069,115.2625')
  await page.locator('#meetingTimeNote_ar').fill('قبل ١٥ دقيقة')
  await repeaterAdd('whatToBring', 'قبعة', 'Hat')
  await repeaterAdd('ageConditions', 'من ١٠ سنوات', 'From 10 years')
  await page.locator('input[name="instantConfirmation"]').check()
  await page.locator('#freeCancellationHours').fill('24')
  await page.locator('#cancellationPolicy_ar').fill('إلغاء مجاني قبل ٢٤ ساعة')
  await shots('12-booking-filled')
  await submitMain()
  r = await row()
  check(info, 'booking', 'saved', !page.url().includes('err='), await flash())
  check(
    info,
    'booking',
    'lead time / guests',
    r.lead_time_hours === 12 && r.min_guests === 2 && r.max_guests === 10,
  )
  check(
    info,
    'booking',
    'time slots',
    JSON.stringify(r.time_slots) === '["08:00","14:30"]',
    JSON.stringify(r.time_slots),
  )
  check(
    info,
    'booking',
    'meeting point + map',
    (r.meeting_point as { en?: string })?.en === 'Hotel lobby' &&
      Number(r.meeting_lat) === -8.5069 &&
      String(r.meeting_map_url).startsWith('https://'),
  )
  check(
    info,
    'booking',
    'meeting time',
    (r.meeting_time_note as { ar?: string })?.ar === 'قبل ١٥ دقيقة',
  )
  check(
    info,
    'booking',
    'what to bring + age',
    (r.what_to_bring as unknown[]).length === 1 && (r.age_conditions as unknown[]).length === 1,
  )
  check(
    info,
    'booking',
    'instant + free cancel',
    r.instant_confirmation === true && r.free_cancellation_hours === 24,
  )

  // --- FAQ
  await page.goto(`${ADMIN}/activities/${activityId}?tab=faq`)
  await settle(page)
  for (const [q, a] of [
    ['هل يناسب الأطفال؟', 'نعم من ١٠ سنوات'],
    ['ماذا أرتدي؟', 'ملابس مريحة'],
  ]) {
    await page.getByRole('button', { name: /إضافة سؤال جديد|Add a new question/ }).click()
    const last = page.locator('li:has(textarea[lang="ar"])').last()
    await last
      .locator('input[lang="ar"]')
      .first()
      .fill(q ?? '')
    await last
      .locator('textarea[lang="ar"]')
      .first()
      .fill(a ?? '')
  }
  await shots('13-faq-filled')
  await submitMain()
  r = await row()
  check(
    info,
    'faq',
    'two questions saved',
    (r.faq as unknown[])?.length === 2,
    JSON.stringify(r.faq),
  )

  // --- SEO
  await page.goto(`${ADMIN}/activities/${activityId}?tab=seo`)
  await settle(page)
  if (await page.locator('#seoTitle_ar').count()) {
    await page.locator('#seoTitle_ar').fill('رحلة كاملة في بالي')
    await submitMain()
    r = await row()
    check(info, 'seo', 'seo title', (r.seo_title as { ar?: string })?.ar === 'رحلة كاملة في بالي')
  }

  // --- reload: what the editor shows is what was saved
  await page.goto(`${ADMIN}/activities/${activityId}`)
  await settle(page)
  check(
    info,
    'reload',
    'basics name',
    (await page.locator('#name_en').inputValue()) === `Full Trip ${tag}`,
  )
  check(info, 'reload', 'basics slug', (await page.locator('#slug').inputValue()) === slug)
  await page.goto(`${ADMIN}/activities/${activityId}?tab=booking`)
  await settle(page)
  check(
    info,
    'reload',
    'booking slots',
    (await page.locator('#timeSlots').inputValue()).includes('14:30'),
  )
  check(
    info,
    'reload',
    'map url',
    (await page.locator('#meetingMapUrl').inputValue()).startsWith('https://'),
  )
  await page.goto(`${ADMIN}/activities/${activityId}?tab=content`)
  await settle(page)
  check(
    info,
    'reload',
    'headline',
    (await page.locator('#headline_en').inputValue()) === 'An unforgettable adventure',
  )

  const problems = await watch.collect()
  check(
    info,
    'new activity',
    'no crash / 5xx during the flow',
    problems.length === 0,
    problems.join(' | '),
  )
})

test('edit, publish / unpublish, duplicate, preview', async ({ browserName: _b }, info) => {
  expect(activityId).not.toBe('')
  // Edit + re-save.
  await page.goto(`${ADMIN}/activities/${activityId}`)
  await settle(page)
  await page.locator('#name_en').fill(`Full Trip ${tag} edited`)
  await submitMain()
  let r = await row()
  check(
    info,
    'edit',
    're-save basics',
    (r.name as { en?: string }).en === `Full Trip ${tag} edited`,
    await flash(),
  )

  // Slug taken by another activity → clear message.
  const [other] =
    await db()`select slug from activities where id <> ${activityId} and deleted_at is null limit 1`
  await page.goto(`${ADMIN}/activities/${activityId}`)
  await settle(page)
  await page.locator('#slug').fill(String(other?.slug))
  await submitMain()
  const taken = await flash()
  check(
    info,
    'edit',
    'slug taken → names the other activity',
    page.url().includes('err=') && taken.includes(String(other?.slug)),
    taken,
  )
  r = await row()
  check(info, 'edit', 'slug unchanged after refusal', r.slug === slug, String(r.slug))

  // Clear «needs review» if set, then publish.
  await db()`update activities set needs_review = false where id = ${activityId}`
  await page.goto(`${ADMIN}/activities/${activityId}`)
  await settle(page)
  await shots('14-basics-checklist')
  await page.locator('#status').selectOption('published')
  await submitMain()
  r = await row()
  check(info, 'publish', 'published', r.status === 'published', `${r.status} ${await flash()}`)
  await shots('15-published')
  const pub = await page.request.get(`/ar/activities/${slug}`)
  check(info, 'publish', 'public page opens', pub.status() === 200, String(pub.status()))

  await page.locator('#status').selectOption('draft')
  await submitMain()
  r = await row()
  check(info, 'publish', 'unpublished', r.status === 'draft', String(r.status))
  const hidden = await page.request.get(`/ar/activities/${slug}`)
  check(
    info,
    'publish',
    'public page gone when draft',
    hidden.status() === 404,
    String(hidden.status()),
  )

  // Preview (staff only).
  const preview = await page.request.get(`/ar/activities/${slug}/preview`)
  check(
    info,
    'preview',
    'preview opens for staff',
    preview.status() === 200,
    String(preview.status()),
  )

  // Duplicate.
  const count = Number(
    (await db()`select count(*)::int as n from activities where slug like ${`${slug}%`}`)[0]?.n,
  )
  await page.goto(`${ADMIN}/activities/${activityId}`)
  await settle(page)
  await page
    .getByRole('button', { name: /^(نسخ|Duplicate)$/ })
    .first()
    .click()
  await settle(page)
  const after = Number(
    (await db()`select count(*)::int as n from activities where slug like ${`${slug}%`}`)[0]?.n,
  )
  check(info, 'duplicate', 'copy created', after === count + 1, `${count}→${after} ${page.url()}`)
  const [copy] =
    await db()`select id from activities where slug like ${`${slug}-%`} order by created_at desc limit 1`
  const copyTiers = copy
    ? await db()`select count(*)::int as n from activity_tiers where activity_id = ${String(copy.id)}`
    : [{ n: 0 }]
  check(
    info,
    'duplicate',
    'copy has the packages',
    Number(copyTiers[0]?.n) === 4,
    String(copyTiers[0]?.n),
  )
})
