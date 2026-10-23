# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: purchase.spec.ts >> activity package: choose, date, time, pay, confirmation
- Location: e2e/purchase.spec.ts:125:5

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Choose package' }).first()
    - locator resolved to <button type="button" aria-pressed="false" class="btn btn-outline pchoose">Choose package</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <p class="bt-consent-body">…</p> from <section dir="ltr" role="region" class="bt-consent" aria-labelledby="_R_11ivb_">…</section> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
      - waiting 100ms
    3 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <a href="/en/map">…</a> from <nav class="tabbar" aria-label="Quick nav">…</nav> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
    41 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <p class="bt-consent-body">…</p> from <section dir="ltr" role="region" class="bt-consent" aria-labelledby="_R_11ivb_">…</section> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <a href="#overview">Overview</a> from <nav class="anav stuck" aria-label="Page sections">…</nav> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <a href="#overview">Overview</a> from <nav class="anav stuck" aria-label="Page sections">…</nav> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <a href="/en/map">…</a> from <nav class="tabbar" aria-label="Quick nav">…</nav> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <p class="bt-consent-body">…</p> from <section dir="ltr" role="region" class="bt-consent" aria-labelledby="_R_11ivb_">…</section> subtree intercepts pointer events
  2 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <a href="#overview">Overview</a> from <nav class="anav stuck" aria-label="Page sections">…</nav> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms

