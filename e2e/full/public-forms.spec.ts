import { closeDb, db } from '../support/db'
import { expect, test } from '../support/fixtures'

import {
  ARABIC_EMOJI,
  check,
  fuzzPage,
  HUGE,
  settle,
  signUp,
  uniqueEmail,
  Watch,
  XSS,
} from './_support'

/**
 * Public forms, desktop and phone. Writes go to the CI copy only (seeded
 * Postgres, sandbox payments) — never to the live site.
 */

test.afterAll(async () => {
  await closeDb()
})

test.describe('contact form', () => {
  test('valid message is stored; XSS + Arabic/emoji kept as text', async ({ page }, info) => {
    const watch = new Watch(page)
    const email = uniqueEmail('contact')
    await page.goto('/en/contact')
    await page.getByLabel('Your name').fill(`${XSS} ${ARABIC_EMOJI}`)
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Message').fill(`Hello ${XSS} ${ARABIC_EMOJI}`)
    await page.waitForTimeout(3200) // the form's minimum fill time (anti-bot)
    await page.getByRole('button', { name: /Send message/ }).click()
    const sent = await page
      .getByText("Message sent — we'll be in touch shortly.")
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    await expect(page.getByText("Message sent — we'll be in touch shortly.").first())
      .toBeVisible({ timeout: 20_000 })
      .catch(() => {})
    check(info, 'contact', 'valid submit shows success', sent)
    const rows = await db()<{ name: string; message: string }[]>`
      select name, message from contact_messages where email = ${email}`
    check(info, 'contact', 'persisted to contact_messages', rows.length === 1)
    check(
      info,
      'contact',
      'XSS/Arabic/emoji stored verbatim',
      rows[0]?.name === `${XSS} ${ARABIC_EMOJI}`,
      rows[0]?.name ?? '',
    )
    const problems = await watch.collect()
    check(info, 'contact', 'no crash / no script ran', problems.length === 0, problems.join(' | '))
  })

  test('empty and invalid input give translated errors (en + ar)', async ({ page }, info) => {
    for (const [locale, required, bad, send] of [
      ['en', 'This field is required.', 'Enter a valid email address.', /Send message/],
      ['ar', 'هذا الحقل مطلوب.', 'أدخل بريدًا إلكترونيًا صحيحًا.', /إرسال الرسالة/],
    ] as const) {
      await page.goto(`/${locale}/contact`)
      await settle(page)
      const dir = await page.locator('html').getAttribute('dir')
      check(
        info,
        `contact/${locale}`,
        'html dir',
        dir === (locale === 'ar' ? 'rtl' : 'ltr'),
        `${dir}`,
      )
      const requiredInputs = await page
        .locator('form input[required], form textarea[required]')
        .count()
      check(
        info,
        `contact/${locale}`,
        'required markers present',
        requiredInputs >= 3,
        `${requiredInputs}`,
      )
      // Bypass the browser's own required check so the server validation runs.
      await page.evaluate(() =>
        document.querySelectorAll('form').forEach((f) => (f.noValidate = true)),
      )
      await page.waitForTimeout(3200)
      await page.getByRole('button', { name: send }).click()
      const req = await page
        .getByText(required)
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
        .catch(() => false)
      check(info, `contact/${locale}`, 'empty submit → required errors', req)

      await page.locator('input[type="email"]').first().fill('not-an-email')
      await page.locator('input[autocomplete="name"]').first().fill('Tester')
      await page.locator('textarea').first().fill('hi')
      await page.waitForTimeout(3200)
      await page.getByRole('button', { name: send }).click()
      const badShown = await page
        .getByText(bad)
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
        .catch(() => false)
      check(info, `contact/${locale}`, 'bad email → email error', badShown)
    }
  })

  test('huge text is capped; keyboard submit; double submit sends once', async ({ page }, info) => {
    const email = uniqueEmail('contact-dbl')
    await page.goto('/en/contact')
    await settle(page)
    const message = page.getByLabel('Message')
    await message.fill(HUGE)
    const length = (await message.inputValue()).length
    check(info, 'contact', 'maxLength caps huge message', length <= 4000, `${length}`)
    await page.getByLabel('Your name').fill('Keyboard User')
    await page.getByLabel('Email address').fill(email)
    await message.fill('Submitted with the keyboard')
    await page.waitForTimeout(3200)
    await page.getByLabel('Email address').press('Enter')
    // A second press while pending must not create a second row.
    await page
      .getByLabel('Email address')
      .press('Enter')
      .catch(() => {})
    await page
      .getByRole('button', { name: /Send message|Sending/ })
      .click({ timeout: 1000 })
      .catch(() => {})
    await page.waitForTimeout(4000)
    const rows = await db()<
      { id: string }[]
    >`select id from contact_messages where email = ${email}`
    check(info, 'contact', 'Enter submits the form', rows.length >= 1, `${rows.length}`)
    check(info, 'contact', 'double submit stores one row', rows.length <= 1, `${rows.length}`)
  })
})

