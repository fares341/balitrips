/**
 * Payment methods.
 *
 * Linked from the footer's "General information" column. Describes what the
 * checkout really accepts: cards and wallets through Stripe Checkout
 * (src/lib/payments/stripe.ts), and bank transfer, which staff record against
 * an order by hand (`bank_transfer` in PAYMENT_METHODS, src/lib/payments/types.ts).
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Icon, type IconName } from '@/components/ui'
import { locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'

import { pageMetadata } from '../_meta'
import { toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'

const PATH = '/payment-methods'

const METHODS: readonly { icon: IconName; title: string; body: string; marks?: string[] }[] = [
  { icon: 'tag', title: 'pm_card_t', body: 'pm_card_b', marks: ['VISA', 'Mastercard', 'Amex'] },
  { icon: 'phone', title: 'pm_wallet_t', body: 'pm_wallet_b', marks: ['Apple Pay', 'Google Pay'] },
  { icon: 'home', title: 'pm_bank_t', body: 'pm_bank_b' },
  { icon: 'shield', title: 'pm_secure_t', body: 'pm_secure_b' },
  { icon: 'globe', title: 'pm_currency_t', body: 'pm_currency_b' },
]

type PageProps = { params: Promise<{ locale: string }> }

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  return pageMetadata({ locale, path: PATH, title: t('pm_title'), description: t('pm_sub') })
}

export default async function PaymentMethodsPage({ params }: PageProps) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })

  return (
    <main>
      <PageBanner
        tag={t('foot_info')}
        title={t('pm_title')}
        subtitle={t('pm_sub')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('pm_title') }]}
        breadcrumbLabel={t('c_breadcrumb')}
      />

      <div className="bt-band bt-band-ivory">
        <div className="wrap" style={{ maxWidth: 920 }}>
          <ul className="bt-pmlist">
            {METHODS.map((method) => (
              <li key={method.title} className="bt-inc bt-pm">
                <span className="bt-inc-ic" aria-hidden="true">
                  <Icon name={method.icon} size={24} stroke={1.6} />
                </span>
                <div>
                  <h2 className="bt-inc-t">{t(method.title)}</h2>
                  <p className="bt-inc-b">{t(method.body)}</p>
                  {method.marks !== undefined && (
                    <p className="bt-pm-marks">
                      {method.marks.map((mark) => (
                        <span key={mark} className="bt-pm-mark">
                          {mark}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="bt-pm-refund">
            {t('pm_refund_b')} <Link href="/refund">{t('ft_p_refund')}</Link>
          </p>
        </div>
      </div>
    </main>
  )
}
