/**
 * Adds UI strings that the design handoff never had a key for.
 *
 * The handoff's 597 keys cover its own copy, but the port introduces
 * accessible names the prototype simply did without — its icon-only stepper
 * buttons and breadcrumb landmark had no accessible names at all. Rather
 * than hardcode English in a component, they get real keys here.
 *
 * Idempotent: existing keys are left alone. Run: node scripts/add-messages.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const ADDITIONS = {
  c_qty_dec: { en: 'Decrease quantity', ar: 'إنقاص الكمية', id: 'Kurangi jumlah' },
  c_qty_inc: { en: 'Increase quantity', ar: 'زيادة الكمية', id: 'Tambah jumlah' },
  c_breadcrumb: { en: 'Breadcrumb', ar: 'مسار التنقل', id: 'Remah roti' },
  c_close: { en: 'Close', ar: 'إغلاق', id: 'Tutup' },
  c_prev: { en: 'Previous', ar: 'السابق', id: 'Sebelumnya' },
  c_next: { en: 'Next', ar: 'التالي', id: 'Berikutnya' },
  c_loading: { en: 'Loading…', ar: 'جارٍ التحميل…', id: 'Memuat…' },
  c_error: { en: 'Something went wrong.', ar: 'حدث خطأ ما.', id: 'Terjadi kesalahan.' },
  c_retry: { en: 'Try again', ar: 'حاول مرة أخرى', id: 'Coba lagi' },
  nf_title: { en: 'Page not found', ar: 'الصفحة غير موجودة', id: 'Halaman tidak ditemukan' },
  nf_body: {
    en: 'That page does not exist or has moved.',
    ar: 'هذه الصفحة غير موجودة أو تم نقلها.',
    id: 'Halaman itu tidak ada atau telah dipindahkan.',
  },
  nf_back: { en: 'Back to Bali Trips', ar: 'العودة إلى بالي تريبس', id: 'Kembali ke Bali Trips' },
}

const LOCALES = ['en', 'ar', 'id']
let added = 0

for (const locale of LOCALES) {
  const path = resolve(root, `messages/${locale}.json`)
  const messages = JSON.parse(readFileSync(path, 'utf8'))

  for (const [key, values] of Object.entries(ADDITIONS)) {
    if (key in messages) continue
    messages[key] = values[locale]
    if (locale === 'en') added++
  }

  const sorted = Object.fromEntries(
    Object.keys(messages)
      .sort()
      .map((k) => [k, messages[k]]),
  )
  writeFileSync(path, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
}

const total = JSON.parse(readFileSync(resolve(root, 'messages/en.json'), 'utf8'))
console.log(
  `Added ${added} new key(s). Total: ${Object.keys(total).length} keys x ${LOCALES.length} locales.`,
)
