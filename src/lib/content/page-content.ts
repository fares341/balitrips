/**
 * Public page content model — Studio «محتوى الموقع» (owner, Nov 2026:
 * "every page of the site must be editable from the Studio").
 *
 * Same idea as the home page (`home-content.ts`):
 *  - texts are message keys; edits are stored as site-text overrides
 *    (`message-overrides.ts`), so an untouched field keeps the bundled copy;
 *  - images are slots with a built-in fallback; an empty slot = the fallback;
 *  - sections can be hidden; nothing is hidden until the owner says so;
 *  - structured parts (site FAQ, header/footer links, social links, office
 *    lines, hero videos) live in the `pageContent` setting, and `null` /
 *    empty means "the shipped default".
 *
 * Pure data and helpers — imported by public pages, Studio and the tests.
 */

import type { LocaleText } from './message-overrides'

export const SITE_PAGE_IDS = [
  'about',
  'services',
  'custom',
  'contact',
  'faq',
  'help',
  'platform-use',
  'map-use',
  'payment-methods',
  'credits',
  'header',
  'footer',
  'videos',
] as const
export type SitePageId = (typeof SITE_PAGE_IDS)[number]

export function isSitePageId(value: unknown): value is SitePageId {
  return typeof value === 'string' && (SITE_PAGE_IDS as readonly string[]).includes(value)
}

export interface PageImageSlot {
  id: string
  /** Built-in image shown while the slot is empty. */
  fallback: string
}

export interface PageSectionDef {
  id: string
  /** Message keys editable in this section, in page order. */
  texts: readonly string[]
  images?: readonly PageImageSlot[]
  /** The owner may hide this section. */
  hideable?: boolean
}

export interface SitePageDef {
  id: SitePageId
  /** Public path for the «view page» link (null: shown on every page). */
  path: string | null
  sections: readonly PageSectionDef[]
}

const pairs = (prefix: string, count: number, suffixes = ['_t', '_b']): string[] =>
  Array.from({ length: count }, (_, i) => suffixes.map((s) => `${prefix}${i + 1}${s}`)).flat()

/** Services cards: key → built-in photo (public/services page). */
export const SERVICE_CARDS: Readonly<Record<string, string>> = {
  map: '/map/bali-satellite.webp',
  act: '/brand/jeep.webp',
  itin: '/brand/flatlay.webp',
  pkg: '/brand/green-dress.webp',
  cust: '/brand/consultant.webp',
  drv: '/brand/driver-car.webp',
}

