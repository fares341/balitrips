// End-to-end check of the AI assistants in a real browser (CI only, see
// .github/workflows/assistant-check.yml). The app runs against the mock
// OpenRouter in scripts/mock-openrouter.mjs. Results go to ./assistant-check
// (pushed to the `assistant-check` branch): summary.txt, results.json, log.txt,
// shots/*.png, the mock's request log and the server log.
//
// Inputs (env): SHOTS_BASE, ADMIN_BASE_PATH, ACCOUNTS_FILE, TEST_ACCOUNT_PASSWORD,
// TEST_ACCOUNT_DOMAIN, MOCK_LOG, MOCK_VIOLATIONS.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.SHOTS_BASE ?? 'http://localhost:3000'
const ADMIN = (process.env.ADMIN_BASE_PATH ?? '/studio-ci7').replace(/\/$/, '')
const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD ?? ''
const DOMAIN = process.env.TEST_ACCOUNT_DOMAIN ?? 'test.balitrips.local'
const MOCK_LOG = process.env.MOCK_LOG ?? 'assistant-check/mock-requests.jsonl'
const MOCK_VIOLATIONS = process.env.MOCK_VIOLATIONS ?? 'assistant-check/mock-violations.txt'
const OUT = 'assistant-check'
mkdirSync(`${OUT}/shots`, { recursive: true })

