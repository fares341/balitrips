/**
 * Seed service levels for every published activity.
 *
 * Four tiers per activity, matching the client's design: Basic, Couples,
 * Comprehensive and Premium, with Premium badged "most popular".
 *
 * Prices are DERIVED from each activity's own base price rather than
 * hard-coded. A fixed $120/$180/$200/$240 ladder would price a $25 coffee
 * crawl the same as a $90 sunrise volcano hike, which reads as obviously fake
 * the moment anyone looks at two pages side by side.
 *
 * Idempotent: the (activity_id, key) unique index makes a re-run an update,
 * so this can be applied repeatedly without accumulating duplicates.
 *
 *   pnpm tsx scripts/seed-tiers.ts
 *   pnpm tsx scripts/seed-tiers.ts --clear
 */

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { activities, activityTiers } from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'

const clear = process.argv.includes('--clear')

const L = (en: string, ar: string, id: string): Localized => ({ en, ar, id })

interface TierSpec {
  key: string
  name: Localized
  tagline: Localized
  /** Multiplier on the activity's own base price. */
  factor: number
  pricingMode: 'flat' | 'per_guest'
  maxGuests: number | null
  isPopular: boolean
  features: Localized[]
  highlights: Localized[]
  details: Localized[]
  notes: Localized[]
}

/** Shared practicalities — true of every tier, so written once. */
const DETAILS: Localized[] = [
  L('Tour language: Arabic / English', 'لغة الجولة: العربية / الإنجليزية', 'Bahasa tur: Arab / Inggris'),
  L('Flexible cancellation policy', 'إلغاء الحجز: سياسة مرنة', 'Pembatalan: kebijakan fleksibel'),
  L('Difficulty: easy', 'مستوى الصعوبة: سهل', 'Tingkat kesulitan: mudah'),
  L('Suitable for families and couples', 'مناسب للعائلات والأزواج', 'Cocok untuk keluarga dan pasangan'),
]

const NOTES: Localized[] = [
  L('Please wear comfortable clothing', 'يرجى ارتداء ملابس مريحة', 'Harap kenakan pakaian yang nyaman'),
  L('Early booking is recommended', 'يفضل الحجز المبكر', 'Disarankan memesan lebih awal'),
  L('Driver details are sent after booking', 'يتم إرسال تفاصيل السائق بعد الحجز', 'Detail sopir dikirim setelah pemesanan'),
  L('Prices include all taxes', 'الأسعار تشمل جميع الضرائب', 'Harga sudah termasuk pajak'),
  L('In bad weather the schedule is rearranged or refunded', 'في حالة الطقس السيئ يتم إعادة الجدولة أو استرداد المبلغ', 'Jika cuaca buruk, jadwal diatur ulang atau dana dikembalikan'),
]

