'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { ADMIN_LOCALE_COOKIE, isAdminLocale } from '../_i18n'
import { requireElevated } from './session'

/** Language toggle in the Studio sidebar. Stored per browser for a year. */
export async function setAdminLocale(form: FormData): Promise<void> {
  await requireElevated()
  const locale = form.get('locale')
  if (!isAdminLocale(locale)) return
  ;(await cookies()).set(ADMIN_LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 365 * 24 * 60 * 60,
  })
  revalidatePath('/', 'layout')
}
