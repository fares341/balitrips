import Link from 'next/link'

import { AUTHORIZATION_DAYS } from '@/lib/orders/capture'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { canOpenHref } from '../../_lib/route-access'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'

export const dynamic = 'force-dynamic'

/**
 * «دليل التشغيل» — how a booking and a custom trip run, step by step (owner,
 * Oct 2026). Every step describes what the code does today: the capture /
 * release flow (`src/lib/orders/authorization.ts`), the 6-day sweep
 * (`src/worker/handlers/capacity.ts`), the staff reminders
 * (`src/lib/orders/staff-reminders.ts`) and the WhatsApp automations
 * (`src/lib/whatsapp/dispatch.ts`, only when switched on in Studio → WhatsApp
 * and only to customers who agreed to WhatsApp).
 */

type Who = 'customer' | 'team' | 'auto'

interface Step {
  key: string
  who: Who
  link?: string
}

const BOOKING: readonly Step[] = [
  { key: 'b1', who: 'customer' },
  { key: 'b2', who: 'auto', link: '/orders?status=authorized' },
  { key: 'b3', who: 'team' },
  { key: 'b4', who: 'team' },
  { key: 'b5', who: 'team' },
  { key: 'b6', who: 'team' },
  { key: 'b7', who: 'auto' },
  { key: 'b8', who: 'auto', link: '/whatsapp' },
]

const CUSTOM: readonly Step[] = [
  { key: 'c1', who: 'customer' },
  { key: 'c2', who: 'team', link: '/leads?status=new' },
  { key: 'c3', who: 'team' },
  { key: 'c4', who: 'customer' },
  { key: 'c5', who: 'team' },
  { key: 'c6', who: 'team' },
]

export default async function GuidePage() {
  const session = await requireCapability('orders.read')
  const { t } = await getAdminI18n()
  const vars = { days: AUTHORIZATION_DAYS }

  const steps = (list: readonly Step[]) => (
    <ol className="a-steps">
      {list.map((step, index) => {
        const href = step.link ? adminHref(step.link) : null
        return (
          <li key={step.key} className={`a-step ${step.who}`}>
            <span className="a-step-no" aria-hidden="true">
              {index + 1}
            </span>
            <div className="a-step-body">
              <div className="a-step-head">
                <b>{t(`oo.g_${step.key}_t`, vars)}</b>
                <span className={`a-step-who ${step.who}`}>{t(`oo.g_who_${step.who}`)}</span>
              </div>
              <p>{t(`oo.g_${step.key}_b`, vars)}</p>
              {href && canOpenHref(session.role, href) ? (
                <Link href={href} className="a-step-link">
                  {t(`oo.g_${step.key}_link`)}
                </Link>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )

  return (
    <>
      <PageHead
        title={t('oo.guide_title')}
        description={t('oo.guide_desc')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/orders')}>
            {t('oo.guide_to_orders')}
          </Link>
        }
      />

      <nav className="a-card a-guide-toc" aria-label={t('oo.guide_toc')}>
        <a href="#booking">{t('oo.guide_booking')}</a>
        <a href="#custom">{t('oo.guide_custom')}</a>
        <a href="#buttons">{t('oo.guide_buttons')}</a>
      </nav>

      <section className="a-card" id="booking" aria-labelledby="g-booking">
        <h2 id="g-booking">{t('oo.guide_booking')}</h2>
        <p className="a-hint">{t('oo.guide_booking_intro', vars)}</p>
        {steps(BOOKING)}
      </section>

      <section className="a-card" id="custom" aria-labelledby="g-custom">
        <h2 id="g-custom">{t('oo.guide_custom')}</h2>
        <p className="a-hint">{t('oo.guide_custom_intro')}</p>
        {steps(CUSTOM)}
      </section>

      <section className="a-card" id="buttons" aria-labelledby="g-buttons">
        <h2 id="g-buttons">{t('oo.guide_buttons')}</h2>
        <dl className="a-guide-dl">
          {(['capture', 'release', 'confirm', 'line', 'digital'] as const).map((key) => (
            <div key={key}>
              <dt>{t(`oo.g_btn_${key}_t`)}</dt>
              <dd>{t(`oo.g_btn_${key}_b`, vars)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