const SPECS: TierSpec[] = [
  {
    key: 'basic',
    name: L('Basic', 'الباقة الأساسية', 'Paket Dasar'),
    tagline: L('A standard experience at the best price', 'تجربة قياسية بأفضل سعر', 'Pengalaman standar dengan harga terbaik'),
    factor: 1,
    pricingMode: 'per_guest',
    maxGuests: null,
    isPopular: false,
    features: [
      L('Tour guide', 'مرشد سياحي', 'Pemandu wisata'),
      L('Entry ticket only', 'دخول لوكافور فقط', 'Hanya tiket masuk'),
    ],
    highlights: [
      L('Entry ticket included', 'تذكرة دخول مشمولة', 'Tiket masuk termasuk'),
      L('Shared group guide', 'مرشد للمجموعة', 'Pemandu grup bersama'),
    ],
    details: DETAILS,
    notes: NOTES,
  },
  {
    key: 'couples',
    name: L('For couples', 'باقة الأزواج', 'Untuk pasangan'),
    tagline: L('An ideal experience for two', 'تجربة مثالية للأزواج', 'Pengalaman ideal untuk berdua'),
    factor: 1.5,
    // Priced for the pair, not per head. Charging a couples rate twice is
    // exactly the contradiction pricingMode exists to prevent.
    pricingMode: 'flat',
    maxGuests: 2,
    isPopular: false,
    features: [
      L('Professional photography', 'تصوير احترافي', 'Fotografi profesional'),
      L('Welcome drink', 'مشروب ترحيبي', 'Minuman selamat datang'),
      L('Private seating', 'جلسة خاصة', 'Tempat duduk pribadi'),
    ],
    highlights: [
      L('Reserved seating for two', 'جلسة محجوزة لشخصين', 'Tempat duduk untuk dua orang'),
      L('Photo session included', 'جلسة تصوير مشمولة', 'Sesi foto termasuk'),
    ],
    details: DETAILS,
    notes: NOTES,
  },
  {
    key: 'comprehensive',
    name: L('Comprehensive', 'الباقة الشاملة', 'Paket Lengkap'),
    tagline: L('A full experience with the key extras', 'تجربة شاملة مع أهم الإضافات', 'Pengalaman lengkap dengan tambahan utama'),
    factor: 1.7,
    pricingMode: 'per_guest',
    maxGuests: null,
    isPopular: false,
    features: [
      L('Tour guide', 'مرشد سياحي', 'Pemandu wisata'),
      L('Welcome drink', 'مشروب ترحيبي', 'Minuman selamat datang'),
      L('Hotel transfer', 'التوصيل من الفندق', 'Antar-jemput hotel'),
    ],
    highlights: [
      L('Hotel pick-up and drop-off', 'الوصول من وإلى الفندق', 'Penjemputan dan pengantaran hotel'),
      L('Welcome drink on arrival', 'مشروب ترحيبي عند الوصول', 'Minuman selamat datang saat tiba'),
    ],
    details: DETAILS,
    notes: NOTES,
  },
  {
    key: 'premium',
    name: L('Premium', 'الباقة المميزة', 'Paket Premium'),
    tagline: L('A complete experience with exclusive extras', 'تجربة متكاملة مع إضافات حصرية', 'Pengalaman lengkap dengan tambahan eksklusif'),
    factor: 2,
    pricingMode: 'per_guest',
    maxGuests: null,
    isPopular: true,
    features: [
      L('Professional photography', 'تصوير احترافي', 'Fotografi profesional'),
      L('Private guide', 'مرشد خاص', 'Pemandu pribadi'),
      L('Welcome drink', 'مشروب ترحيبي', 'Minuman selamat datang'),
      L('Fast-track entry', 'دخول سريع', 'Masuk jalur cepat'),
    ],
    highlights: [
      L('Private guide for your party only', 'مرشد خاص لمجموعتك وحدها', 'Pemandu pribadi hanya untuk rombongan Anda'),
      L('Professional photo session (20 images)', 'جلسة تصوير احترافية (20 صورة)', 'Sesi foto profesional (20 gambar)'),
      L('Fast-track entry, no queuing', 'دخول سريع دون انتظار', 'Masuk jalur cepat tanpa antre'),
      L('Extra time for photography', 'وقت إضافي للتصوير', 'Waktu tambahan untuk fotografi'),
    ],
    details: DETAILS,
    notes: NOTES,
  },
]

/** Round to a whole currency unit so prices read as prices, not calculations. */
function roundPrice(minor: number): number {
  return Math.round(minor / 100) * 100
}

async function main(): Promise<void> {
  if (clear) {
    const removed = await db.delete(activityTiers).returning({ id: activityTiers.id })
    console.log(`\n  Removed ${removed.length} tiers.\n`)
    process.exit(0)
  }

  const rows = await db
    .select({
      id: activities.id,
      slug: activities.slug,
      priceMinor: activities.priceMinor,
      currency: activities.currency,
      maxGuests: activities.maxGuests,
    })
    .from(activities)
    .where(and(eq(activities.status, 'published'), isNull(activities.deletedAt)))

  console.log(`\n  ${rows.length} published activities\n`)

  let written = 0
  for (const activity of rows) {
    for (const [index, spec] of SPECS.entries()) {
      const priceMinor = roundPrice(activity.priceMinor * spec.factor)
      await db
        .insert(activityTiers)
        .values({
          activityId: activity.id,
          key: spec.key,
          name: spec.name,
          tagline: spec.tagline,
          priceMinor,
          currency: activity.currency,
          pricingMode: spec.pricingMode,
          maxGuests: spec.maxGuests,
          isPopular: spec.isPopular,
          features: spec.features,
          highlights: spec.highlights,
          details: spec.details,
          notes: spec.notes,
          sortOrder: index,
          status: 'published',
          publishedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [activityTiers.activityId, activityTiers.key],
          set: {
            name: spec.name,
            tagline: spec.tagline,
            priceMinor,
            currency: activity.currency,
            pricingMode: spec.pricingMode,
            maxGuests: spec.maxGuests,
            isPopular: spec.isPopular,
            features: spec.features,
            highlights: spec.highlights,
            details: spec.details,
            notes: spec.notes,
            sortOrder: index,
            status: 'published',
            updatedAt: new Date(),
          },
        })
      written++
    }
    console.log(`  ${activity.slug.padEnd(32)} 4 tiers`)
  }

  console.log(`\n  ${written} tiers written.\n`)
  process.exit(0)
}

void main()
