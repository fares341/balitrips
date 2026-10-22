/**
 * Plans and access.
 *
 * Laid out as "choose your option" tiers (`.bt-ptier`, src/styles/premium.css):
 * a photo top with one badge, three key facts, the price, the "only +X to
 * upgrade" delta computed from the previous tier's real price, the select
 * button, and a checklist read from the plan row. The featured plan is
 * outlined in orange and carries the only filled button.
 *
 * The handoff's version of this screen was the most serious defect in the
 * prototype:
 *
 *     const choose = () => { unlockMap(); toast(t("mp_unlocked")); navigate("map") }
 *
 * One handler, wired to *both* paid tiers. Clicking "Choose plan" set a
 * localStorage boolean and opened the full map — no payment, no order, no
 * record, and no way to tell afterwards who had paid. Because both buttons
 * called it, the $39 VIP tier granted exactly the $19 tier's access and
 * recorded nothing of its own, so a VIP customer had no VIP entitlement.
 *
 * Nothing on this page unlocks anything. Each paid tier is a *link* to
 * `/checkout?plan=map` or `/checkout?plan=vip`; entitlement is granted by the
 * payment webhook writing an `entitlements` row, and read back here through
 * `loadEntitlements` — from Postgres, on the server, on every request. There is
 * no client-side notion of "unlocked" anywhere in this file.
 *
 * Rendering: the shell, the copy and all three cards are static. Only the
 * "Active" badge depends on who is asking, so the grid is rendered twice —
 * once as a signed-out fallback and once with the viewer's real entitlements —
 * behind a `<Suspense>` boundary. The signed-out fallback never claims a plan
 * is active, so the worst case is a badge that appears a moment late.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { buttonClass } from '@/components/bt'
import { HOME_HREF } from '@/components/layout'
import { Button } from '@/components/shared'
import { Icon, Photo, isIconName, type IconName } from '@/components/ui'
import { isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { listActivities } from '@/lib/content/queries'
import { pick, pickOptional } from '@/lib/content/localize'
import type { MediaDto } from '@/lib/content/types'
import {
  emptyEntitlements,
  isEntitlementKind,
  loadEntitlements,
  type EntitlementSet,
} from '@/lib/entitlements'
import { readSetting } from '@/app/(admin)/_lib/settings'
import { listPublishedPlans, loadLivePlanIds, type PlanRow } from '@/lib/entitlements/plans'

import { pageMetadata } from '../_meta'
import { imageAt, imagePool } from '../_ui/imagery'
import { PageBanner } from '../_ui/page-banner'
import { formatPrice } from '../_ui/price'
import { currentUserId } from '../_viewer/session'
import { PLAN_TIERS } from './tiers'

const PLANS_HREF = '/plans'

const NO_PLANS: ReadonlySet<string> = new Set()

/**
 * The awaited translator, passed down rather than re-awaited per component.
 *
 * Keeps `PlanGrid` synchronous so it can serve as the Suspense fallback.
 */
type Translator = Awaited<ReturnType<typeof getTranslations>>

/** How many records to pull for the banner image pool. */
const IMAGE_SOURCE_LIMIT = 6

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
    path: PLANS_HREF,
    title: t('acct_nav_subs'),
    description: t('sub_sub'),
  })
}

