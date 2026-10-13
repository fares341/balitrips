/**
 * Plans and access.
 *
 * Ported from `SubscriptionsPage` in design/handoff/sections-bt/page-static.jsx:
 * three tiers in `.bt-plangrid`, with Map Access featured — a 2px orange
 * border, `scale(1.04)` from 720px up, and the badge notched at `top: -13px`.
 * All of that already lives in `src/styles/components.css`; this page supplies
 * `.bt-plan.best` and nothing else.
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

import { HOME_HREF } from '@/components/layout'
import { Button } from '@/components/shared'
import { Icon, type IconName } from '@/components/ui'
import { isLocale, locales, type Locale } from '@/i18n/config'
import { listActivities } from '@/lib/content/queries'
import { pick } from '@/lib/content/localize'
import {
  emptyEntitlements,
  isEntitlementKind,
  loadEntitlements,
  type EntitlementSet,
} from '@/lib/entitlements'
import { listPublishedPlans, loadLivePlanIds, type PlanRow } from '@/lib/entitlements/plans'
import { formatMoney } from '@/lib/money'

import { pageMetadata } from '../_meta'
import { imageAt, imagePool } from '../_ui/imagery'
import { PageBanner } from '../_ui/page-banner'
import { currentUserId } from '../_viewer/session'
import { buyPlan } from './actions'
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

  const [t, activities, plans] = await Promise.all([
    getTranslations({ locale }),
    listActivities({ locale, limit: IMAGE_SOURCE_LIMIT }),
    listPublishedPlans(),
  ])

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

      <section className="bg-ivory">
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
                held={emptyEntitlements()}
                livePlanIds={NO_PLANS}
                t={t}
              />
            }
          >
            <EntitledPlanGrid locale={locale} plans={plans} t={t} />
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
  t,
}: {
  locale: Locale
  plans: readonly PlanRow[]
  t: Translator
}) {
  const userId = await currentUserId()
  const [held, livePlanIds] = await Promise.all([loadEntitlements(userId), loadLivePlanIds(userId)])

  return <PlanGrid locale={locale} plans={plans} held={held} livePlanIds={livePlanIds} t={t} />
}

/**
 * Synchronous by construction — see the note on `EntitledPlanGrid`.
 *
 * Explorer (free) stays a fixed card; every paid card is a row of `plans`,
 * managed in Studio → Plans. Price, duration and device limit come from the
 * row, and the buy button posts the plan id — never a price — to the cart.
 */
function PlanGrid({
  locale,
  plans,
  held,
  livePlanIds,
  t,
}: {
  locale: Locale
  plans: readonly PlanRow[]
  held: EntitlementSet
  livePlanIds: ReadonlySet<string>
  t: Translator
}) {
  const free = PLAN_TIERS[0]
  return (
    <div className="bt-plangrid">
      {free && (
        <div className="bt-plan">
          <span className="bt-plan-ic" aria-hidden="true">
            <Icon name={free.icon} size={24} color="var(--forest)" />
          </span>
          <h2 style={{ fontSize: 22, marginTop: 12 }}>{t(free.titleKey)}</h2>
          <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0', minHeight: 38 }}>
            {t(free.bodyKey)}
          </p>
          <p className="bt-plan-price">
            <span className="bt-plan-amount">{t('sub_free_price')}</span>
          </p>
          <ul className="bt-checklist" style={{ margin: '18px 0 22px' }}>
            {free.featureKeys.map((key) => (
              <li key={key}>
                <span className="bt-check yes" aria-hidden="true">
                  <Icon name="check" size={14} color="var(--forest)" />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
          <Button variant="ghost" block disabled style={{ opacity: 0.7, cursor: 'default' }}>
            {t('sub_current')}
          </Button>
        </div>
      )}

      {plans.map((plan) => {
        const kind = isEntitlementKind(plan.entitlementKind) ? plan.entitlementKind : null
        // `has` applies the implication table: a VIP holder reads as active on
        // Map Access too, which is the truth. A `basic` (PDF-only) plan opens
        // nothing on the map, so it is active only when this very plan is held.
        const mapless = kind === 'basic'
        const active = livePlanIds.has(plan.id) || (kind !== null && !mapless && held.has(kind))
        const icon = (plan.icon ?? 'star') as IconName

        return (
          <div key={plan.id} className={plan.featured ? 'bt-plan best' : 'bt-plan'}>
            {plan.featured && <span className="bt-plan-badge">{t('sub_best')}</span>}

            <span className="bt-plan-ic" aria-hidden="true">
              <Icon
                name={icon}
                size={24}
                color={plan.featured ? 'var(--on-orange)' : 'var(--forest)'}
              />
            </span>

            <h2 style={{ fontSize: 22, marginTop: 12 }}>{pick(plan.name, locale)}</h2>
            <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0', minHeight: 38 }}>
              {plan.description ? pick(plan.description, locale) : ''}
            </p>

            <p className="bt-plan-price">
              <span className="bt-plan-amount bt-money">
                {formatMoney(plan.priceMinor, plan.currency, locale)}
              </span>
              <span className="bt-plan-term">
                {plan.durationDays === null
                  ? t('sub_once')
                  : t('sub_for_days', { days: plan.durationDays })}
              </span>
            </p>

            <ul className="bt-checklist" style={{ margin: '18px 0 22px' }}>
              {(plan.features ?? []).map((feature, index) => (
                <li key={index}>
                  <span className="bt-check yes" aria-hidden="true">
                    <Icon name="check" size={14} color="var(--forest)" />
                  </span>
                  {pick(feature, locale)}
                </li>
              ))}
              {mapless && (
                <li>
                  <span className="bt-check no" aria-hidden="true">
                    <Icon name="cross" size={14} />
                  </span>
                  {t('sub_basic_no_map')}
                </li>
              )}
              {mapless && (
                <li>
                  <span
                    className={plan.canDownloadPdf ? 'bt-check yes' : 'bt-check no'}
                    aria-hidden="true"
                  >
                    <Icon name={plan.canDownloadPdf ? 'pdf' : 'cross'} size={14} />
                  </span>
                  {t(plan.canDownloadPdf ? 'sub_basic_pdf' : 'sub_basic_pdf_view')}
                </li>
              )}
              <li>
                <span className="bt-check yes" aria-hidden="true">
                  <Icon name="phone" size={14} color="var(--forest)" />
                </span>
                {t('sub_devices', { count: plan.deviceLimit })}
              </li>
            </ul>

            {active ? (
              <Button variant="forest" block disabled style={{ cursor: 'default' }}>
                <Icon name="check" size={16} color="#fff" /> {t('sub_active')}
              </Button>
            ) : (
              // The only thing that grants this plan is a settled payment; the
              // form puts the plan in the cart, and checkout prices it server-side.
              <form action={buyPlan}>
                <input type="hidden" name="planId" value={plan.id} />
                <Button type="submit" variant={plan.featured ? 'orange' : 'forest'} block>
                  <Icon name="lock" size={16} color="#fff" /> {t('sub_choose')}
                </Button>
              </form>
            )}
          </div>
        )
      })}
    </div>
  )
}