const results = []
const log = []
const say = (line) => {
  log.push(line)
  console.log(line)
}
const flush = () => {
  writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n')
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
  const bad = results.filter((r) => !r.ok)
  writeFileSync(
    `${OUT}/summary.txt`,
    [
      `Assistant check — ${results.length} checks, ${bad.length} problem(s)`,
      '',
      ...results.map(
        (r) =>
          `${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}${r.shot ? `  [${r.shot}]` : ''}`,
      ),
    ].join('\n') + '\n',
  )
}
process.on('exit', flush)
function record(name, ok, detail = '', shot = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 600), shot })
  say(`${ok ? 'OK  ' : 'FAIL'} ${name} ${detail ? `— ${String(detail).slice(0, 300)}` : ''}`)
  if (!ok) console.log(`::error::${name}: ${String(detail).slice(0, 300)}`)
  flush()
}
let shotNo = 0
/** The panel header sits flush at the panel's top and the composer at its bottom. */
async function panelFlush(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.ai-panel')?.getBoundingClientRect()
    const head = document.querySelector('.ai-head')?.getBoundingClientRect()
    const foot = document.querySelector('.ai-panel > :last-child')?.getBoundingClientRect()
    if (!panel || !head || !foot) return { ok: false }
    const top = Math.round(head.top - panel.top)
    const bottom = Math.round(panel.bottom - foot.bottom)
    return { ok: top <= 2 && bottom <= 2, top, bottom }
  })
}
async function shot(page, label) {
  shotNo += 1
  const file = `shots/${String(shotNo).padStart(2, '0')}-${label.replace(/[^a-z0-9-]+/gi, '_')}.png`
  await page.screenshot({ path: `${OUT}/${file}` }).catch(() => {})
  return file
}
function db(what) {
  try {
    return JSON.parse(
      execFileSync('pnpm', ['exec', 'tsx', 'scripts/assistant-check-db.ts', what], {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .pop(),
    )
  } catch (e) {
    say(`db ${what} failed: ${e.message.split('\n')[0]}`)
    return null
  }
}

/* ---- TOTP (only if the server requires it) ------------------------------ */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(text) {
  let bits = 0
  let value = 0
  const out = []
  for (const ch of text.replace(/[\s=-]/g, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}
function totp(secret) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const d = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const o = d[d.length - 1] & 0x0f
  const bin =
    ((d[o] & 0x7f) << 24) | ((d[o + 1] & 0xff) << 16) | ((d[o + 2] & 0xff) << 8) | (d[o + 3] & 0xff)
  return String(bin % 1e6).padStart(6, '0')
}
function secrets() {
  const map = new Map()
  const file = process.env.ACCOUNTS_FILE
  if (!file || !existsSync(file)) return map
  let current = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const email = line.match(/^\s+(\S+@\S+)\s*$/)
    if (email) current = email[1]
    const secret = line.match(/^\s+secret:\s+([A-Z2-7 ]+)\s*$/)
    if (secret && current) map.set(current, secret[1].replace(/\s/g, ''))
  }
  return map
}
const SECRETS = secrets()

async function signIn(page, role) {
  const email = `${role}@${DOMAIN}`
  const start = role === 'customer' ? '/en/account?signin=1' : ADMIN
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(BASE + start, { waitUntil: 'networkidle', timeout: 60000 })
  const password = page.locator('input[autocomplete="current-password"]')
  await password.waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('input[autocomplete="username"]').fill(email)
  await password.fill(PASSWORD)
  await page
    .locator('form:has(input[autocomplete="current-password"]) button[type="submit"]')
    .first()
    .click()
  if (role === 'customer') {
    await page.waitForTimeout(4000)
    return true
  }
  await page.waitForURL((url) => url.pathname.startsWith(ADMIN), { timeout: 30000 }).catch(() => {})
  await page.waitForLoadState('networkidle')
  if (page.url().includes('/security') && SECRETS.get(email)) {
    await page.locator('#challenge').fill(totp(SECRETS.get(email)))
    await page.locator('#challenge').press('Enter')
    await page
      .waitForURL((url) => !url.pathname.includes('/security'), { timeout: 30000 })
      .catch(() => {})
  }
  return page.url().includes(ADMIN)
}

/* ---- Public panel helpers ---------------------------------------------- */
async function openPanel(page) {
  await page.locator('.ai-fab').click()
  await page.locator('.ai-panel').waitFor({ state: 'visible', timeout: 15000 })
  await page
    .waitForFunction(
      () => document.querySelector('#ai-input') || document.querySelector('.ai-off'),
      null,
      {
        timeout: 20000,
      },
    )
    .catch(() => {})
}
async function ask(page, text) {
  const before = await page.locator('.ai-msg.ai-bot').count()
  await page.locator('#ai-input').fill(text)
  await page.locator('.ai-send').click()
  await page.waitForFunction(
    (n) => document.querySelectorAll('.ai-msg.ai-bot').length > n,
    before,
    { timeout: 15000 },
  )
  await page.waitForFunction(
    () => document.querySelector('.ai-body')?.getAttribute('aria-busy') === 'false',
    null,
    {
      timeout: 90000,
    },
  )
  await page.waitForTimeout(300)
  return (await page.locator('.ai-msg.ai-bot').last().innerText()).trim()
}
async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}
function newContext(browser, width) {
  return browser.newContext({
    viewport: { width, height: width > 1000 ? 900 : 844 },
    deviceScaleFactor: 1,
    isMobile: width < 1000,
    hasTouch: width < 1000,
  })
}

const browser = await chromium.launch()
const pageErrors = []

/* 0. API contract (no browser UI) --------------------------------------- */
{
  const ctx = await browser.newContext()
  const r = ctx.request
  const status = await r.get(`${BASE}/api/assistant?locale=en`)
  const body = await status.json().catch(() => ({}))
  record(
    'GET /api/assistant reports available (key set, enabled)',
    body.available === true,
    JSON.stringify(body),
  )
  record('status response never contains the key', !JSON.stringify(body).includes('mock-key'))
  const cross = await r.post(`${BASE}/api/assistant`, {
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    data: { message: 'hi', locale: 'en' },
  })
  record('cross-origin POST refused (CSRF)', cross.status() === 403, `status ${cross.status()}`)
  const form = await r.post(`${BASE}/api/assistant`, {
    headers: { origin: BASE, 'content-type': 'application/x-www-form-urlencoded' },
    data: 'message=hi',
  })
  record('form-encoded POST refused (CSRF)', form.status() === 403, `status ${form.status()}`)
  const long = await r.post(`${BASE}/api/assistant`, {
    headers: { origin: BASE, 'content-type': 'application/json' },
    data: { message: 'x'.repeat(1001), locale: 'en' },
  })
  record('message over 1000 characters refused', long.status() === 400, `status ${long.status()}`)
  const staffApi = await r.post(`${BASE}/api/studio-assistant`, {
    headers: { origin: BASE, 'content-type': 'application/json' },
    data: { message: 'list orders' },
  })
  record(
    'Studio assistant API refuses a signed-out caller',
    staffApi.status() === 401,
    `status ${staffApi.status()}`,
  )
  await ctx.close()
}

/* 1. English, desktop: catalogue answer, safe rendering ------------------ */
{
  const ctx = await newContext(browser, 1440)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(`en-1440: ${e.message}`))
  await page.goto(`${BASE}/en`, { waitUntil: 'networkidle', timeout: 60000 })
  const fab = await shot(page, 'en-1440-home-button')
  record('en 1440: floating button visible', await page.locator('.ai-fab').isVisible(), '', fab)
  await openPanel(page)
  const open = await shot(page, 'en-1440-panel-open')
  record(
    'en 1440: panel opens with welcome and suggestions',
    (await page.locator('.ai-chip').count()) === 4,
    '',
    open,
  )
  const flushDesk = await panelFlush(page)
  record(
    'en 1440: panel header and composer flush with the panel edges',
    flushDesk.ok,
    JSON.stringify(flushDesk),
  )
  const reply = await ask(page, 'Which activity do you recommend?')
  const reply1 = await shot(page, 'en-1440-activity-answer')
  const links = await page
    .locator('.ai-msg.ai-bot')
    .last()
    .locator('a')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  record(
    'en 1440: answer streamed from a tool call (activity links)',
    links.some((h) => /^\/en\/activities\//.test(h ?? '')),
    `links: ${links.join(' ')} | ${reply.slice(0, 200)}`,
    reply1,
  )
  record(
    'sanitizer: no javascript: link rendered',
    !links.some((h) => /^javascript:/i.test(h ?? '')),
    links.join(' '),
  )
  record(
    'sanitizer: raw HTML shown as text, not markup',
    reply.includes('<b>bold?</b>') && (await page.locator('.ai-panel b').count()) === 0,
  )
  record(
    'sanitizer: Google Maps link kept, opens in a new tab',
    links.some((h) => (h ?? '').startsWith('https://www.google.com/maps')),
  )
  record('en 1440: no horizontal overflow', (await overflow(page)) <= 1)
  await ctx.close()
}

/* 2. English, phone: add to My Trip with the confirm button ------------- */
{
  const ctx = await newContext(browser, 390)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(`en-390: ${e.message}`))
  await page.goto(`${BASE}/en`, { waitUntil: 'networkidle', timeout: 60000 })
  const fabShot = await shot(page, 'en-390-home-button')
  const fabBox = await page.locator('.ai-fab').boundingBox()
  const waBox = await page
    .locator('.wa-fab')
    .boundingBox()
    .catch(() => null)
  const tabBox = await page
    .locator('.tabbar')
    .boundingBox()
    .catch(() => null)
  const clear = (a, b) =>
    !a ||
    !b ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y ||
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x
  record(
    'en 390: button above the tab bar and the WhatsApp button',
    fabBox && clear(fabBox, waBox) && clear(fabBox, tabBox),
    JSON.stringify({ fabBox, waBox, tabBox }),
    fabShot,
  )
  await openPanel(page)
  const sheet = await page.locator('.ai-panel').boundingBox()
  const sheetShot = await shot(page, 'en-390-sheet-open')
  record(
    'en 390: panel is a full-screen sheet',
    sheet && sheet.width >= 389 && sheet.height >= 800,
    JSON.stringify(sheet),
    sheetShot,
  )
  const flushPhone = await panelFlush(page)
  record(
    'en 390: sheet header and composer flush with the edges',
    flushPhone.ok,
    JSON.stringify(flushPhone),
  )
  const before = await page.evaluate(() => document.cookie.match(/bt_cart_count=(\d+)/)?.[1] ?? '0')
  const answer = await ask(page, 'Please add an activity to my trip')
  const card = page.locator('.ai-card').last()
  const hasCard = await card.isVisible().catch(() => false)
  const cardShot = await shot(page, 'en-390-confirm-card')
  record(
    'add to My Trip: proposal shows a confirmation card (nothing added yet)',
    hasCard,
    answer.slice(0, 300),
    cardShot,
  )
  const mid = await page.evaluate(() => document.cookie.match(/bt_cart_count=(\d+)/)?.[1] ?? '0')
  record(
    'add to My Trip: cart unchanged before Confirm',
    mid === before,
    `before ${before}, now ${mid}`,
  )
  if (hasCard) {
    await card.locator('.btn-primary').click()
    await page
      .locator('.ai-card-done, .ai-card-note')
      .last()
      .waitFor({ timeout: 30000 })
      .catch(() => {})
    const done = await page.locator('.ai-card-done').count()
    const doneShot = await shot(page, 'en-390-confirmed')
    const note = done
      ? ''
      : await page
          .locator('.ai-card')
          .last()
          .innerText()
          .catch(() => '')
    record(
      'add to My Trip: Confirm adds it through the booking validation',
      done > 0,
      note.slice(0, 300),
      doneShot,
    )
    const actions = db('actions')
    record(
      'add to My Trip: stored action finished',
      Array.isArray(actions) &&
        actions.some((a) => a.kind === 'add_to_trip' && a.status === 'done'),
      JSON.stringify(actions?.slice(0, 3)),
    )
    const trip = await ask(page, "What's in my trip?")
    record(
      'My Trip tool sees the added booking',
      /total/i.test(trip) && !/empty/i.test(trip),
      trip.slice(0, 200),
      await shot(page, 'en-390-my-trip-answer'),
    )
    await page.goto(`${BASE}/en/my-trip`, { waitUntil: 'networkidle', timeout: 60000 })
    const tripShot = await shot(page, 'en-390-my-trip-page')
    const count = await page.evaluate(
      () => document.cookie.match(/bt_cart_count=(\d+)/)?.[1] ?? '0',
    )
    record(
      'My Trip page shows the item',
      Number(count) > Number(before),
      `cart count ${before} → ${count}`,
      tripShot,
    )
  }
  record('en 390: no horizontal overflow', (await overflow(page)) <= 1)
  await ctx.close()
}