```

# Test source

```ts
  35  |     .click()
  36  |   await expect(page, 'sign-up did not leave the register page').not.toHaveURL(/\/register/, {
  37  |     timeout: 30_000,
  38  |   })
  39  | }
  40  | 
  41  | /** Checkout → pay in the sandbox → confirmation; returns the paid order number. */
  42  | async function payTrip(page: Page): Promise<string> {
  43  |   await page.goto('/en/checkout')
  44  |   const toReview = page.getByRole('button', { name: 'Continue to review' })
  45  |   await expect(toReview, 'checkout did not open with the trip').toBeVisible()
  46  |   await toReview.click()
  47  |   await page.locator('input[name="terms"]').check()
  48  |   await page.getByRole('button', { name: 'Continue to payment' }).click()
  49  |   await page.getByRole('button', { name: /^Pay/ }).click()
  50  | 
  51  |   await expect(page, 'no payment was started').toHaveURL(/\/api\/payments\/sandbox\/challenge/, {
  52  |     timeout: 30_000,
  53  |   })
  54  |   await page.getByRole('button', { name: 'Approve' }).click()
  55  |   await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60_000 })
  56  | 
  57  |   const orderNumber = ORDER_NUMBER.exec(page.url())?.[0] ?? ''
  58  |   expect(orderNumber, 'the confirmation URL carries no order number').not.toBe('')
  59  |   await expect(page.getByText(orderNumber).first()).toBeVisible()
  60  |   await expect
  61  |     .poll(() => orderStatus(orderNumber), { timeout: 60_000, message: 'order never paid' })
  62  |     .toMatch(/paid|confirmed|authorized/)
  63  |   // Bookings are only authorised until the supplier confirms (client, Oct
  64  |   // 2026); digital products are paid at once.
  65  |   await expect(page.getByRole('heading', { name: /Payment successful|Amount held/ })).toBeVisible({
  66  |     timeout: 30_000,
  67  |   })
  68  |   return orderNumber
  69  | }
  70  | 
  71  | /** Pick the first open day in the second month the calendar shows. */
  72  | async function pickDate(scope: ReturnType<Page['locator']>): Promise<void> {
  73  |   const month = scope.locator('.cal-m').last()
  74  |   await expect(month, 'no calendar').toBeVisible()
  75  |   await month.locator('button.cd:not([disabled]):not(.un)').nth(3).click()
  76  | }
  77  | 
  78  | test.afterAll(async () => {
  79  |   await closeDb()
  80  | })
  81  | 
  82  | test('itinerary: choose audience, buy, pay, download the PDF', async ({ page }) => {
  83  |   const [row] = await db()<{ slug: string }[]>`
  84  |     select i.slug from itineraries i
  85  |     where i.status = 'published' and i.deleted_at is null and i.sale_digital
  86  |       and exists (select 1 from itinerary_documents d where d.itinerary_id = i.id)
  87  |     order by i.created_at limit 1`
  88  |   expect(row, 'no published itinerary with a rendered PDF').toBeDefined()
  89  | 
  90  |   await signUp(page, 'itin')
  91  |   await page.goto(`/en/itineraries/${row?.slug}`)
  92  | 
  93  |   // The buy button is a real control in the sidebar (H1: audience first).
  94  |   const box = page.locator('#it-buy')
  95  |   const buy = box.getByRole('button', { name: 'Get this itinerary' })
  96  |   await expect(buy).toBeVisible()
  97  |   const audience = box.locator('.it-audience input[type="radio"]')
  98  |   if ((await audience.count()) > 0) {
  99  |     await buy.click()
  100 |     await expect(box.getByRole('alert'), 'buying without an audience was allowed').toBeVisible()
  101 |     await audience.first().check()
  102 |   }
  103 |   await buy.click()
  104 |   await page.waitForURL(/\/my-trip/, { timeout: 30_000 })
  105 | 
  106 |   const orderNumber = await payTrip(page)
  107 | 
  108 |   await page.goto('/en/account/schedules')
  109 |   await expect(page.getByText(orderNumber).first()).toBeVisible()
  110 |   const download = page.getByRole('link', { name: 'Download PDF' }).first()
  111 |   const href =
  112 |     (await download.count()) > 0
  113 |       ? await download.getAttribute('href')
  114 |       : (await page.getByRole('link', { name: 'View' }).first().getAttribute('href'))?.replace(
  115 |           /\/view$/,
  116 |           '/file',
  117 |         )
  118 |   expect(href, 'the account offers no PDF').toBeTruthy()
  119 |   const response = await page.request.get(href ?? '', { headers: { 'x-bt-viewer': '1' } })
  120 |   expect(response.status(), `PDF request ${href}`).toBe(200)
  121 |   expect(response.headers()['content-type']).toContain('application/pdf')
  122 |   expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF')
  123 | })
  124 | 
  125 | test('activity package: choose, date, time, pay, confirmation', async ({ page }) => {
  126 |   const [row] = await db()<{ slug: string }[]>`
  127 |     select a.slug from activities a
  128 |     where a.status = 'published' and a.deleted_at is null
  129 |       and exists (select 1 from activity_tiers t where t.activity_id = a.id)
  130 |     order by a.sort_order limit 1`
  131 |   expect(row, 'no published activity with packages').toBeDefined()
  132 | 
  133 |   await signUp(page, 'act')
  134 |   await page.goto(`/en/activities/${row?.slug}`)
> 135 |   await page.getByRole('button', { name: 'Choose package' }).first().click()
      |                                                                      ^ Error: locator.click: Test timeout of 90000ms exceeded.
  136 |   await pickDate(page.locator('body'))
  137 |   const groups = page.locator('.slots')
  138 |   for (let index = 0; index < (await groups.count()); index += 1) {
  139 |     const slot = groups.nth(index).locator('button.slot:not([disabled])').first()
  140 |     if ((await slot.count()) > 0) await slot.click()
  141 |   }
  142 |   await page.getByRole('button', { name: 'Add to My Trip' }).click()
  143 |   await expect(page.getByText('Activity added to My Trip').first()).toBeVisible()
  144 | 
  145 |   await payTrip(page)
  146 | })
  147 | 
  148 | test('package: request with date, travellers and vehicle', async ({ page }) => {
  149 |   const [row] = await db()<{ slug: string }[]>`
  150 |     select slug from packages where status = 'published' and deleted_at is null
  151 |     order by created_at limit 1`
  152 |   test.skip(row === undefined, 'no published package (the demo packages are drafts)')
  153 | 
  154 |   await signUp(page, 'pkg')
  155 |   await page.goto(`/en/packages/${row?.slug}`)
  156 |   const aside = page.locator('aside.bt-booking')
  157 |   // Client, Oct 2026: a request with an estimate, not an instant purchase.
  158 |   await expect(aside.getByText('Estimated total')).toBeVisible()
  159 |   await pickDate(aside)
  160 |   await aside.getByLabel('Name').fill('Package Check')
  161 |   await aside.getByLabel('Email').fill('package-check@example.com')
  162 |   await aside.getByLabel('Phone / WhatsApp').fill('+6281234567890')
  163 |   await aside.getByRole('button', { name: 'Send package request' }).click()
  164 |   await expect(page.getByText('We have your request')).toBeVisible({ timeout: 30_000 })
  165 | })
  166 | 
```