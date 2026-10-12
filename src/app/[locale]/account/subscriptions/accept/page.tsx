/**
 * قبول دعوة الباقة العائلية من رابط البريد.
 *
 * فتح الرابط لا يغيّر شيئاً (ماسحات الروابط في البريد تفتحه تلقائياً)؛ القبول
 * بزر يرسل نموذجاً. غير المسجّل يُحوَّل لتسجيل الدخول ثم يعود هنا.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Button } from '@/components/shared'
import { redirect } from '@/i18n/routing'
import { getUser } from '@/lib/auth/session'

import { toLocale } from '../../../_seo-hreflang'
import { accountMetadata } from '../../_lib/meta'
import { acceptFamilyInviteAction } from '../actions'

type PageParams = Promise<{ locale: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'fam_accept_t')
}

export default async function AcceptFamilyInvitePage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const t = await getTranslations({ locale })
  const query = await searchParams
  const token = typeof query.token === 'string' ? query.token.slice(0, 120) : ''

  const user = await getUser()
  if (user === null) {
    redirect({
      href: {
        pathname: '/account',
        query: { next: `/account/subscriptions/accept?token=${token}` },
      },
      locale,
    })
  }

  return (
    <section
      aria-labelledby="bt-fam-accept-h"
      className="card"
      style={{ padding: 24, maxWidth: 560 }}
    >
      <h1 id="bt-fam-accept-h" style={{ fontSize: 20, marginBlockStart: 0 }}>
        {t('fam_accept_t')}
      </h1>
      <p className="muted">{t('fam_accept_b', { email: user?.email ?? '' })}</p>
      <form action={acceptFamilyInviteAction}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="forest">
          {t('fam_accept_btn')}
        </Button>
      </form>
    </section>
  )
}
