// Studio end-to-end check in a real browser (CI only, see .github/workflows/admin-check.yml).
//
// Logs in through the public sign-in page for each staff role, completes the
// TOTP challenge, then opens every Studio nav page plus one detail page per
// section at 1440 and 390. Everything is written to ./admin-check (pushed to
// the `admin-check` branch): results.json, log.txt, summary.txt, screenshots.
//
// Inputs (env):
//   SHOTS_BASE         site origin (default http://localhost:3000)
//   ADMIN_BASE_PATH    the configured Studio path (same value as the server)
//   ACCOUNTS_FILE      output of scripts/create-test-accounts.ts (secrets; never pushed)
//   TEST_ACCOUNT_PASSWORD, TEST_ACCOUNT_DOMAIN
//   SERVER_LOG         path of the server's log file (tail recorded per page)
import { chromium } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

const BASE = process.env.SHOTS_BASE ?? 'http://localhost:3000'
const ADMIN = (process.env.ADMIN_BASE_PATH ?? '/studio-8f2a').replace(/\/$/, '')
const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD ?? ''
const DOMAIN = process.env.TEST_ACCOUNT_DOMAIN ?? 'test.balitrips.local'
const SERVER_LOG = process.env.SERVER_LOG ?? 'server.log'
const OUT = 'admin-check'
mkdirSync(`${OUT}/shots`, { recursive: true })

const log = []
const results = []
const say = (line) => {
  log.push(line)
  console.log(line)
}
const flush = () => {
  writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n')
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
  const bad = results.filter((r) => !r.ok)
  const lines = [
    `Studio check — ADMIN_BASE_PATH=${ADMIN} — ${results.length} page loads, ${bad.length} problem(s)`,
    '',
    ...results.map(
      (r) =>
        `${r.ok ? 'OK  ' : 'FAIL'} ${r.role.padEnd(9)} ${String(r.width).padEnd(4)} ${String(r.status).padEnd(4)} ${r.path}  ${r.final !== r.path ? `-> ${r.final}` : ''} ${r.problems.join(' | ').slice(0, 400)}`,
    ),
  ]
  writeFileSync(`${OUT}/summary.txt`, lines.join('\n') + '\n')
}
process.on('exit', flush)