export default async function PlansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const [t, activities, allPlans, vip] = await Promise.all([
    getTranslations({ locale }),
    listActivities({ locale, limit: IMAGE_SOURCE_LIMIT }),
    listPublishedPlans(),
    readSetting('vip'),
  ])
  // Phase 3: VIP may be sold only as an extra / inside packages (Studio → VIP).
  const plans = allPlans.filter((plan) => vip.sellStandalone || plan.entitlementKind !== 'vip')

  const pool = imagePool(activities)

  return (
    <main>
      <PageBanner
        image={imageAt(pool, 0)}
        tag={t('sub_eyebrow')}
        title={t('sub_title')}
        subtitle={t('sub_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: HOME_HREF }, { label: t('acct_nav_subs') }]}
      />

      <section className="bt-band bt-band-ivory bt-ptiers-band">
        <div className="wrap">
          {/*
            The fallback is the same grid with an empty entitlement set: three
            cards that offer to sell, and claim nothing. It is what a
            signed-out visitor sees permanently, so it is never wrong — only
            less informed than the resolved version that replaces it.
          */}
          <Suspense
            fallback={
              <PlanGrid
                locale={locale}
                plans={plans}
                images={pool}
                held={emptyEntitlements()}
                livePlanIds={NO_PLANS}
                t={t}
              />
            }
          >
            <EntitledPlanGrid locale={locale} plans={plans} images={pool} t={t} />
          </Suspense>
        </div>
      </section>
    </main>
  )
}

/**
 * The grid, with the viewer's real entitlements.
 *
 * Reads a cookie, so it renders dynamically; everything above it in the tree
 * does not, and stays prerendered once partial prerendering is enabled. This is
 * the component that suspends — `PlanGrid` below it must not, because it is
 * also used as this boundary's fallback and a fallback that suspends has
 * nothing to fall back to.
 */
async function EntitledPlanGrid({
  locale,
  plans,
  images,
  t,
}: {
  locale: Locale
  plans: readonly PlanRow[]
  images: readonly MediaDto[]
  t: Translator
}) {
  const userId = await currentUserId()
  const [held, livePlanIds] = await Promise.all([loadEntitlements(userId), loadLivePlanIds(userId)])

  return (
    <PlanGrid
      locale={locale}
      plans={plans}
      images={images}
      held={held}
      livePlanIds={livePlanIds}
      t={t}
    />
  )
}

/** How much each entitlement opens, for "is this an upgrade?" comparisons. */
const KIND_RANK: Record<string, number> = { basic: 0, map_access: 1, vip: 2 }

type TierBadge = { key: string; tone: 'brand' | 'dark' }

/**
 * One badge per card, decided from the catalogue rather than invented:
 * the plan Studio marks as featured is "most popular", the dearest of two or
 * more paid plans is the "top tier", and the cheapest is the "best price".
 */
function badgeFor(plan: PlanRow, plans: readonly PlanRow[]): TierBadge | null {
  if (plan.featured) return { key: 'sub_best', tone: 'brand' }
  if (plans.length < 2) return null
  const sameCurrency = plans.filter((other) => other.currency === plan.currency)
  const prices = sameCurrency.map((other) => other.priceMinor)
  if (plan.priceMinor === Math.max(...prices)) return { key: 'pl_badge_top', tone: 'dark' }
  if (plan.priceMinor === Math.min(...prices)) return { key: 'pl_badge_best', tone: 'dark' }
  return null
}

/**
 * The paid plan this one is an upgrade from: the previous card, when it costs
 * less in the same currency and opens no more of the map. Anything else is
 * not comparable and gets no "only +X" line.
 */
function upgradeFrom(plan: PlanRow, previous: PlanRow | undefined): PlanRow | null {
  if (previous === undefined) return null
  if (previous.currency !== plan.currency) return null
  if (previous.priceMinor >= plan.priceMinor) return null
  const rank = KIND_RANK[plan.entitlementKind] ?? 0
  const previousRank = KIND_RANK[previous.entitlementKind] ?? 0
  return rank >= previousRank ? previous : null
}

/**
 * Synchronous by construction — see the note on `EntitledPlanGrid`.
 *
 * Laid out as "choose your option" tiers: a photo top with the badge, three
 * key facts in a soft box, the price, the upgrade delta from the previous
 * tier, the select button, then the checklist of what the plan allows. Every
 * line of the checklist is read from the plan row (Studio → Plans) — its
 * features, map level, PDF, trip planner, favourites, members and devices.
 *
 * Explorer (free) stays a fixed card. The buy button posts the plan id —
 * never a price — to the cart.
 */
function PlanGrid({
  locale,
  plans,
  images,
  held,
  livePlanIds,
  t,
}: {
  locale: Locale
  plans: readonly PlanRow[]
  images: readonly MediaDto[]
  held: EntitlementSet
  livePlanIds: ReadonlySet<string>
  t: Translator
}) {
  const free = PLAN_TIERS[0]
  const money = (minor: number, currency: string) => formatPrice(minor, currency, locale)

  return (
    <div className={`bt-ptiers n${plans.length + (free ? 1 : 0)}`}>
      {free && (
        <article className="bt-ptier">
          <TierTop image={imageAt(images, 1)} icon={free.icon} badge={null} t={t} />
          <div className="bt-ptier-body">
            <h2 className="bt-ptier-t">{t(free.titleKey)}</h2>
            <p className="bt-ptier-d">{t(free.bodyKey)}</p>
            <ul className="bt-ptier-facts">
              {free.featureKeys.map((key) => (
                <li key={key}>
                  <Icon name="check" size={16} />
                  {t(key)}
                </li>
              ))}
            </ul>
            <p className="bt-ptier-price">
              <strong>{t('sub_free_price')}</strong>
            </p>
            <p className="bt-ptier-upsell" />
            <Button
              variant="ghost"
              block
              disabled
              className="bt-ptier-cta"
              style={{ opacity: 0.7 }}
            >
              {t('sub_current')}
            </Button>
          </div>
        </article>
      )}

      {plans.map((plan, index) => {
        const kind = isEntitlementKind(plan.entitlementKind) ? plan.entitlementKind : null
        // `has` applies the implication table: a VIP holder reads as active on
        // Map Access too, which is the truth. A `basic` (PDF-only) plan opens
        // nothing on the map, so it is active only when this very plan is held.
        const mapless = kind === 'basic'
        const active = livePlanIds.has(plan.id) || (kind !== null && !mapless && held.has(kind))
        const icon: IconName = plan.icon !== null && isIconName(plan.icon) ? plan.icon : 'star'
        const badge = badgeFor(plan, plans)
        const from = upgradeFrom(plan, plans[index - 1])
        const description = plan.description ? pickOptional(plan.description, locale) : null

        const mapLine = kind === 'vip' ? 'sub_vip_f2' : 'sub_map_f2'
        const facts: { icon: IconName; text: string }[] = [
          {
            icon: 'clock',
            // Stated before purchase (client, Oct 2026): "3 months", or lifetime.
            text:
              plan.durationDays === null
                ? t('pl_lifetime')
                : plan.durationDays % 30 === 0
                  ? t('sub_for_months', { months: plan.durationDays / 30 })
                  : t('sub_for_days', { days: plan.durationDays }),
          },
          {
            icon: mapless ? 'pdf' : 'pin',
            text: mapless
              ? t(plan.canDownloadPdf ? 'sub_basic_pdf' : 'sub_basic_pdf_view')
              : t(mapLine),
          },
          { icon: 'phone', text: t('sub_devices', { count: plan.deviceLimit }) },
        ]

        // The facts box already states the map level (or, for a map-less plan,
        // the PDF), so the checklist adds what it does not: the plan's own
        // feature lines, then the permissions on the row.
        const included: { yes: boolean; text: string }[] = [
          ...(plan.features ?? []).map((feature) => ({ yes: true, text: pick(feature, locale) })),
          ...(kind === 'vip' ? [{ yes: true, text: t('sub_map_f2') }] : []),
          ...(mapless
            ? [{ yes: false, text: t('sub_basic_no_map') }]
            : // View-only is still something the plan gives, so it reads as included.
              [
                {
                  yes: true,
                  text: t(plan.canDownloadPdf ? 'sub_basic_pdf' : 'sub_basic_pdf_view'),
                },
              ]),
          ...(plan.canUseTrip ? [{ yes: true, text: t('pl_trip') }] : []),
          ...(plan.maxMembers > 1
            ? [{ yes: true, text: t('pl_members', { n: plan.maxMembers - 1 }) }]
            : []),
        ]

        return (
          <article
            key={plan.id}
            className={plan.featured ? 'bt-ptier is-featured' : 'bt-ptier'}
            aria-label={pick(plan.name, locale)}
          >
            <TierTop image={imageAt(images, index + 2)} icon={icon} badge={badge} t={t} />
            <div className="bt-ptier-body">
              <h2 className="bt-ptier-t">{pick(plan.name, locale)}</h2>
              <p className="bt-ptier-d">{description ?? ''}</p>

              <ul className="bt-ptier-facts">
                {facts.map((fact) => (
                  <li key={fact.text}>
                    <Icon name={fact.icon} size={16} />
                    {fact.text}
                  </li>
                ))}
              </ul>

              <p className="bt-ptier-price">
                <strong className="bt-money">{money(plan.priceMinor, plan.currency)}</strong>
                {/* The duration is the first fact above; the price line only
                    says how it is paid. */}
                <span>/ {t('sub_once')}</span>
              </p>
              <p className="muted" style={{ fontSize: 12.5, margin: '0 0 6px' }}>
                {plan.durationDays === null
                  ? t('sub_lifetime_note')
                  : plan.durationDays % 30 === 0
                    ? t('sub_duration_note', { months: plan.durationDays / 30 })
                    : t('sub_for_days', { days: plan.durationDays })}
              </p>

              <p className="bt-ptier-upsell">
                {from !== null && (
                  <>
                    <Icon name="arrow" size={14} className="bt-ptier-up" />
                    <span>
                      {t.rich('pl_upgrade', {
                        price: money(plan.priceMinor - from.priceMinor, plan.currency),
                        plan: pick(from.name, locale),
                        b: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </span>
                  </>
                )}
              </p>

              {active ? (
                <Button
                  variant="forest"
                  block
                  disabled
                  className="bt-ptier-cta"
                  style={{ cursor: 'default' }}
                >
                  <Icon name="check" size={16} color="#fff" /> {t('sub_active')}
                </Button>
              ) : (
                // The only thing that grants this plan is a settled payment; the
                // link puts the plan in the cart (a real href — list H12; no
                // prefetch, it is not a page), and checkout prices it server-side.
                <a
                  href={getPathname({
                    href: `/plans/buy/${encodeURIComponent(plan.id)}`,
                    locale,
                  })}
                  rel="nofollow"
                  className={buttonClass(
                    { variant: plan.featured ? 'orange' : 'ghost', block: true },
                    'bt-ptier-cta',
                  )}
                >
                  {t('sub_choose')}
                </a>
              )}

              <ul className="bt-ptier-list">
                {included.map((item) => (
                  <li key={item.text} className={item.yes ? undefined : 'is-no'}>
                    <span className="bt-ptier-tick" aria-hidden="true">
                      <Icon name={item.yes ? 'check' : 'cross'} size={13} stroke={2.2} />
                    </span>
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function TierTop({
  image,
  icon,
  badge,
  t,
}: {
  image: MediaDto | null
  icon: IconName
  badge: TierBadge | null
  t: Translator
}) {
  return (
    <div className="bt-ptier-top">
      <Photo
        src={image?.url}
        srcSetAvif={image?.srcSetAvif}
        srcSetWebp={image?.srcSetWebp}
        sizes="(min-width: 900px) 33vw, 100vw"
        alt=""
      />
      <span className="bt-ptier-ic" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      {badge !== null && (
        <span className={`bt-way-badge is-${badge.tone}`}>
          <Icon name="star" size={13} />
          {t(badge.key)}
        </span>
      )}
    </div>
  )
}
