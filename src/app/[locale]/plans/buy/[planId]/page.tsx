/**
 * `/plans/buy/<planId>` — one plan, with an explicit "add to my trip" button.
 *
 * This address used to be a GET handler that put the plan in the visitor's
 * trip and redirected (list H12, "the button as a real link"). A GET that
 * changes something is followed by crawlers, link previewers and prefetchers:
 * the site crawl ended up with both plans in its cart (crawl audit 13). Now
 * opening the address only SHOWS the plan; adding it is a POST from the
 * button (`buyPlan`). Links that still point here — the map's upgrade sheet,
 * a shared link, a bookmark — keep working and cost one deliberate tap.
 *
 * Nothing priced here comes from the address: `?devices=n` only presets the
 * stepper, and the server clamps and prices the count again when it is added
 * and at checkout.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { readSetting } from '@/app/(admin)/_lib/settings'
import { Breadcrumbs, buttonClass, LinkButton } from '@/components/bt'
import { Money } from '@/components/currency/currency-context'
import { HOME_HREF } from '@/components/layout'
import { Icon, isIconName, type IconName } from '@/components/ui'
import { redirect } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { loadPlansById } from '@/lib/entitlements/plans'
import { planDeviceRange, sellsExtraDevices } from '@/lib/pricing/plan-devices'

import { toLocale } from '../../../_seo-hreflang'
import { buyPlan } from '../../actions'
import { DevicePicker } from '../../device-picker'
import { planAccessMessage } from '../../duration'

/** Reads the plan's live price and the VIP switch: never cached. */
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLANS_HREF = '/plans'

type PageProps = {
  params: Promise<{ locale: string; planId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** The plan when it is on sale on its own, else null. */
async function planForSale(planId: string) {
  const [plan] = UUID.test(planId) ? await loadPlansById([planId]) : []
  if (plan === undefined || plan.priceMinor <= 0) return null
  // Phase 3: standalone VIP can be switched off in Studio → VIP settings.
  if (plan.entitlementKind === 'vip' && !(await readSetting('vip')).sellStandalone) return null
  return plan
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, planId } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  const plan = await planForSale(planId)
  return {
    title: plan === null ? t('navr_plans') : pick(plan.name, locale),
    // A step on the way to checkout, one per plan and device count.
    robots: { index: false, follow: false },
  }
}

export default async function BuyPlanPage({ params, searchParams }: PageProps) {
  const { locale: raw, planId } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const plan = await planForSale(planId)
  // Unknown, withdrawn or not sold on its own: the list is the place to choose.
  if (plan === null) return redirect({ href: PLANS_HREF, locale })

  const t = await getTranslations({ locale })
  const name = pick(plan.name, locale)
  const description = plan.description ? pickOptional(plan.description, locale) : null
  const access = planAccessMessage(plan.durationDays)
  const perDevice = sellsExtraDevices(plan)
  const wanted = Number((await searchParams).devices)
  const icon: IconName = plan.icon !== null && isIconName(plan.icon) ? plan.icon : 'star'
  const cta = buttonClass({ variant: 'orange', block: true }, 'bt-ptier-cta')

  return (
    <main className="bt-buyplan">
      <div className="wrap">
        <Breadcrumbs
          label={t('c_breadcrumb')}
          trail={[
            { label: t('c_home'), href: HOME_HREF },
            { label: t('navr_plans'), href: PLANS_HREF },
            { label: name },
          ]}
        />
        <article className="bt-ptier is-featured bt-buyplan-card" aria-labelledby="buyplan-t">
          <div className="bt-ptier-body">
            <span className="bt-buyplan-ic" aria-hidden="true">
              <Icon name={icon} size={26} />
            </span>
            <h1 className="bt-ptier-t" id="buyplan-t">
              {name}
            </h1>
            {description !== null && <p className="bt-ptier-d">{description}</p>}

            <ul className="bt-ptier-facts">
              <li>
                <Icon name="clock" size={16} />
                {t(access.key, access.values)}
              </li>
              <li>
                <Icon name="mobile" size={16} />
                {perDevice
                  ? t('pl_devices_from', {
                      count: plan.deviceLimit,
                      max: planDeviceRange(plan).max,
                    })
                  : t('sub_devices', { count: plan.deviceLimit })}
              </li>
            </ul>

            {perDevice ? (
              <DevicePicker
                plan={{
                  priceMinor: plan.priceMinor,
                  deviceLimit: plan.deviceLimit,
                  extraDevicePriceMinor: plan.extraDevicePriceMinor,
                  maxDevices: plan.maxDevices,
                }}
                currency={plan.currency}
                planId={plan.id}
                initialDevices={Number.isFinite(wanted) ? wanted : undefined}
                ctaLabel={t('pl_buy_add')}
                ctaClassName={cta}
              />
            ) : (
              <>
                <p className="bt-ptier-price">
                  <strong className="bt-money">
                    <Money minor={plan.priceMinor} currency={plan.currency} />
                  </strong>
                  <span>/ {t('sub_once')}</span>
                </p>
                <form action={buyPlan} className="bt-ptier-buy">
                  <input type="hidden" name="planId" value={plan.id} />
                  <button type="submit" className={cta}>
                    {t('pl_buy_add')}
                  </button>
                </form>
              </>
            )}

            <p className="muted bt-buyplan-note">{t('pl_buy_note')}</p>
            <LinkButton href={PLANS_HREF} variant="ghost" block>
              {t('pl_buy_all')}
            </LinkButton>
          </div>
        </article>
      </div>
    </main>
  )
}
