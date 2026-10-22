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

import { addPlanToCart } from './plan-cart'

export async function buyPlan(form: FormData): Promise<void> {
  const locale = await getLocale()
  if (!(await addPlanToCart(form.get('planId')))) {
    redirect({ href: '/plans', locale })
    return
  }
  revalidatePath('/[locale]/my-trip', 'page')
  redirect({ href: '/my-trip', locale })
}