/* ---- TOTP (RFC 6238, same as src/lib/auth/totp.ts) ---------------------- */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(text) {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
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
function totp(secret, step) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const d = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const o = d[d.length - 1] & 0x0f
  const bin =
    ((d[o] & 0x7f) << 24) | ((d[o + 1] & 0xff) << 16) | ((d[o + 2] & 0xff) << 8) | (d[o + 3] & 0xff)
  return String(bin % 1e6).padStart(6, '0')
}
const usedSteps = new Map()
async function freshCode(secret) {
  // The server refuses a step it has already accepted (replay guard), so wait
  // for a new one if this secret was used in the current step.
  for (;;) {
    const step = Math.floor(Date.now() / 30000)
    const secondsLeft = 30 - Math.floor((Date.now() / 1000) % 30)
    if (usedSteps.get(secret) !== step && secondsLeft > 4) {
      usedSteps.set(secret, step)
      return totp(secret, step)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

/* ---- Accounts ----------------------------------------------------------- */
function secretsFromFile() {
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
const secrets = secretsFromFile()
say(`accounts with TOTP secrets: ${[...secrets.keys()].join(', ') || 'none'}`)

/* ---- Pages -------------------------------------------------------------- */
function navPaths() {
  const src = readFileSync('src/app/(admin)/_ui/nav.ts', 'utf8')
  const items = [...src.matchAll(/path: '([^']*)',\s*labelKey: '[^']+',\s*capability: '([^']+)'/g)]
  return items.map((m) => ({ path: m[1], capability: m[2] }))
}
const NAV = navPaths()
say(`nav pages: ${NAV.map((n) => n.path || '/').join(' ')}`)

const ROLE_CAPS = {
  staff: new Set([
    'admin.access',
    'content.read',
    'content.write',
    'content.publish',
    'media.upload',
    'translations.write',
    'orders.read',
    'orders.fulfil',
    'payments.read',
    'capacity.write',
    'customers.read',
    'leads.read',
    'audit.read',
    'security.read',
  ]),
}
const allowed = (role, cap) => role === 'admin' || (ROLE_CAPS[role]?.has(cap) ?? false)

function serverLogSize() {
  try {
    return statSync(SERVER_LOG).size
  } catch {
    return 0
  }
}
function serverLogSince(offset) {
  try {
    const text = readFileSync(SERVER_LOG, 'utf8').slice(offset)
    return text
      .split('\n')
      .filter((l) => l.trim() !== '')
      .slice(-40)
  } catch {
    return []
  }
}

const ERROR_TEXT =
  /Application error|Internal Server Error|This page couldn.t load|Unhandled Runtime Error|a server-side exception has occurred|a client-side exception has occurred/i

let shotNo = 0
async function visit(
  page,
  role,
  path,
  width,
  { expectNotFound = false, expectSignIn = false, expectText = null, label = '' } = {},
) {
  const errors = []
  const onConsole = (m) => {
    if (m.type() !== 'error') return
    // The browser logs the expected 404 document itself as a console error.
    if (expectNotFound && /status of 404/.test(m.text())) return
    errors.push(`console: ${m.text().slice(0, 300)}`)
  }
  const onPageError = (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`)
  const onFailed = (r) => {
    const why = r.failure()?.errorText ?? ''
    // Aborted prefetches during navigation are noise.
    if (why.includes('ERR_ABORTED')) return
    errors.push(`requestfailed: ${r.url().slice(0, 160)} ${why}`)
  }
  const onResponse = (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`)
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onFailed)
  page.on('response', onResponse)
  const before = serverLogSize()
  await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 })
  let status = 0
  try {
    const response = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
    status = response?.status() ?? 0
  } catch (e) {
    errors.push(`goto: ${e.message.split('\n')[0]}`)
  }
  await page.waitForTimeout(800)
  let passwordVisible = false
  if (expectSignIn) {
    passwordVisible = await page
      .locator('input[autocomplete="current-password"]')
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
  }
  const final = page.url().replace(BASE, '')
  const info = await page
    .evaluate(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim().slice(0, 120) ?? '',
      text: document.body?.innerText?.slice(0, 4000) ?? '',
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }))
    .catch(() => ({ title: '', h1: '', text: '', overflow: 0 }))
  page.off('console', onConsole)
  page.off('pageerror', onPageError)
  page.off('requestfailed', onFailed)
  page.off('response', onResponse)

  const problems = [...errors]
  if (ERROR_TEXT.test(info.text))
    problems.push(`error text on page: ${info.text.match(ERROR_TEXT)[0]}`)
  if (expectText && !info.text.includes(expectText)) problems.push(`missing text "${expectText}"`)
  if (expectSignIn) {
    if (!/^\/(ar|en|id)\/account\?signin=1/.test(final))
      problems.push(`expected sign-in page, at ${final}`)
    if (!passwordVisible) problems.push('sign-in dialog not open')
  } else if (expectNotFound) {
    if (status !== 404) problems.push(`expected 404, got ${status}`)
  } else {
    if (status >= 400 || status === 0) problems.push(`status ${status}`)
    if (/could not be found|404/i.test(info.title + ' ' + info.h1))
      problems.push('rendered not-found')
    if (final.includes('/security') && !path.includes('/security'))
      problems.push('bounced to 2FA screen')
  }
  const serverTail = serverLogSince(before)
  const serverErrors = serverTail.filter((l) => /error|exception|digest|⨯|failed/i.test(l))
  if (serverErrors.length > 0)
    problems.push(`server: ${serverErrors.slice(0, 3).join(' / ').slice(0, 400)}`)

  shotNo += 1
  const shot = `shots/${String(shotNo).padStart(3, '0')}-${role}-${width}${(label || path).replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`
  await page.screenshot({ path: `${OUT}/${shot}`, fullPage: false }).catch(() => {})

  const entry = {
    role,
    path,
    width,
    status,
    final,
    title: info.title,
    h1: info.h1,
    overflowPx: info.overflow,
    ok: problems.length === 0,
    problems,
    serverTail,
    shot,
  }
  results.push(entry)
  say(
    `${entry.ok ? 'OK  ' : 'FAIL'} ${role} ${width} ${status} ${path} -> ${final} "${info.title}" ${problems.join(' | ')}`,
  )
  if (!entry.ok) {
    console.log(`::error::${role} ${width} ${path}: ${problems.join(' | ').slice(0, 800)}`)
  }
  flush()
  return entry
}

