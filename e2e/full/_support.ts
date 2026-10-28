import { createHmac } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, type Page, type TestInfo } from '@playwright/test'

/**
 * Shared helpers for the full forms suite (e2e/full).
 *
 * Every case a spec checks is also appended to `full-test-out/cases.jsonl`,
 * which `scripts/full-test-summary.mjs` turns into summary.json. A Playwright
 * test can hold many cases (one form, many inputs), so the test count alone
 * would understate what ran.
 */

export const OUT_DIR = resolve(__dirname, '..', '..', 'full-test-out')
mkdirSync(OUT_DIR, { recursive: true })

export const ADMIN = (process.env.ADMIN_BASE_PATH ?? '/studio-8f2a').replace(/\/$/, '')

/** Hostile and awkward values every free-text field receives at least once. */
export const XSS = '<script>alert(1)</script><img src=x onerror=alert(2)>'
export const ARABIC_EMOJI = 'رحلة بالي 🌴🏝️ اختبار'
export const HOSTILE_TEXT = `${XSS} ${ARABIC_EMOJI} ‮RTL‬`
export const HUGE = 'ب'.repeat(20_000)

export interface CaseRecord {
  form: string
  case: string
  ok: boolean
  detail?: string
}

export function recordCase(info: TestInfo, entry: CaseRecord): void {
  const line = JSON.stringify({ ...entry, project: info.project.name, test: info.title })
  appendFileSync(resolve(OUT_DIR, 'cases.jsonl'), line + '\n')
}

/** Record a case and make it a (soft) assertion in the report too. */
export function check(info: TestInfo, form: string, name: string, ok: boolean, detail = ''): void {
  recordCase(info, { form, case: name, ok, detail })
  expect.soft(ok, `${form} — ${name}${detail ? `: ${detail}` : ''}`).toBe(true)
}

const ERROR_TEXT =
  /Application error|Internal Server Error|This page couldn.t load|Unhandled Runtime Error|a server-side exception has occurred|a client-side exception has occurred/i

/**
 * Watches a page for the signs of a crash: uncaught errors, 5xx answers,
 * an alert() (an XSS payload that ran), and the framework's error screens.
 */
export class Watch {
  readonly problems: string[] = []
  constructor(private readonly page: Page) {
    page.on('pageerror', (error) => this.problems.push(`pageerror: ${error.message.slice(0, 200)}`))
    page.on('response', (response) => {
      if (response.status() >= 500)
        this.problems.push(`HTTP ${response.status()} ${response.url().slice(0, 160)}`)
    })
    page.on('dialog', (dialog) => {
      this.problems.push(`dialog (${dialog.type()}): ${dialog.message().slice(0, 80)}`)
      dialog.dismiss().catch(() => {})
    })
  }

  reset(): void {
    this.problems.length = 0
  }

  async crashText(): Promise<string | null> {
    const text = await this.page
      .locator('body')
      .innerText({ timeout: 5000 })
      .catch(() => '')
    return ERROR_TEXT.exec(text)?.[0] ?? null
  }

  /** Problems since the last reset, plus any error screen now showing. */
  async collect(): Promise<string[]> {
    const crash = await this.crashText()
    return crash === null ? [...this.problems] : [...this.problems, `error screen: ${crash}`]
  }
}

export async function settle(page: Page, ms = 10_000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: ms }).catch(() => {})
}

