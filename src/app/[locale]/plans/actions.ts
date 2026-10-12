'use server'

/**
 * شراء باقة: يضيف بند `plan` للسلة ويوجّه للسلة.
 *
 * النموذج يرسل معرّف الباقة فقط — لا سعر ولا مدة. يُتحقق أن الباقة منشورة،
 * والسعر يُحسب على الخادم عند الدفع (`buildQuote` ← `plans`). الصلاحية تُمنح
 * فقط عندما يصبح الطلب `paid`.
 */

import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'

import { redirect } from '@/i18n/routing'
import { addItem } from '@/lib/cart'
import { loadPlansById } from '@/lib/entitlements/plans'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function buyPlan(form: FormData): Promise<void> {
  const locale = await getLocale()
  const raw = form.get('planId')
  const planId = typeof raw === 'string' && UUID.test(raw) ? raw : null

  const [plan] = planId === null ? [] : await loadPlansById([planId])
  if (plan === undefined) {
    redirect({ href: '/plans', locale })
    return
  }

  await addItem({ kind: 'plan', refId: plan.id })
  revalidatePath('/[locale]/cart', 'page')
  redirect({ href: '/cart', locale })
}