export const SITE_PAGES: readonly SitePageDef[] = [
  {
    id: 'about',
    path: '/about',
    sections: [
      {
        id: 'hero',
        texts: ['ab4_title', 'ab4_lede', 'ab4_story', 'ab4_contact'],
        images: [{ id: 'hero', fallback: '/brand/temple-gate.webp' }],
      },
      {
        id: 'vision',
        texts: ['about_vision_t', 'ab4_vision', 'about_mission_t', 'ab4_mission'],
        hideable: true,
      },
      {
        id: 'diff',
        texts: ['ab4_diff_eyebrow', 'ab4_diff_title', ...pairs('ab4_d', 6)],
        hideable: true,
      },
      {
        id: 'why',
        texts: ['ab4_why_eyebrow', 'ab4_why_title', 'ab4_why_b', 'ab4_why_link'],
        images: [
          { id: 'why_1', fallback: '/brand/rice-walk.webp' },
          { id: 'why_2', fallback: '/brand/kelingking.webp' },
        ],
        hideable: true,
      },
      {
        id: 'trust',
        texts: ['ab4_trust_eyebrow', 'ab4_trust_title', ...pairs('ab4_t', 4)],
        hideable: true,
      },
    ],
  },
  {
    id: 'services',
    path: '/services',
    sections: [
      {
        id: 'banner',
        texts: ['sv4_eyebrow', 'sv4_title', 'sv4_sub'],
        images: [{ id: 'banner', fallback: '/brand/flatlay-wide.webp' }],
      },
      {
        id: 'cards',
        texts: [
          'sv4_signature',
          ...Object.keys(SERVICE_CARDS).flatMap((k) => [`sv4_${k}_t`, `sv4_${k}_d`, `sv4_${k}_go`]),
        ],
        images: Object.entries(SERVICE_CARDS).map(([id, fallback]) => ({
          id: `card_${id}`,
          fallback,
        })),
      },
      {
        id: 'how',
        texts: ['sv4_how_eyebrow', 'sv4_how_title', ...pairs('sv4_how', 4)],
        hideable: true,
      },
      { id: 'quiz', texts: [], hideable: true },
    ],
  },
  {
    id: 'custom',
    path: '/custom',
    sections: [
      {
        id: 'banner',
        texts: ['svc_cust_t', 'cp4_title', 'cp4_sub'],
        images: [{ id: 'banner', fallback: '/brand/consultant.webp' }],
      },
      {
        id: 'how',
        texts: ['cp4_how_t', ...pairs('cp4_how', 4), 'cp4_note'],
        hideable: true,
      },
    ],
  },
  {
    id: 'contact',
    path: '/contact',
    sections: [
      { id: 'head', texts: ['navr_contact', 'co4_sub'] },
      {
        id: 'cards',
        texts: ['co_wa', 'co_wa_b', 'co_mail', 'co_mail_b', 'co_office', 'co_hours', 'co_hours_b'],
      },
      { id: 'quick', texts: ['co4_quick_t', 'co4_quick_b'], hideable: true },
      { id: 'form', texts: ['co_form_t'], hideable: true },
    ],
  },
  {
    id: 'faq',
    path: '/faq',
    sections: [
      { id: 'head', texts: ['faq_title', 'faq_sub', 'faq4_topics'] },
      { id: 'help', texts: ['faq4_help_t', 'faq4_help_b'], hideable: true },
    ],
  },
  {
    id: 'help',
    path: '/help',
    sections: [
      { id: 'head', texts: ['hp_nav', 'hp_title', 'hp_search_ph', 'hp_search'] },
      { id: 'topics', texts: pairs('hp_t', 5), hideable: true },
      {
        id: 'cards',
        texts: ['hp_track_t', 'hp_track_b', 'hp_track_cta', 'hp_talk_t', 'hp_talk_b'],
        hideable: true,
      },
    ],
  },
  {
    id: 'platform-use',
    path: '/platform-use',
    sections: [
      { id: 'head', texts: ['ft_p_platform_use', 'pol_platform_sub'] },
      { id: 'body', texts: pairs('pol_pu', 6) },
    ],
  },
  {
    id: 'map-use',
    path: '/map-use',
    sections: [
      { id: 'head', texts: ['ft_p_map_use', 'pol_map_sub'] },
      { id: 'body', texts: pairs('pol_mu', 6) },
    ],
  },
  {
    id: 'payment-methods',
    path: '/payment-methods',
    sections: [
      { id: 'head', texts: ['pm_title', 'pm_sub'] },
      {
        id: 'methods',
        texts: [
          'pm_card_t',
          'pm_card_b',
          'pm_wallet_t',
          'pm_wallet_b',
          'pm_secure_t',
          'pm_secure_b',
          'pm_currency_t',
          'pm_currency_b',
        ],
      },
      { id: 'refund', texts: ['pm_refund_b'], hideable: true },
    ],
  },
  {
    id: 'credits',
    path: '/credits',
    sections: [
      { id: 'head', texts: ['cr_title', 'cr_sub', 'cr_intro'] },
      {
        id: 'table',
        texts: [
          'cr_empty',
          'cr_col_photographer',
          'cr_col_licence',
          'cr_col_source',
          'cr_source_link',
        ],
      },
    ],
  },
  {
    id: 'header',
    path: null,
    sections: [
      { id: 'cta', texts: ['bt_start_planning', 'bt_favorites', 'bt_my_trip', 'nav_menu'] },
    ],
  },
  {
    id: 'footer',
    path: null,
    sections: [
      { id: 'about', texts: ['bt_ftr_about'] },
      { id: 'quick', texts: ['ft_nav'], hideable: true },
      { id: 'policies', texts: ['ft_policies', 'ft_p_center'], hideable: true },
      { id: 'general', texts: ['foot_info', 'pm_title'], hideable: true },
      { id: 'legal', texts: ['foot_rights'] },
    ],
  },
  {
    id: 'videos',
    path: '/',
    sections: [],
  },
]

