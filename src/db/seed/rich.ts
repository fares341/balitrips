/**
 * Structured activity content (phase 1) for three seeded activities, so the
 * activity page shows the client design with real sections.
 *
 * Every line is taken from facts already in content.json — the activity's own
 * description, duration, area, categories and price. Nothing is invented: no
 * new prices (the packages use the activity's own price; the couples package
 * is exactly two people at that price), no ratings, no times that the seed
 * does not state.
 *
 * Fill-only: an activity whose headline is already set, or that already has
 * packages, is left alone — re-running the seed never overwrites the owner's
 * work.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activities, activityTiers, type Localized } from '@/db/schema'

import { toMinor } from './helpers'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const L = (en: string, ar: string, id: string): Localized => ({ en, ar, id })

interface RichSpec {
  legacyId: string
  headline: Localized
  shortDescription: Localized
  description: Localized
  highlights: Localized[]
  suitableFor: Localized[]
  importantNotes: Localized[]
  meetingPoint: Localized
  meetingTimeNote: Localized | null
  showOnHome: boolean
  isMostPopular: boolean
  tiers: {
    key: string
    name: Localized
    tagline: Localized
    pricingMode: 'per_person' | 'per_couple'
    /** Multiple of the activity's own price (2 = a couple at two people's price). */
    priceUnits: number
    includes: Localized[]
    isPopular: boolean
  }[]
}

const SPECS: readonly RichSpec[] = [
  {
    legacyId: 'batur',
    headline: L(
      'The most iconic morning in Bali',
      'أجمل صباح في بالي',
      'Pagi paling ikonik di Bali',
    ),
    shortDescription: L(
      'Sunrise over Lake Batur from an active volcano.',
      'شروق الشمس فوق بحيرة باتور من قمة بركان نشط.',
      'Matahari terbit di atas Danau Batur dari gunung berapi aktif.',
    ),
    description: L(
      'Summit an active volcano before dawn and watch the sun rise over **Lake Batur** and the caldera.\n\n## The experience\n- Climb before dawn\n- Sunrise over Lake Batur and the caldera',
      'تسلّق بركانًا نشطًا قبل الفجر وشاهد الشمس تشرق فوق **بحيرة باتور** والفوهة.\n\n## التجربة\n- الصعود قبل الفجر\n- شروق الشمس فوق بحيرة باتور والفوهة',
      'Daki gunung berapi aktif sebelum fajar dan saksikan matahari terbit di atas **Danau Batur**.\n\n## Pengalaman\n- Mendaki sebelum fajar\n- Matahari terbit di atas Danau Batur',
    ),
    highlights: [
      L('Summit an active volcano', 'قمة بركان نشط', 'Puncak gunung berapi aktif'),
      L(
        'Sunrise over Lake Batur and the caldera',
        'شروق الشمس فوق بحيرة باتور والفوهة',
        'Matahari terbit di atas Danau Batur',
      ),
    ],
    suitableFor: [
      L('Adventure lovers', 'محبو المغامرات', 'Pecinta petualangan'),
      L('Nature lovers', 'محبو الطبيعة', 'Pecinta alam'),
      L('Photographers', 'محبو التصوير', 'Fotografer'),
    ],
    importantNotes: [
      L(
        'The climb starts before dawn.',
        'يبدأ الصعود قبل الفجر.',
        'Pendakian dimulai sebelum fajar.',
      ),
    ],
    meetingPoint: L('Kintamani', 'كينتاماني', 'Kintamani'),
    meetingTimeNote: L('Before dawn', 'قبل الفجر', 'Sebelum fajar'),
    showOnHome: true,
    isMostPopular: true,
    tiers: [
      {
        key: 'sunrise',
        name: L('Sunrise hike', 'رحلة الشروق', 'Pendakian matahari terbit'),
        tagline: L(
          'Summit before dawn, sunrise over the caldera',
          'القمة قبل الفجر والشروق فوق الفوهة',
          'Puncak sebelum fajar, matahari terbit di kaldera',
        ),
        pricingMode: 'per_person',
        priceUnits: 1,
        includes: [
          L(
            'Sunrise summit of an active volcano',
            'الشروق من قمة بركان نشط',
            'Puncak gunung berapi aktif saat fajar',
          ),
          L('Views over Lake Batur', 'إطلالة على بحيرة باتور', 'Pemandangan Danau Batur'),
        ],
        isPopular: true,
      },
    ],
  },
  {
    legacyId: 'snorkel',
    headline: L(
      'The easiest great snorkel on the island',
      'أسهل تجربة غطس رائعة في الجزيرة',
      'Snorkeling terbaik yang mudah',
    ),
    shortDescription: L(
      'Warm, clear water and a reef busy with fish.',
      'مياه دافئة صافية وشعاب مليئة بالأسماك.',
      'Air hangat jernih dan terumbu penuh ikan.',
    ),
    description: L(
      'Warm, clear water and a reef busy with fish — the easiest great snorkel on the island, **good for beginners and kids**.',
      'مياه دافئة صافية وشعاب مرجانية مليئة بالأسماك — أسهل تجربة غطس رائعة في الجزيرة، **مناسبة للمبتدئين والأطفال**.',
      'Air hangat jernih dan terumbu penuh ikan — snorkeling terbaik yang mudah, **cocok untuk pemula dan anak**.',
    ),
    highlights: [
      L('A reef busy with fish', 'شعاب مرجانية مليئة بالأسماك', 'Terumbu penuh ikan'),
      L('Warm, clear water', 'مياه دافئة صافية', 'Air hangat dan jernih'),
    ],
    suitableFor: [
      L('Beginners', 'المبتدئون', 'Pemula'),
      L('Kids', 'الأطفال', 'Anak-anak'),
      L('Families', 'العائلات', 'Keluarga'),
    ],
    importantNotes: [],
    meetingPoint: L('Padang Bai', 'بادانغ باي', 'Padang Bai'),
    meetingTimeNote: null,
    showOnHome: true,
    isMostPopular: false,
    tiers: [
      {
        key: 'reef',
        name: L('Reef snorkel', 'غطس الشعاب', 'Snorkeling terumbu'),
        tagline: L(
          'Clear water, easy for beginners',
          'مياه صافية وسهلة للمبتدئين',
          'Air jernih, mudah untuk pemula',
        ),
        pricingMode: 'per_person',
        priceUnits: 1,
        includes: [
          L(
            'Snorkel on a reef busy with fish',
            'غطس فوق شعاب مليئة بالأسماك',
            'Snorkeling di terumbu penuh ikan',
          ),
          L(
            'Good for beginners and kids',
            'مناسبة للمبتدئين والأطفال',
            'Cocok untuk pemula dan anak',
          ),
        ],
        isPopular: false,
      },
    ],
  },
  {
    legacyId: 'spa',
    headline: L(
      'A Balinese ritual above the jungle',
      'طقوس بالية فوق الأدغال',
      'Ritual Bali di atas hutan',
    ),
    shortDescription: L(
      'Balinese massage, flower bath and herbal tea.',
      'مساج بالي وحمّام زهور وشاي أعشاب.',
      'Pijat Bali, mandi bunga, dan teh herbal.',
    ),
    description: L(
      'A **two-hour Balinese massage**, flower bath and herbal tea in an open pavilion above the jungle.',
      '**مساج بالي لساعتين** وحمّام الزهور وشاي الأعشاب في جناح مفتوح فوق الأدغال.',
      '**Pijat Bali dua jam**, mandi bunga, dan teh herbal di paviliun terbuka di atas hutan.',
    ),
    highlights: [
      L('Two-hour Balinese massage', 'مساج بالي لساعتين', 'Pijat Bali dua jam'),
      L('Flower bath', 'حمّام الزهور', 'Mandi bunga'),
      L('Herbal tea', 'شاي الأعشاب', 'Teh herbal'),
      L(
        'Open pavilion above the jungle',
        'جناح مفتوح فوق الأدغال',
        'Paviliun terbuka di atas hutan',
      ),
    ],
    suitableFor: [
      L('Couples', 'الأزواج', 'Pasangan'),
      L('Families', 'العائلات', 'Keluarga'),
      L('Spa & relaxation', 'محبو السبا والاسترخاء', 'Spa & relaksasi'),
    ],
    importantNotes: [],
    meetingPoint: L('Ubud', 'أوبود', 'Ubud'),
    meetingTimeNote: null,
    showOnHome: true,
    isMostPopular: false,
    tiers: [
      {
        key: 'ritual',
        name: L('Spa ritual', 'طقوس السبا', 'Ritual spa'),
        tagline: L('For one person', 'لشخص واحد', 'Untuk satu orang'),
        pricingMode: 'per_person',
        priceUnits: 1,
        includes: [
          L('Two-hour Balinese massage', 'مساج بالي لساعتين', 'Pijat Bali dua jam'),
          L('Flower bath', 'حمّام الزهور', 'Mandi bunga'),
          L('Herbal tea', 'شاي الأعشاب', 'Teh herbal'),
        ],
        isPopular: false,
      },
      {
        key: 'couple',
        name: L('Ritual for two', 'طقوس للزوجين', 'Ritual untuk berdua'),
        tagline: L(
          'The same ritual, side by side',
          'نفس الطقوس جنبًا إلى جنب',
          'Ritual yang sama, berdampingan',
        ),
        pricingMode: 'per_couple',
        priceUnits: 2,
        includes: [
          L('Two-hour Balinese massage', 'مساج بالي لساعتين', 'Pijat Bali dua jam'),
          L('Flower bath', 'حمّام الزهور', 'Mandi bunga'),
          L('Herbal tea', 'شاي الأعشاب', 'Teh herbal'),
        ],
        isPopular: true,
      },
    ],
  },
]

