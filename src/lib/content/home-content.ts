/**
 * Home page content model (owner, Nov 2026: "I must be able to change every
 * text and every picture myself").
 *
 * Every text on the home page is a message key; Studio → «الصفحة الرئيسية»
 * stores an override per key and language in the `homeContent` setting, and
 * `i18n/request.ts` lays the overrides over the bundled messages. An empty
 * override = the bundled text, so the live site looks identical until the
 * owner edits something. Images work the same way: a slot with no media id
 * shows the built-in photo below.
 *
 * Pure data — imported by the public page, the request config and Studio.
 */

export const HOME_SECTION_IDS = [
  'hero',
  'svc',
  'guide',
  'mr',
  'about',
  'reviews',
  'custom',
  'blog',
] as const
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number]

/** Sections the owner may hide (the hero always shows). */
export const HIDEABLE_SECTIONS: readonly HomeSectionId[] = [
  'svc',
  'guide',
  'mr',
  'about',
  'reviews',
  'custom',
  'blog',
]

export interface ImageSlot {
  id: string
  /** Built-in image, shown while the slot is empty. */
  fallback: string
  /** Message key of the human label in Studio (Studio dictionary). */
  labelKey: string
}

const SVC_KEYS = ['map', 'act', 'itin', 'pkg', 'cust'] as const
const SVC_IMAGES: Record<(typeof SVC_KEYS)[number], string> = {
  map: '/map/bali-satellite.webp',
  act: '/brand/jeep.webp',
  itin: '/brand/rice-walk.webp',
  pkg: '/brand/green-dress.webp',
  cust: '/brand/polaroids.webp',
}
export const ABOUT_UP = ['green-dress', 'temple-gate', 'rice-walk', 'swing', 'ulun-danu'] as const
export const ABOUT_DOWN = [
  'penida-cove',
  'kelingking',
  'jungle-pool',
  'lempuyang',
  'beach-palms',
] as const
export const CUSTOM_TRIP_FALLBACK = '/brand/custom-trip-team.webp'
export const HERO_POSTERS: Record<string, string> = {
  penida: '/brand/hero/hero-penida.webp',
  rice: '/brand/hero/hero-rice.webp',
  uluwatu: '/brand/hero/hero-uluwatu.webp',
}

export interface HomeSectionDef {
  id: HomeSectionId
  /** Message keys editable for this section, in page order. */
  texts: readonly string[]
  images: readonly ImageSlot[]
}

export const HOME_SECTIONS: readonly HomeSectionDef[] = [
  {
    id: 'hero',
    texts: [
      'hv4_bali',
      'hv4_sub_a',
      'hv4_sub_em',
      'hv4_sub_b',
      'hv4_lede',
      'hv4_search_ph',
      'hv4_search_btn',
      'hv3_cta_plan',
      'hv4_pl_penida',
      'hv4_pl_penida_s',
      'hv4_pl_rice',
      'hv4_pl_rice_s',
      'hv4_pl_uluwatu',
      'hv4_pl_uluwatu_s',
      'hv3_meta_title',
      'hv3_hero_lede',
    ],
    images: Object.entries(HERO_POSTERS).map(([id, fallback]) => ({
      id: `hero_poster_${id}`,
      fallback,
      labelKey: `hc.slot_hero_${id}`,
    })),
  },
  {
    id: 'svc',
    texts: [
      'hv4_svc_eyebrow',
      'hv3_qd_title',
      ...SVC_KEYS.flatMap((key) => [`hv4_svc_${key}_t`, `hv4_svc_${key}_d`, `hv4_svc_${key}_go`]),
    ],
    images: SVC_KEYS.map((key) => ({
      id: `svc_${key}`,
      fallback: SVC_IMAGES[key],
      labelKey: `hc.slot_svc_${key}`,
    })),
  },
  {
    id: 'guide',
    texts: ['hv3_fs_eyebrow', 'hv3_fs_title', 'hv4_fs_lede', 'hv3_fs_onmap', 'hv6_guide_go'],
    images: [],
  },
  {
    id: 'mr',
    texts: ['hv4_mr_eyebrow', 'hv4_mr_title', 'hv4_mr_all_act'],
    images: [],
  },
  {
    id: 'about',
    texts: [
      'hv3_ab_eyebrow',
      'hv3_ab_title',
      'hv3_ab_lede',
      'hv3_ab_v1_t',
      'hv4_ab_v1_d',
      'hv3_ab_v2_t',
      'hv4_ab_v2_d',
      'hv3_ab_v3_t',
      'hv4_ab_v3_d',
      'hv3_ab_more',
    ],
    images: [...ABOUT_UP, ...ABOUT_DOWN].map((name) => ({
      id: `about_${name}`,
      fallback: `/brand/${name}.webp`,
      labelKey: 'hc.slot_about',
    })),
  },
  {
    id: 'reviews',
    texts: ['hv3_rv_eyebrow', 'hv3_rv_title', 'hv3_rv_all'],
    images: [],
  },
  {
    id: 'custom',
    texts: [
      'hv3_ct_eyebrow',
      'hv3_ct_title',
      'hv3_ct_body',
      'hv3_ct_request',
      'hv3_ct_talk',
      'hv3_ct_img_alt',
    ],
    images: [{ id: 'custom_trip', fallback: CUSTOM_TRIP_FALLBACK, labelKey: 'hc.slot_custom' }],
  },
  {
    id: 'blog',
    texts: ['hv4_bl_eyebrow', 'hv4_bl_title', 'hv4_bl_all'],
    images: [],
  },
]

export const EDITABLE_TEXT_KEYS: ReadonlySet<string> = new Set(
  HOME_SECTIONS.flatMap((section) => section.texts),
)
export const IMAGE_SLOT_IDS: ReadonlySet<string> = new Set(
  HOME_SECTIONS.flatMap((section) => section.images.map((slot) => slot.id)),
)

export type LocaleText = Partial<Record<'en' | 'ar' | 'id', string>>

export interface HomeContent {
  texts: Record<string, LocaleText>
  images: Record<string, string>
  hidden: string[]
}

export const EMPTY_HOME_CONTENT: HomeContent = { texts: {}, images: {}, hidden: [] }

/**
 * Lay the overrides for one locale over a flat message bundle. Only keys the
 * editor knows are applied, and only non-blank values — a blank field means
 * "use the bundled text".
 */
export function applyTextOverrides<M extends Record<string, unknown>>(
  messages: M,
  content: Pick<HomeContent, 'texts'>,
  locale: string,
): M {
  const out: Record<string, unknown> = { ...messages }
  for (const [key, values] of Object.entries(content.texts)) {
    if (!EDITABLE_TEXT_KEYS.has(key)) continue
    const value = values[locale as keyof LocaleText]
    if (typeof value === 'string' && value.trim() !== '') out[key] = value
  }
  return out as M
}

/** Overrides worth storing: drop values equal to the bundled text or blank. */
export function diffAgainstBundled(
  submitted: Record<string, LocaleText>,
  bundled: Record<string, Record<string, unknown>>,
): Record<string, LocaleText> {
  const out: Record<string, LocaleText> = {}
  for (const [key, values] of Object.entries(submitted)) {
    if (!EDITABLE_TEXT_KEYS.has(key)) continue
    const kept: LocaleText = {}
    for (const [locale, value] of Object.entries(values) as [keyof LocaleText, string][]) {
      const text = (value ?? '').trim()
      if (text === '' || text === bundled[locale]?.[key]) continue
      kept[locale] = text.slice(0, 2000)
    }
    if (Object.keys(kept).length > 0) out[key] = kept
  }
  return out
}