/** Unique, valid contact details per call. */
export function uniqueTag(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${uniqueTag()}@example.com`
}
export function uniquePhone(): string {
  return `+62812${`${Date.now()}${Math.floor(Math.random() * 100)}`.slice(-8)}`
}

/* ---- Customers ----------------------------------------------------------- */

export const CUSTOMER_PASSWORD = 'Bali-Trips-2026!'

/** Register through /register, as purchase.spec.ts does. Returns the email. */
export async function signUp(page: Page, tag: string, name = 'Full Test'): Promise<string> {
  const email = uniqueEmail(`full-${tag}`)
  await page.goto('/en/register')
  await page.locator('input[autocomplete="name"]').fill(name)
  await page.locator('input[autocomplete="email"]').fill(email)
  await page.locator('input[autocomplete="tel"]').fill(uniquePhone())
  const pw = page.locator('input[autocomplete="new-password"]')
  await pw.nth(0).fill(CUSTOMER_PASSWORD)
  await pw.nth(1).fill(CUSTOMER_PASSWORD)
  await page
    .locator('form:has(input[autocomplete="new-password"]) button[type="submit"]')
    .first()
    .click()
  await expect(page, 'sign-up did not leave the register page').not.toHaveURL(/\/register/, {
    timeout: 30_000,
  })
  return email
}

/* ---- Staff (TOTP), same as scripts/admin-check.mjs ------------------------ */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(text: string): Buffer {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of text.replace(/[\s=-]/g, '').toUpperCase()) {
    const index = ALPHABET.indexOf(ch)
    if (index < 0) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}
function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const d = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const o = (d[d.length - 1] ?? 0) & 0x0f
  const bin =
    (((d[o] ?? 0) & 0x7f) << 24) |
    (((d[o + 1] ?? 0) & 0xff) << 16) |
    (((d[o + 2] ?? 0) & 0xff) << 8) |
    ((d[o + 3] ?? 0) & 0xff)
  return String(bin % 1e6).padStart(6, '0')
}
const usedSteps = new Map<string, number>()
async function freshCode(secret: string): Promise<string> {
  for (;;) {
    const step = Math.floor(Date.now() / 30_000)
    const left = 30 - Math.floor((Date.now() / 1000) % 30)
    if (usedSteps.get(secret) !== step && left > 4) {
      usedSteps.set(secret, step)
      return totp(secret, step)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

function secretFor(email: string): string | undefined {
  const file = process.env.ACCOUNTS_FILE
  if (!file || !existsSync(file)) return undefined
  let current: string | null = null
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const mail = /^\s+(\S+@\S+)\s*$/.exec(line)
    if (mail?.[1]) current = mail[1]
    const secret = /^\s+secret:\s+([A-Z2-7 ]+)\s*$/.exec(line)
    if (secret?.[1] && current === email) return secret[1].replace(/\s/g, '')
  }
  return undefined
}

export const TEST_DOMAIN = process.env.TEST_ACCOUNT_DOMAIN ?? 'test.balitrips.local'
export const TEST_PASSWORD = process.env.TEST_ACCOUNT_PASSWORD ?? ''

/** Sign a seeded test account in (scripts/create-test-accounts.ts). */
export async function signInAs(page: Page, role: string): Promise<void> {
  const email = `${role}@${TEST_DOMAIN}`
  const staff = role !== 'customer'
  await page.goto(staff ? ADMIN : '/en/account?signin=1', { waitUntil: 'networkidle' })
  const password = page.locator('input[autocomplete="current-password"]')
  if (!(await password.isVisible().catch(() => false))) {
    await page
      .locator('button:visible', { hasText: /^\s*Sign in\s*$/ })
      .last()
      .click()
  }
  await password.waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('input[autocomplete="username"]').fill(email)
  await password.fill(TEST_PASSWORD)
  await page
    .locator('form:has(input[autocomplete="current-password"]) button[type="submit"]')
    .first()
    .click()
  if (!staff) {
    await expect(password).toBeHidden({ timeout: 30_000 })
    return
  }
  await page.waitForURL((url) => url.pathname.startsWith(ADMIN), { timeout: 30_000 })
  await settle(page)
  if (page.url().includes('/security')) {
    const secret = secretFor(email)
    expect(secret, `no TOTP secret for ${email}`).toBeTruthy()
    await page.locator('#challenge').fill(await freshCode(secret ?? ''))
    await page.locator('#challenge').press('Enter')
    await page.waitForURL((url) => !url.pathname.includes('/security'), { timeout: 30_000 })
    await settle(page)
  }
}

/* ---- Generic form fuzzing ----------------------------------------------- */

/** Buttons the generic pass never presses: they destroy, send or charge. */
const DESTRUCTIVE =
  /delete|remove|revoke|cancel|refund|archive|reset|disable|suspend|sign ?out|log ?out|purge|ban\b|block|void|capture|release|send|test|retry|run|publish|import|merge|restore|approve|reject|pay|charge|حذف|إلغاء|إزالة|إرسال|نشر|دفع/i

type FillMode = 'hostile' | 'empty'

async function fillForm(page: Page, formIndex: number, mode: FillMode): Promise<number> {
  return page.evaluate(
    ({ index, mode, hostile }) => {
      const form = document.querySelectorAll('form')[index]
      if (!form) return 0
      let filled = 0
      const setter = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
        const proto =
          el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      for (const el of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input, textarea',
      )) {
        if (el.disabled || el.readOnly) continue
        const type = (el.getAttribute('type') ?? 'text').toLowerCase()
        if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset'].includes(type))
          continue
        const box = el.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) continue
        if (el.name === 'bt_hp') continue
        let value = ''
        if (mode === 'hostile') {
          if (type === 'email') value = 'not-an-email'
          else if (type === 'number' || type === 'range') value = '-5'
          else if (type === 'tel') value = 'abc<script>'
          else if (type === 'url') value = 'javascript:alert(1)'
          else if (type === 'password') value = '1'
          else if (['date', 'time', 'datetime-local', 'month', 'week', 'color'].includes(type))
            continue
          else value = hostile
        }
        setter(el, value)
        filled += 1
      }
      return filled
    },
    { index: formIndex, mode, hostile: HOSTILE_TEXT },
  )
}

/**
 * For every form on `path` (up to `max`): fill it with hostile values and
 * submit, then submit it empty. The page must not crash, answer 5xx, or run
 * the script. Forms whose only submit button is destructive are skipped.
 */
export async function fuzzPage(
  page: Page,
  info: TestInfo,
  path: string,
  label: string,
  options: { max?: number } = {},
): Promise<void> {
  const watch = new Watch(page)
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await settle(page)
  const loadProblems = await watch.collect()
  check(info, label, 'page loads without errors', loadProblems.length === 0, loadProblems.join(' | '))

  const count = await page.locator('form').count()
  const max = Math.min(count, options.max ?? 6)
  for (let index = 0; index < max; index += 1) {
    for (const mode of ['hostile', 'empty'] as const) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await settle(page)
      const form = page.locator('form').nth(index)
      if (!(await form.isVisible().catch(() => false))) break
      const submit = form.locator('button[type="submit"], button:not([type]), input[type="submit"]')
      const buttons = await submit.count()
      let target = null
      for (let b = 0; b < buttons; b += 1) {
        const button = submit.nth(b)
        const text = `${(await button.innerText().catch(() => '')) ?? ''} ${(await button.getAttribute('aria-label')) ?? ''} ${(await button.getAttribute('value')) ?? ''}`
        if (!DESTRUCTIVE.test(text) && (await button.isVisible().catch(() => false))) {
          target = button
          break
        }
      }
      if (target === null) break
      const filled = await fillForm(page, index, mode)
      if (filled === 0) break
      watch.reset()
      await target.click({ timeout: 5000 }).catch(() => {})
      await settle(page)
      const problems = await watch.collect()
      check(
        info,
        `${label} form#${index}`,
        `${mode} submit handled (no crash/5xx/XSS)`,
        problems.length === 0,
        problems.join(' | '),
      )
    }
  }
}
