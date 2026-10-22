/**
 * Custom trip questionnaire.
 *
 * Ported from `CustomPage` in design/handoff/sections-bt/page-content.jsx.
 *
 * The interactive half lives in `custom-trip-form.tsx`; this page's job is to
 * hand it the things it must not invent for itself:
 *
 *  1. **The interest toggles**, built from the `categories` table and localized
 *     here. The handoff hard-coded six `[key, icon]` pairs and looked the label
 *     up with `(ACT_CATS.find((c) => c.key === k) || {}).label?.[lang]`. One of
 *     those six keys was not in the catalogue, so `.find` returned undefined,
 *     the optional chain swallowed it, and the chip rendered as an icon with
 *     no text next to it — clickable, submittable, and meaningless. A key the
 *     taxonomy does not carry is dropped here, and the list is topped back up
 *     from real categories so the row still has six.
 *  2. **The default selection**, filtered through the same check.
 *
 * The budget is asked as a category (economy / mid-range / luxury — client
 * revision 1), so no currency or amount is needed here any more.
 *
 * Statically renderable: nothing here reads cookies or headers. The server
 * action the form posts to does, which is where that belongs.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { HOME_HREF } from '@/components/layout'
import { Icon, type IconName } from '@/components/ui'
import { isLocale, locales, type Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import { listCategories, listRegions } from '@/lib/content/queries'
import type { CategoryDto } from '@/lib/content/types'

import { pageMetadata } from '../_meta'
import { PageBanner } from '../_ui/page-banner'
import { CUSTOM_HREF } from '../_ui/routes-extra'
import { CustomTripForm } from './custom-trip-form'
import type { InterestOption } from './types'

/** The taxonomy's "everything" sentinel — a list filter, not an interest. */
const ALL_CATEGORY_KEY = 'all'

/** How many toggles the row holds, as in the design. */
const INTEREST_COUNT = 6

/**
 * The design's six interests, in its order, with the glyph it paired each one
 * with. A *preference*, not a definition: any key the `categories` table does
 * not carry is skipped and the row is filled from the taxonomy instead.
 */
const PREFERRED_INTERESTS: readonly { key: string; icon: IconName }[] = [
  { key: 'adv', icon: 'compass' },
  { key: 'beach', icon: 'wave' },
  { key: 'food', icon: 'coffee' },
  { key: 'nature', icon: 'mountain' },
  { key: 'culture', icon: 'star' },
  { key: 'family', icon: 'users' },
]

/** Used when a category row carries no icon of its own. */
const FALLBACK_ICON: IconName = 'sparkle'

/** Pre-ticked, as in the handoff — subject to the same existence check. */
const DEFAULT_INTERESTS = ['beach', 'nature']

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const t = await getTranslations({ locale })

  return pageMetadata({
    locale,
    path: CUSTOM_HREF,
    title: t('svc_cust_t'),
    description: t('cp_sub'),
  })
}

export default async function CustomPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const [t, categories, regionRows] = await Promise.all([
    getTranslations({ locale }),
    listCategories(),
    listRegions({ includeAreas: true }),
  ])
  const areas = regionRows.map((row) => ({ key: row.key, label: pick(row.label, locale, row.key) }))

  const interests = interestOptions(categories, locale)
  const available = new Set(interests.map((one) => one.key))
  const defaults = DEFAULT_INTERESTS.filter((key) => available.has(key))

  return (
    <main>
      <PageBanner
        image={null}
        imageSrc="/brand/consultant.webp"
        tag={t('svc_cust_t')}
        title={t('cp4_title')}
        subtitle={t('cp4_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: HOME_HREF }, { label: t('svc_cust_t') }]}
      />

      <section className="bg-ivory sec-tight">
        <div className="wrap ct-grid">
          {/* How the custom service works (v3 custom-trip.html side panel) */}
          <aside className="ct-side">
            <div className="panel stack" style={{ gap: 12 }}>
              <b style={{ color: 'var(--forest)' }}>{t('cp4_how_t')}</b>
              <ol className="ct-how">
                {(['cp4_how1', 'cp4_how2', 'cp4_how3', 'cp4_how4'] as const).map((key, index) => (
                  <li key={key} className={index === 3 ? 'pending' : undefined}>
                    <b>{t(`${key}_t`)}</b>
                    <small className="muted">{t(`${key}_b`)}</small>
                  </li>
                ))}
              </ol>
            </div>
            <p className="alert alert-info ct-note">
              <Icon name="info" size={18} />
              <span>{t('cp4_note')}</span>
            </p>
          </aside>
          <CustomTripForm interests={interests} areas={areas} defaultInterests={defaults} />
        </div>
      </section>
    </main>
  )
}

/**
 * Build the toggle row from the real taxonomy.
 *
 * Every option that comes out of here has a key the `categories` table
 * actually contains and a label that is guaranteed non-empty — `pick` falls
 * back to the row's own key, so an untranslated category degrades to something
 * identifiable rather than to a blank chip.
 */
function interestOptions(categories: readonly CategoryDto[], locale: Locale): InterestOption[] {
  const selectable = categories.filter((category) => category.key !== ALL_CATEGORY_KEY)
  const byKey = new Map(selectable.map((category) => [category.key, category]))

  const out: InterestOption[] = []
  const used = new Set<string>()

  for (const preferred of PREFERRED_INTERESTS) {
    const category = byKey.get(preferred.key)
    // The fix: a preferred key the catalogue does not have is simply not
    // offered, rather than offered without a label.
    if (category === undefined) continue

    out.push({
      key: category.key,
      label: pick(category.label, locale, category.key),
      icon: category.icon ?? preferred.icon,
    })
    used.add(category.key)
  }

  // Top the row back up so a renamed category costs a chip's content, not the
  // chip itself.
  for (const category of selectable) {
    if (out.length >= INTEREST_COUNT) break
    if (used.has(category.key)) continue

    out.push({
      key: category.key,
      label: pick(category.label, locale, category.key),
      icon: category.icon ?? FALLBACK_ICON,
    })
    used.add(category.key)
  }

  return out.slice(0, INTEREST_COUNT)
}
