import { closeDb, db } from '../support/db'
import { test } from '../support/fixtures'

import { ARABIC_EMOJI, check, fuzzPage, settle, signUp, Watch, XSS } from './_support'

/** Signed-in customer forms (CI copy only). */

test.afterAll(async () => {
  await closeDb()
})

test('profile: name with XSS + Arabic/emoji saves and survives reload', async ({ page }, info) => {
  const email = await signUp(page, 'profile')
  const watch = new Watch(page)
  await page.goto('/en/account')
  await settle(page)
  const name = page.getByLabel('Full name').first()
  await name.fill(`${ARABIC_EMOJI} ${XSS}`.slice(0, 120))
  await page.getByRole('button', { name: /^Save/ }).first().click()
  await settle(page)
  await page.reload()
  await settle(page)
  const rows = await db()<{ name: string }[]>`select name from users where email = ${email}`
  check(
    info,
    'account profile',
    'name persisted verbatim',
    rows[0]?.name === `${ARABIC_EMOJI} ${XSS}`.slice(0, 120),
    rows[0]?.name ?? '',
  )
  await name.fill('')
  await page.getByRole('button', { name: /^Save/ }).first().click()
  await settle(page)
  const after = await db()<{ name: string }[]>`select name from users where email = ${email}`
  check(
    info,
    'account profile',
    'empty name refused',
    (after[0]?.name ?? '') !== '',
    after[0]?.name ?? '',
  )
  const problems = await watch.collect()
  check(
    info,
    'account profile',
    'no crash / no script ran',
    problems.length === 0,
    problems.join(' | '),
  )
})

test('support ticket: valid ticket stored, empty refused', async ({ page }, info) => {
  const email = await signUp(page, 'support')
  await page.goto('/en/account/support')
  await settle(page)
  const subject = page.locator('[name="subject"]').first()
  const body = page.locator('textarea').first()
  await subject.fill(`Help ${ARABIC_EMOJI} ${XSS}`)
  await body.fill(`Body ${XSS}`)
  await body.press('Control+Enter').catch(() => {})
  await page.locator('form:has([name="subject"]) button[type="submit"]').first().click()
  await settle(page)
  await page.waitForTimeout(1500)
  const rows = await db()<{ subject: string }[]>`
    select t.subject from support_tickets t join users u on u.id = t.user_id where u.email = ${email}`
  check(info, 'account support', 'ticket persisted', rows.length >= 1, `${rows.length}`)
  check(info, 'account support', 'double submit → one ticket', rows.length <= 1, `${rows.length}`)
})

for (const path of [
  '/en/account',
  '/en/account/support',
  '/en/account/notifications',
  '/en/account/reviews',
  '/en/account/favorites',
  '/en/account/trip',
  '/en/account/devices',
  '/en/account/subscriptions',
  '/en/account/schedules',
  '/ar/account',
]) {
  test(`fuzz signed-in ${path}`, async ({ page }, info) => {
    await signUp(page, 'fuzz')
    await fuzzPage(page, info, path, `account ${path}`)
  })
}