export async function seedRichContent(
  tx: Tx,
  activityId: ReadonlyMap<string, string>,
  /** content.json price of each activity, whole units, by legacy id. */
  priceOf: ReadonlyMap<string, number>,
  currency: string,
): Promise<number> {
  let filled = 0
  for (const spec of SPECS) {
    const id = activityId.get(spec.legacyId)
    const price = priceOf.get(spec.legacyId)
    if (!id || price === undefined) continue
    const updated = await tx
      .update(activities)
      .set({
        headline: spec.headline,
        shortDescription: spec.shortDescription,
        description: spec.description,
        highlights: spec.highlights,
        suitableFor: spec.suitableFor,
        importantNotes: spec.importantNotes,
        meetingPoint: spec.meetingPoint,
        meetingTimeNote: spec.meetingTimeNote,
        showOnHome: spec.showOnHome,
        isMostPopular: spec.isMostPopular,
      })
      .where(and(eq(activities.id, id), isNull(activities.headline)))
      .returning({ id: activities.id })
    if (updated.length === 0) continue
    filled += 1

    const [existing] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(activityTiers)
      .where(eq(activityTiers.activityId, id))
    if ((existing?.n ?? 0) > 0) continue
    await tx.insert(activityTiers).values(
      spec.tiers.map((tier, index) => ({
        activityId: id,
        key: tier.key,
        name: tier.name,
        tagline: tier.tagline,
        priceMinor: toMinor(price) * tier.priceUnits,
        currency,
        pricingMode: tier.pricingMode,
        includes: tier.includes,
        isPopular: tier.isPopular,
        sortOrder: index,
        status: 'published',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
      })),
    )
  }
  return filled
}