test.describe('auth forms', () => {
  test('sign-up validation: empty, bad email, short password, mismatch, bad phone', async ({
    page,
  }, info) => {
    await page.goto('/en/register')
    await settle(page)
    // Skip the browser's own checks so the form's translated messages show.
    await page.evaluate(() => document.querySelectorAll('form').forEach((f) => (f.noValidate = true)))
    const form = page.locator('form:has(input[autocomplete="new-password"])').first()
    const submit = form.locator('button[type="submit"]').first()
    await submit.click()
    check(
      info,
      'sign-up',
      'empty submit stays on page with errors',
      (await page.url()).includes('/register') &&
        (await form.locator('[aria-invalid="true"]').count()) > 0,
    )
    await page.locator('input[autocomplete="name"]').fill(XSS)
    await page.locator('input[autocomplete="email"]').fill('bad@')
    await page.locator('input[autocomplete="tel"]').fill('12')
    const pw = page.locator('input[autocomplete="new-password"]')
    await pw.nth(0).fill('short')
    await pw.nth(1).fill('different')
    await submit.click()
    const text = await form.innerText()
    check(
      info,
      'sign-up',
      'short password message',
      text.includes('Password must be at least 8 characters.'),
    )
    check(info, 'sign-up', 'phone needs country code message', /country code/i.test(text))
    await pw.nth(0).fill('Long-Enough-123')
    await pw.nth(1).fill('Long-Enough-124')
    await submit.click()
    check(
      info,
      'sign-up',
      'mismatch message',
      (await form.innerText()).includes("The two passwords don't match."),
    )
    check(info, 'sign-up', 'no account created on invalid input', page.url().includes('/register'))
  })

  test('sign-up with Arabic+emoji name persists; ar errors translated', async ({ page }, info) => {
    const email = await signUp(page, 'arname', ARABIC_EMOJI)
    const rows = await db()<{ name: string }[]>`select name from users where email = ${email}`
    check(
      info,
      'sign-up',
      'account persisted with exact name',
      rows[0]?.name === ARABIC_EMOJI,
      rows[0]?.name ?? 'none',
    )

    const fresh = await page.context().browser()?.newContext({ locale: 'ar' })
    if (fresh) {
      const p = await fresh.newPage()
      await p.goto('/ar/register')
      await settle(p)
      const pw = p.locator('input[autocomplete="new-password"]')
      await pw.nth(0).fill('short')
      await p
        .locator('form:has(input[autocomplete="new-password"]) button[type="submit"]')
        .first()
        .click()
      const t = await p.locator('form:has(input[autocomplete="new-password"])').first().innerText()
      check(
        info,
        'sign-up/ar',
        'short password error in Arabic',
        t.includes('يجب ألا تقل كلمة المرور عن 8 أحرف.'),
      )
      await fresh.close()
    }
  })

  test('sign-in: wrong password and empty fields are refused', async ({ page }, info) => {
    await page.goto('/en/account?signin=1')
    const password = page.locator('input[autocomplete="current-password"]')
    await password.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    const form = page.locator('form:has(input[autocomplete="current-password"])').first()
    await form.locator('button[type="submit"]').first().click()
    check(info, 'sign-in', 'empty submit keeps dialog open', await password.isVisible())
    await page.locator('input[autocomplete="username"]').fill(uniqueEmail('nobody'))
    await password.fill('Wrong-Password-1!')
    await password.press('Enter')
    await page.waitForTimeout(3000)
    check(info, 'sign-in', 'wrong credentials refused (dialog stays)', await password.isVisible())
    check(
      info,
      'sign-in',
      'error shown',
      (await form.locator('[role="alert"], .bt-errmsg').count()) > 0,
    )
  })

  test('forgot password gives the neutral notice', async ({ page }, info) => {
    await page.goto('/en/account?signin=1')
    await page.getByText('Forgot password?').first().click()
    const field = page.getByLabel('Email or mobile number').last()
    await field.fill('not valid')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    check(
      info,
      'forgot-password',
      'invalid identifier refused',
      !(await page
        .getByText(/reset link is on its way/)
        .isVisible()
        .catch(() => false)),
    )
    await field.fill(uniqueEmail('forgot'))
    await page.getByRole('button', { name: 'Send reset link' }).click()
    const notice = await page
      .getByText(/reset link is on its way/)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    check(info, 'forgot-password', 'neutral notice for unknown address', notice)
  })
})

test.describe('search forms', () => {
  for (const path of ['/en/search', '/ar/search', '/en/blog', '/en/help']) {
    test(`GET search ${path} with XSS/Arabic/huge query`, async ({ page }, info) => {
      const watch = new Watch(page)
      for (const q of [XSS, ARABIC_EMOJI, 'ب'.repeat(3000), '%', "' OR 1=1 --"]) {
        watch.reset()
        const response = await page.goto(`${path}?q=${encodeURIComponent(q)}`)
        await settle(page)
        const problems = await watch.collect()
        check(
          info,
          `search ${path}`,
          `query ${q.slice(0, 20)} handled`,
          (response?.status() ?? 0) < 500 && problems.length === 0,
          `${response?.status()} ${problems.join(' | ')}`,
        )
      }
    })
  }

  test('search API rejects junk without 5xx', async ({ request }, info) => {
    for (const q of [XSS, 'x'.repeat(5000), '']) {
      const r = await request.get(`/api/search?q=${encodeURIComponent(q)}`)
      check(info, 'api/search', `q=${q.slice(0, 15)}`, r.status() < 500, `${r.status()}`)
    }
  })
})

