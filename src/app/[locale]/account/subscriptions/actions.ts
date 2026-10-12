'use server'

import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'

import { redirect } from '@/i18n/routing'
import {
  acceptFamilyInvite,
  inviteFamilyMember,
  removeFamilyMember,
} from '@/lib/entitlements/family'
import { activeUserOrNull } from '@/lib/security/require'

import { toLocale } from '../../_seo-hreflang'
import type { FamilyActionState } from './family-contract'

const refresh = () => revalidatePath('/[locale]/account/subscriptions', 'page')

/** دعوة فرد إلى الباقة العائلية (الوثيقة 13.3). */
export async function inviteFamilyMemberAction(
  _previous: FamilyActionState,
  form: FormData,
): Promise<FamilyActionState> {
  const user = await activeUserOrNull('family:invite')
  if (user === null) return { status: 'error', messageKey: 'map_need_signin' }
  const entitlementId = z.uuid().safeParse(form.get('entitlementId'))
  if (!entitlementId.success) return { status: 'error', messageKey: 'c_error' }
  const result = await inviteFamilyMember(
    user.id,
    entitlementId.data,
    String(form.get('email') ?? ''),
    toLocale(await getLocale()),
  )
  if (!result.ok) return { status: 'error', messageKey: `fam_err_${result.error}` }
  refresh()
  return { status: result.status === 'active' ? 'added' : 'invited', messageKey: null }
}

export async function removeFamilyMemberAction(form: FormData): Promise<void> {
  const user = await activeUserOrNull('family:remove')
  const id = z.uuid().safeParse(form.get('memberId'))
  if (user === null || !id.success) return
  await removeFamilyMember(user.id, id.data)
  refresh()
}

/** قبول دعوة من رابط البريد (زر في صفحة القبول — لا تغيير عند مجرد فتح الرابط). */
export async function acceptFamilyInviteAction(form: FormData): Promise<void> {
  const locale = toLocale(await getLocale())
  const user = await activeUserOrNull('family:accept')
  const token = String(form.get('token') ?? '')
  if (user === null) {
    redirect({
      href: {
        pathname: '/account',
        query: { next: `/account/subscriptions/accept?token=${token}` },
      },
      locale,
    })
    return
  }
  const result = await acceptFamilyInvite(user.id, user.email, token)
  if (result.ok) refresh()
  redirect({
    href: {
      pathname: '/account/subscriptions',
      query: { family: result.ok ? 'accepted' : result.error },
    },
    locale,
  })
}
