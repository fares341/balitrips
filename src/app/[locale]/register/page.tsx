import type { Metadata } from 'next'

import { AuthRoute, authMetadata } from '../_auth/auth-route'

/** Session-dependent (a signed-in visitor is sent to /account). */
export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  return authMetadata('signup', locale)
}

export default async function Page({ params }: PageProps) {
  const { locale } = await params
  return <AuthRoute mode="signup" raw={locale} />
}