async function signIn(page, email, secret, start) {
  const steps = []
  await page.setViewportSize({ width: 1440, height: 900 })
  // Staff start where they really do: the Studio link, which (logged out)
  // sends them to the site's sign-in with the dialog already open.
  await page.goto(BASE + start, { waitUntil: 'networkidle', timeout: 60000 })
  steps.push(`opened ${start} -> ${page.url().replace(BASE, '')}`)
  const password = page.locator('input[autocomplete="current-password"]')
  if (!(await password.isVisible().catch(() => false))) {
    steps.push('dialog was not open; clicking Sign in')
    await page
      .locator('button:visible', { hasText: /^\s*Sign in\s*$/ })
      .last()
      .click()
  }
  await password.waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('input[autocomplete="username"]').fill(email)
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD)
  await page
    .locator('form:has(input[autocomplete="current-password"]) button[type="submit"]')
    .first()
    .click()
  try {
    await page.waitForURL((url) => url.pathname.startsWith(ADMIN), { timeout: 30000 })
  } catch {
    const msg = await page
      .locator('[role="alert"]')
      .allInnerTexts()
      .catch(() => [])
    steps.push(`no redirect to Studio after sign-in (at ${page.url()}) ${msg.join(' ')}`)
    await page.screenshot({ path: `${OUT}/shots/signin-${email.split('@')[0]}-failed.png` })
    return steps
  }
  await page.waitForLoadState('networkidle')
  steps.push(`after sign-in: ${page.url().replace(BASE, '')}`)
  await page.screenshot({ path: `${OUT}/shots/signin-${email.split('@')[0]}-1-after-login.png` })
  if (page.url().includes('/security')) {
    if (!secret) {
      steps.push('2FA challenge shown but no secret available')
      return steps
    }
    await page.locator('#challenge').fill(await freshCode(secret))
    await page.screenshot({ path: `${OUT}/shots/signin-${email.split('@')[0]}-2-challenge.png` })
    await page.locator('#challenge').press('Enter')
    await page
      .waitForURL((url) => !url.pathname.includes('/security'), { timeout: 30000 })
      .catch(() => steps.push('still on /security after TOTP'))
    await page.waitForLoadState('networkidle')
    steps.push(`after TOTP: ${page.url().replace(BASE, '')}`)
  }
  await page.screenshot({ path: `${OUT}/shots/signin-${email.split('@')[0]}-3-dashboard.png` })
  return steps
}

const browser = await chromium.launch()

/* 1. Logged out ------------------------------------------------------------ */
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  for (const w of [1440, 390]) {
    await visit(page, 'anonymous', ADMIN, w, { expectSignIn: true })
    await visit(page, 'anonymous', `${ADMIN}/orders`, w, { expectSignIn: true })
  }
  // The internal mount is not a public URL.
  await visit(page, 'anonymous', '/studio', 1440, { expectNotFound: true })
  await ctx.close()
}

/* 2. Each role ------------------------------------------------------------- */
for (const role of ['admin', 'staff', 'customer']) {
  const email = `${role}@${DOMAIN}`
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  let steps
  try {
    steps = await signIn(
      page,
      email,
      secrets.get(email),
      role === 'customer' ? '/en/account?signin=1' : ADMIN,
    )
  } catch (e) {
    steps = [`sign-in threw: ${e.message.split('\n')[0]}`]
  }
  say(`[${role}] sign-in: ${steps.join(' ; ')} ${pageErrors.join(' ; ')}`)
  const landed = page.url().replace(BASE, '')
  if (role === 'customer') {
    const okCustomer = !landed.startsWith(ADMIN)
    results.push({
      role,
      path: 'sign-in',
      width: 1440,
      status: 0,
      final: landed,
      ok: okCustomer,
      problems: okCustomer ? [] : ['customer was sent to the Studio'],
      shot: '',
    })
    for (const w of [1440, 390])
      await visit(page, role, ADMIN, w, { expectNotFound: true, expectText: email })
    await ctx.close()
    continue
  }
  const signedOk = landed === ADMIN || landed.startsWith(`${ADMIN}?`)
  results.push({
    role,
    path: 'sign-in → dashboard',
    width: 1440,
    status: 0,
    final: landed,
    ok: signedOk,
    problems: signedOk ? [] : [`sign-in ended at ${landed}: ${steps.join(' ; ')}`],
    shot: `shots/signin-${role}-3-dashboard.png`,
  })
  if (!signedOk) console.log(`::error::${role} sign-in ended at ${landed}: ${steps.join(' ; ')}`)

  for (const { path, capability } of NAV) {
    const full = `${ADMIN}${path}`
    const may = allowed(role, capability)
    for (const w of [1440, 390]) {
      await visit(page, role, full, w, { expectNotFound: !may })
    }
    if (!may || path === '' || path.startsWith('/protection') || path === '/security') continue
    // One detail page per section, when the list has any rows.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(BASE + full, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
    const hrefs = await page
      .$$eval(
        'main a[href]',
        (as, prefix) =>
          as
            .map((a) => a.getAttribute('href') ?? '')
            .filter((h) => h.startsWith(prefix + '/') && !h.includes('?') && !h.endsWith('/new')),
        full,
      )
      .catch(() => [])
    const detail = hrefs.find((h) => !/\/(export|receipt)(\/|$)/.test(h))
    if (detail) {
      for (const w of [1440, 390]) await visit(page, role, detail, w)
    } else {
      say(`[${role}] ${full}: no detail link found`)
    }
    // "new" form where one exists.
    const newHref = await page
      .$$eval(
        'main a[href]',
        (as, prefix) =>
          as.map((a) => a.getAttribute('href') ?? '').find((h) => h === `${prefix}/new`) ?? null,
        full,
      )
      .catch(() => null)
    if (newHref) await visit(page, role, newHref, 1440)
  }
  await ctx.close()
}

await browser.close()
flush()
const bad = results.filter((r) => !r.ok)
say(`DONE: ${results.length} checks, ${bad.length} problem(s)`)
if (bad.length > 0)
  console.log(`::error::Studio check: ${bad.length} problem(s), see admin-check/summary.txt`)