/* 3. Locked places stay redacted ---------------------------------------- */
{
  const ctx = await newContext(browser, 1440)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/en/map`, { waitUntil: 'networkidle', timeout: 60000 })
  const mapShot = await shot(page, 'en-1440-map-button')
  record(
    'map 1440: assistant button shown on the map',
    await page.locator('.ai-fab').isVisible(),
    '',
    mapShot,
  )
  await openPanel(page)
  const answer = await ask(page, 'Show me hidden places')
  const panelText = await page.locator('.ai-panel').innerText()
  const placesShot = await shot(page, 'en-1440-places-answer')
  const locked = db('locked') ?? []
  const mockLog = existsSync(MOCK_LOG) ? readFileSync(MOCK_LOG, 'utf8') : ''
  // Only what the model received during this places turn: every logged
  // request also lists the tool names, and public activities may share a word
  // with a locked place (e.g. "Sekumpul Waterfall Trek"), so whole lines would
  // give false alarms.
  const placeLines = mockLog
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter((e) => e && !e.studio && String(e.user).includes('hidden places'))
    .map((e) => JSON.stringify(e.toolResults))
  const leaks = []
  for (const place of locked) {
    for (const name of [place.slug, ...place.names].filter((n) => n && n.length > 2)) {
      if (panelText.includes(name)) leaks.push(`panel:${name}`)
      if (placeLines.some((l) => l.includes(name))) leaks.push(`model:${name}`)
    }
  }
  record(
    'locked places: none reach the model or the panel',
    locked.length > 0 && placeLines.length > 0 && leaks.length === 0,
    `${locked.length} locked in DB; ${placeLines.length} model requests checked; leaks: ${leaks.join(', ') || 'none'} | ${answer.slice(0, 200)}`,
    placesShot,
  )
  record(
    'locked places: reported only as a count',
    /\b[1-9]\d* more are locked/.test(answer),
    answer.slice(0, 200),
  )
  await ctx.close()

  const phone = await newContext(browser, 390)
  const p2 = await phone.newPage()
  await p2.goto(`${BASE}/en/map`, { waitUntil: 'networkidle', timeout: 60000 })
  await p2.waitForTimeout(1500)
  const fab = await p2.locator('.ai-fab').boundingBox()
  const toggle = await p2
    .locator('.mp-mtoggle')
    .boundingBox()
    .catch(() => null)
  const s = await shot(p2, 'en-390-map-button')
  record(
    'map 390: button sits above the Map/List bar',
    fab && (!toggle || fab.y + fab.height <= toggle.y),
    JSON.stringify({ fab, toggle }),
    s,
  )
  await phone.close()
}

/* 4. Arabic, phone and desktop (RTL) ------------------------------------ */
for (const width of [390, 1440]) {
  const ctx = await newContext(browser, width)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(`ar-${width}: ${e.message}`))
  await page.goto(`${BASE}/ar`, { waitUntil: 'networkidle', timeout: 60000 })
  const s0 = await shot(page, `ar-${width}-home-button`)
  const fab = await page.locator('.ai-fab').boundingBox()
  record(
    `ar ${width}: button on the inline-end (left in RTL)`,
    fab && fab.x < width / 2,
    JSON.stringify(fab),
    s0,
  )
  await openPanel(page)
  await shot(page, `ar-${width}-panel-open`)
  const answer = await ask(page, 'ما هو أفضل نشاط في بالي؟')
  const s1 = await shot(page, `ar-${width}-answer`)
  const dir = await page.evaluate(() => document.documentElement.dir)
  const links = await page
    .locator('.ai-msg.ai-bot')
    .last()
    .locator('a')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  record(
    `ar ${width}: RTL panel answers with Arabic-locale links`,
    dir === 'rtl' &&
      links.some((h) => /^\/(ar\/)?activities\//.test(h ?? '') || /^\/activities/.test(h ?? '')),
    `${dir} ${links.join(' ')} | ${answer.slice(0, 120)}`,
    s1,
  )
  record(`ar ${width}: no horizontal overflow`, (await overflow(page)) <= 1)
  await ctx.close()
}

/* 5. Studio: staff asks for today's orders; a write needs confirmation --- */
{
  const ctx = await newContext(browser, 1440)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(`studio: ${e.message}`))
  const ok = await signIn(page, 'staff')
  record('staff signs in to the Studio', ok, page.url())
  await page.goto(`${BASE}${ADMIN}/assistant`, { waitUntil: 'networkidle', timeout: 60000 })
  const s0 = await shot(page, 'studio-1440-assistant')
  const hasChat = await page
    .locator('.a-ai textarea')
    .isVisible()
    .catch(() => false)
  record(
    'Studio assistant page opens for staff',
    hasChat,
    (await page.locator('main').innerText()).slice(0, 200),
    s0,
  )
  if (hasChat) {
    const askStudio = async (text) => {
      const before = await page.locator('.a-ai-msg.is-bot').count()
      await page.locator('.a-ai textarea').fill(text)
      await page.locator('.a-ai-form button[type="submit"]').click()
      await page.waitForFunction(
        (n) => document.querySelectorAll('.a-ai-msg.is-bot').length > n,
        before,
        { timeout: 15000 },
      )
      await page.waitForFunction(
        () => document.querySelector('.a-ai-log')?.getAttribute('aria-busy') === 'false',
        null,
        { timeout: 90000 },
      )
      await page.waitForTimeout(300)
      return (await page.locator('.a-ai-msg.is-bot').last().innerText()).trim()
    }
    const orders = await askStudio("Show me today's orders")
    record(
      'Studio: "today\'s orders" answered from list_orders',
      /orders today/i.test(orders),
      orders.slice(0, 200),
      await shot(page, 'studio-1440-orders'),
    )
    const unpublish = await askStudio('Please unpublish one activity')
    const card = page.locator('.a-ai-card').last()
    const hasCard = await card.isVisible().catch(() => false)
    record(
      'Studio: write action shows a confirmation card with the change',
      hasCard && /published → draft/.test(await card.innerText()),
      unpublish.slice(0, 200),
      await shot(page, 'studio-1440-confirm-card'),
    )
    const auditBefore = (db('audit') ?? []).filter((r) => r.action === 'assistant.execute').length
    record(
      'Studio: nothing executed before Confirm',
      auditBefore === 0,
      `assistant.execute rows: ${auditBefore}`,
    )
    if (hasCard) {
      await card.locator('.a-btn.accent').click()
      await page
        .locator('.a-ai-card .a-ai-ok, .a-ai-card .a-ai-err')
        .last()
        .waitFor({ timeout: 30000 })
        .catch(() => {})
      const done = await page.locator('.a-ai-card.is-done').count()
      record(
        'Studio: Confirm runs the change',
        done > 0,
        (await card.innerText()).slice(0, 300),
        await shot(page, 'studio-1440-confirmed'),
      )
      const audit = db('audit') ?? []
      record(
        'Studio: audit_log has assistant.execute and the Studio action row',
        audit.some((r) => r.action === 'assistant.execute') &&
          audit.some((r) => r.action === 'activity.unpublish'),
        JSON.stringify(audit.slice(0, 4)).slice(0, 500),
      )
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    record(
      'Studio 390: no horizontal overflow',
      (await overflow(page)) <= 1,
      '',
      await shot(page, 'studio-390-assistant'),
    )
    // The same page in English (Studio language cookie), at both widths.
    await ctx.addCookies([{ name: 'studio_lang', value: 'en', url: BASE }])
    await page.goto(`${BASE}${ADMIN}/assistant`, { waitUntil: 'networkidle', timeout: 60000 })
    const enShot390 = await shot(page, 'studio-en-390-assistant')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(500)
    record(
      'Studio en: assistant page in English (LTR)',
      (await page.locator('html').getAttribute('dir')) !== 'rtl',
      enShot390,
      await shot(page, 'studio-en-1440-assistant'),
    )
    await ctx.addCookies([{ name: 'studio_lang', value: 'ar', url: BASE }])
  }
  await page.goto(`${BASE}${ADMIN}/assistant/conversations`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  })
  const convShot = await shot(page, 'studio-1440-conversations')
  const rows = await page.locator('.a-table tbody tr').count()
  record('Studio: website conversations listed for review', rows > 0, `${rows} rows`, convShot)
  const first = page.locator('.a-table tbody tr a').first()
  if (await first.isVisible().catch(() => false)) {
    await first.click()
    // Client-side navigation: wait for the detail page itself, not just idle.
    await page
      .waitForURL(/\/assistant\/conversations\/[0-9a-f-]{36}/, { timeout: 30000 })
      .catch(() => {})
    await page
      .locator('.a-ai-convo')
      .waitFor({ timeout: 30000 })
      .catch(() => {})
    record(
      'Studio: a conversation opens',
      (await page.locator('.a-ai-convo .a-ai-msg').count()) > 0,
      '',
      await shot(page, 'studio-1440-conversation'),
    )
  }
  // A staff member cannot open the admin-only settings.
  const settings = await page.goto(`${BASE}${ADMIN}/assistant/settings`, {
    waitUntil: 'networkidle',
  })
  record(
    'Studio: staff cannot open assistant settings (admin only)',
    settings?.status() === 404,
    `status ${settings?.status()}`,
  )
  await ctx.close()
}

/* 6. Customer cannot use the Studio assistant API ----------------------- */
{
  const ctx = await newContext(browser, 1440)
  const page = await ctx.newPage()
  await signIn(page, 'customer')
  const res = await page.request.post(`${BASE}/api/studio-assistant`, {
    headers: { origin: BASE, 'content-type': 'application/json' },
    data: { message: 'list all orders' },
  })
  record('Studio assistant API refuses a customer', res.status() === 404, `status ${res.status()}`)
  await ctx.close()
}

/* 7. Admin: settings; switching the website assistant off -------------- */
{
  const ctx = await newContext(browser, 1440)
  const page = await ctx.newPage()
  const ok = await signIn(page, 'admin')
  record('admin signs in', ok, page.url())
  await page.goto(`${BASE}${ADMIN}/assistant/settings`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  })
  record(
    'admin: assistant settings page',
    await page.locator('input[name="publicEnabled"]').isVisible(),
    '',
    await shot(page, 'studio-1440-settings'),
  )
  await page.locator('input[name="publicEnabled"]').uncheck()
  await page.locator('form button[type="submit"]').last().click()
  await page.waitForLoadState('networkidle')
  await shot(page, 'studio-1440-settings-saved')

  const visitor = await newContext(browser, 390)
  const vp = await visitor.newPage()
  await vp.goto(`${BASE}/en`, { waitUntil: 'networkidle', timeout: 60000 })
  await openPanel(vp)
  const off = await vp
    .locator('.ai-off')
    .isVisible()
    .catch(() => false)
  record(
    'switched off: the website shows a polite "unavailable" state',
    off,
    '',
    await shot(vp, 'en-390-unavailable'),
  )
  const status = await vp.request.post(`${BASE}/api/assistant`, {
    headers: { origin: BASE, 'content-type': 'application/json' },
    data: { message: 'hi', locale: 'en' },
  })
  record(
    'switched off: the chat endpoint answers 503',
    status.status() === 503,
    `status ${status.status()}`,
  )
  await visitor.close()

  await page.goto(`${BASE}${ADMIN}/assistant/settings`, { waitUntil: 'networkidle' })
  await page.locator('input[name="publicEnabled"]').check()
  await page.locator('form button[type="submit"]').last().click()
  await page.waitForLoadState('networkidle')
  await ctx.close()
}

await browser.close()

const violations = existsSync(MOCK_VIOLATIONS) ? readFileSync(MOCK_VIOLATIONS, 'utf8').trim() : ''
record(
  'every OpenRouter request: key, attribution, data_collection deny, two models, max_tokens, stream',
  violations === '',
  violations.slice(0, 300),
)
record(
  'no page errors in the browser',
  pageErrors.length === 0,
  pageErrors.join(' | ').slice(0, 500),
)
flush()
const bad = results.filter((r) => !r.ok)
say(`DONE: ${results.length} checks, ${bad.length} problem(s)`)