export function sitePage(id: SitePageId): SitePageDef {
  const def = SITE_PAGES.find((page) => page.id === id)
  if (!def) throw new Error(`unknown page ${id}`)
  return def
}

/* ------------------------------------------------------------------------ */

export interface SiteLink {
  href: string
  /** Shown label; blank languages fall back to `key` (bundled) or English. */
  label: LocaleText
  /** Message key of the shipped label (for links that came from the defaults). */
  key?: string
}

export interface HeroVideo {
  mp4?: string
  webm?: string
}

export const SOCIAL_NETWORKS = [
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'x',
  'snapchat',
] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export interface SiteFaqItem {
  q: LocaleText
  a: LocaleText
  /** FAQ group id (`faq_g_*`). */
  group: string
  hidden?: boolean
  /** Bundled keys this item came from (blank text falls back to them). */
  qKey?: string
  aKey?: string
}

export interface PageContent {
  pages: Partial<Record<string, { images?: Record<string, string>; hidden?: string[] }>>
  /** Null = the bundled FAQ (faq/groups.ts). */
  faq: SiteFaqItem[] | null
  /** Null = the shipped route lists (components/layout/routes.ts). */
  headerLinks: SiteLink[] | null
  ctaHref: string
  footerQuick: SiteLink[] | null
  footerInfo: SiteLink[] | null
  social: Partial<Record<SocialNetwork, string>>
  /** Office lines on /contact; null = the shipped two. */
  offices: LocaleText[] | null
  heroVideos: Record<string, HeroVideo>
}

export const EMPTY_PAGE_CONTENT: PageContent = {
  pages: {},
  faq: null,
  headerLinks: null,
  ctaHref: '',
  footerQuick: null,
  footerInfo: null,
  social: {},
  offices: null,
  heroVideos: {},
}

export const DEFAULT_OFFICES: readonly string[] = [
  'Seminyak, Bali · Indonesia',
  'Jeddah · Saudi Arabia',
]

/** Whether a section of a page shows (everything shows by default). */
export function sectionShown(content: PageContent, page: SitePageId, section: string): boolean {
  return !(content.pages[page]?.hidden ?? []).includes(section)
}

/** The picked media id of a slot, or null (use the fallback). */
export function slotMediaId(content: PageContent, page: SitePageId, slot: string): string | null {
  const id = content.pages[page]?.images?.[slot]
  return id && id !== '' ? id : null
}

/** A link's label in `locale`: own text → bundled key → English → href. */
export function linkLabel(
  link: SiteLink,
  locale: string,
  translate: (key: string) => string,
): string {
  const own = link.label[locale as keyof LocaleText]?.trim()
  if (own) return own
  if (link.key) return translate(link.key)
  return link.label.en?.trim() || link.href
}

/** Only site-relative paths or http(s) URLs may be linked. */
export function safeHref(href: string): string | null {
  const value = href.trim()
  if (/^\/(?!\/)[^\s]*$/.test(value)) return value
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value
  return null
}

/** A text in `locale`, falling back to English then the given default. */
export function localeTextOr(text: LocaleText | undefined, locale: string, fallback = ''): string {
  return text?.[locale as keyof LocaleText]?.trim() || text?.en?.trim() || fallback
}

/* ---------------- Site FAQ ---------------- */

export interface BundledFaqGroup {
  title: string
  items: readonly { q: string; a: string }[]
}

/** The shipped FAQ as editable items (each remembers its bundled keys). */
export function faqItemsFromBundled(groups: readonly BundledFaqGroup[]): SiteFaqItem[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      q: {},
      a: {},
      group: group.title,
      qKey: item.q,
      aKey: item.a,
    })),
  )
}

