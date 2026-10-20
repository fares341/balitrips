'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { notifications, users } from '@/db/schema'
import { getUser } from '@/lib/auth/session'

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getUser()
  if (user === null) return
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, user.id),
        eq(notifications.audience, 'user'),
        isNull(notifications.readAt),
      ),
    )
  revalidatePath('/[locale]/account/notifications', 'page')
}

/** موافقة واتساب. صريحة، ويمكن سحبها في أي وقت. */
export async function setWhatsappOptIn(form: FormData): Promise<void> {
  const user = await getUser()
  if (user === null) return
  const optIn = form.get('whatsappOptIn') === 'on'
  await db.update(users).set({ whatsappOptIn: optIn }).where(eq(users.id, user.id))
  revalidatePath('/[locale]/account/notifications', 'page')
}

/**
 * Phase 4: offers and news by e-mail / WhatsApp. Explicit, off by default,
 * withdrawable at any time; the time and where it was given are kept.
 */
export async function setMarketingConsent(form: FormData): Promise<void> {
  const user = await getUser()
  if (user === null) return
  const consent = form.get('marketingConsent') === 'on'
  const [current] = await db
    .select({ marketingConsent: users.marketingConsent })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  if (current && current.marketingConsent !== consent) {
    await db
      .update(users)
      .set({
        marketingConsent: consent,
        marketingConsentAt: new Date(),
        marketingConsentSource: 'account',
      })
      .where(eq(users.id, user.id))
  }
  revalidatePath('/[locale]/account/notifications', 'page')
}