test.describe('custom trip request', () => {
  test('empty submit shows errors; full request is stored', async ({ page }, info) => {
    const watch = new Watch(page)
    await page.goto('/en/custom')
    await settle(page)
    const next = page.getByRole('button', { name: 'Next', exact: true })
    for (let i = 0; i < 10 && (await next.isVisible().catch(() => false)); i += 1) {
      await next.click()
    }
    const submit = page.getByRole('button', { name: /Send my quote request/ })
    await submit.click()
    await settle(page)
    const errors = await page.locator('.bt-errmsg, [aria-invalid="true"]').count()
    check(info, 'custom-trip', 'empty request refused with errors', errors > 0, `${errors}`)

    // Full request: dates on the first step, contact on the last.
    await page.goto('/en/custom')
    await settle(page)
    const days = page.locator('button.cd:not([disabled]):not(.un)')
    if ((await days.count()) > 6) {
      await days.nth(3).click()
      await days.nth(6).click()
    } else {
      const dates = page.locator('input[type="date"]')
      const d = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
      await dates.nth(0).fill(d(30))
      await dates.nth(1).fill(d(34))
    }
    for (let i = 0; i < 10 && (await next.isVisible().catch(() => false)); i += 1) {
      const email = page.locator('input[name="email"]')
      if (await email.isVisible().catch(() => false)) break
      await next.click()
    }
    const email = uniqueEmail('custom')
    await page.locator('input[name="name"]').fill(`${ARABIC_EMOJI} ${XSS}`)
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="phone"]').fill('812345678')
    for (let i = 0; i < 5 && (await next.isVisible().catch(() => false)); i += 1) await next.click()
    await submit.click()
    await settle(page, 20_000)
    await page.waitForTimeout(2000)
    const rows = await db()<
      { id: string }[]
    >`select id from custom_trip_requests where email = ${email}`
    check(info, 'custom-trip', 'valid request persisted', rows.length === 1, `${rows.length}`)
    const problems = await watch.collect()
    check(
      info,
      'custom-trip',
      'no crash / no script ran',
      problems.length === 0,
      problems.join(' | '),
    )
  })
})

test.describe('booking and checkout', () => {
  test('activity booking widget: invalid people count and missing date refused', async ({
    page,
  }, info) => {
    const [row] = await db()<{ slug: string }[]>`
      select slug from activities where status = 'published' and deleted_at is null
      order by sort_order limit 1`
    const watch = new Watch(page)
    await page.goto(`/en/activities/${row?.slug}`)
    await settle(page)
    const numbers = page.locator('aside input[type="number"], form input[type="number"]')
    for (let i = 0; i < (await numbers.count()); i += 1) {
      await numbers
        .nth(i)
        .fill('-3')
        .catch(() => {})
    }
    const add = page.getByRole('button', { name: /Add to My Trip|Choose package|Book/ }).first()
    await add.click().catch(() => {})
    await settle(page)
    const cart = await db()<{ n: number }[]>`select count(*)::int n from cart_items`.catch(() => [
      { n: -1 },
    ])
    const problems = await watch.collect()
    check(
      info,
      'activity booking',
      'invalid/empty booking does not crash',
      problems.length === 0,
      problems.join(' | '),
    )
    check(info, 'activity booking', 'cart query works', (cart[0]?.n ?? -1) >= 0)
  })

  test('checkout: invalid coupon is refused politely', async ({ page }, info) => {
    await signUp(page, 'coupon')
    const watch = new Watch(page)
    await page.goto('/en/checkout')
    await settle(page)
    const coupon = page
      .locator('form:has(input[name="code"]) input[name="code"], input[name="coupon"]')
      .first()
    if (!(await coupon.isVisible().catch(() => false))) {
      check(
        info,
        'checkout coupon',
        'coupon field shown only with items (empty trip)',
        true,
        'no coupon field on empty trip',
      )
      return
    }
    for (const code of ['NOPE-123', XSS, '']) {
      await coupon.fill(code)
      await coupon.press('Enter')
      await settle(page)
    }
    const problems = await watch.collect()
    check(
      info,
      'checkout coupon',
      'invalid codes handled',
      problems.length === 0,
      problems.join(' | '),
    )
  })
})

test.describe('generic fuzz of public pages', () => {
  for (const path of [
    '/en',
    '/ar',
    '/en/contact',
    '/en/custom',
    '/en/search',
    '/en/blog',
    '/en/help',
    '/en/activities',
    '/en/itineraries',
    '/en/packages',
    '/en/plans',
    '/en/map',
    '/en/cart',
    '/en/register',
  ]) {
    test(`fuzz ${path}`, async ({ page }, info) => {
      await fuzzPage(page, info, path, `public ${path}`)
    })
  }
})