export interface ResolvedFaqGroup {
  id: string
  items: { id: string; q: string; a: string }[]
}

/**
 * The FAQ to show in `locale`: the Studio list when one is saved, else the
 * bundled one. Group order follows the bundled groups, then any new group;
 * hidden items and items with no question are left out.
 */
export function resolveFaq(
  saved: readonly SiteFaqItem[] | null,
  groups: readonly BundledFaqGroup[],
  locale: string,
  translate: (key: string) => string,
): ResolvedFaqGroup[] {
  const items = saved ?? faqItemsFromBundled(groups)
  const order = groups.map((group) => group.title)
  const byGroup = new Map<string, ResolvedFaqGroup>()
  items.forEach((item, index) => {
    if (item.hidden) return
    const q = localeTextOr(item.q, locale, item.qKey ? translate(item.qKey) : '')
    const a = localeTextOr(item.a, locale, item.aKey ? translate(item.aKey) : '')
    if (q === '') return
    const groupId = order.includes(item.group) ? item.group : (order[order.length - 1] ?? 'faq')
    const group = byGroup.get(groupId) ?? { id: groupId, items: [] }
    group.items.push({ id: `faq-${index}`, q, a })
    byGroup.set(groupId, group)
  })
  return order.flatMap((id) => {
    const group = byGroup.get(id)
    return group ? [group] : []
  })
}

/* ---------------- Hero videos ---------------- */

/**
 * The sources of one hero clip: an uploaded replacement wins (only the
 * formats uploaded — a stale bundled WebM must not play before a new MP4);
 * with no upload the bundled pair is used.
 */
export function heroVideoSources(
  bundled: { webm: string; mp4: string },
  uploaded: HeroVideo | undefined,
): { webm: string | null; mp4: string | null } {
  if (uploaded && (uploaded.mp4 || uploaded.webm)) {
    return { webm: uploaded.webm || null, mp4: uploaded.mp4 || null }
  }
  return { webm: bundled.webm, mp4: bundled.mp4 }
}

/**
 * Turn the Studio FAQ editor rows into what is stored. A question whose text
 * matches a shipped one is linked back to its keys, and languages equal to
 * the shipped text are dropped — so an untouched question keeps following
 * the bundled copy (and its future corrections). Rows with no group go to
 * the last group.
 */
export function faqFromSubmitted(
  rows: readonly { q: LocaleText; a: LocaleText; hidden?: boolean; pkg?: string }[],
  groups: readonly BundledFaqGroup[],
  bundled: Record<string, Record<string, unknown>>,
): SiteFaqItem[] {
  const text = (locale: string, key: string) => {
    const value = bundled[locale]?.[key]
    return typeof value === 'string' ? value.trim() : ''
  }
  const locales = ['ar', 'en', 'id'] as const
  const shipped = faqItemsFromBundled(groups)
  const fallbackGroup = groups[groups.length - 1]?.title ?? 'faq'
  return rows.map((row) => {
    const match = shipped.find((item) =>
      locales.some((l) => {
        const own = row.q[l]?.trim() ?? ''
        return own !== '' && item.qKey !== undefined && own === text(l, item.qKey)
      }),
    )
    const strip = (value: LocaleText, key: string | undefined): LocaleText => {
      const out: LocaleText = {}
      for (const l of locales) {
        const own = value[l]?.trim() ?? ''
        if (own === '' || (key !== undefined && own === text(l, key))) continue
        out[l] = own
      }
      return out
    }
    const group = groups.some((g) => g.title === row.pkg)
      ? (row.pkg as string)
      : (match?.group ?? fallbackGroup)
    return {
      q: strip(row.q, match?.qKey),
      a: strip(row.a, match?.aKey),
      group,
      ...(row.hidden ? { hidden: true } : {}),
      ...(match?.qKey ? { qKey: match.qKey } : {}),
      ...(match?.aKey ? { aKey: match.aKey } : {}),
    }
  })
}
