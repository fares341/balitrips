import 'server-only'

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { leadContacts, users, whatsappMessages } from '@/db/schema'
import { isLocale, type Locale } from '@/i18n/config'

import { sendWithSettings } from './dispatch'
import { readWhatsappSettings } from './settings'
import { stopConfirmation, type InboundText, type StopCommand } from './stop'

export interface StopResult {
  command: StopCommand
  /** Accounts + lead rows whose state changed (0 = already in that state). */
  changed: number
  confirmed: boolean
}

/**
 * Apply a STOP / START reply from `from` (E.164 digits):
 *  - STOP: every account with this number gets `whatsapp_opted_out_at`
 *    (which blocks every automation, transactional too) and loses the
 *    marketing opt-in; every lead row with it loses WhatsApp consent.
 *  - START: the opt-out is cleared and consent recorded again (the
 *    customer asked for it, by message, now).
 * One confirmation goes back, only when something changed — a repeated
 * STOP is not answered twice.
 */
export async function applyStopCommand(
  message: InboundText,
  command: StopCommand,
): Promise<StopResult> {
  const phone = `+${message.from}`
  const now = new Date()

  const { changed, locale, userId } = await db.transaction(async (tx) => {
    const accounts =
      command === 'stop'
        ? await tx
            .update(users)
            .set({ whatsappOptedOutAt: now, whatsappOptIn: false })
            .where(and(eq(users.phoneNormalized, phone), isNull(users.whatsappOptedOutAt)))
            .returning({ id: users.id, locale: users.locale })
        : await tx
            .update(users)
            .set({ whatsappOptedOutAt: null, whatsappOptIn: true })
            .where(and(eq(users.phoneNormalized, phone), isNotNull(users.whatsappOptedOutAt)))
            .returning({ id: users.id, locale: users.locale })
    const leads =
      command === 'stop'
        ? await tx
            .update(leadContacts)
            .set({ whatsappConsent: false, whatsappConsentAt: null })
            .where(and(eq(leadContacts.phone, phone), eq(leadContacts.whatsappConsent, true)))
            .returning({ locale: leadContacts.locale })
        : await tx
            .update(leadContacts)
            .set({
              whatsappConsent: true,
              whatsappConsentAt: now,
              consentText: sql`coalesce(${leadContacts.consentText}, 'WhatsApp reply: START')`,
            })
            .where(and(eq(leadContacts.phone, phone), eq(leadContacts.whatsappConsent, false)))
            .returning({ locale: leadContacts.locale })
    const first = accounts[0]?.locale ?? leads[0]?.locale ?? 'ar'
    return {
      changed: accounts.length + leads.length,
      locale: (isLocale(first) ? first : 'ar') as Locale,
      userId: accounts[0]?.id ?? null,
    }
  })

  let confirmed = false
  if (changed > 0) {
    const text = stopConfirmation(command, locale)
    const dedupeKey = `${command}:${message.id ?? `${message.from}:${now.getTime()}`}`.slice(0, 160)
    const [row] = await db
      .insert(whatsappMessages)
      .values({
        automation: `${command}_confirm`,
        dedupeKey,
        userId,
        toPhone: message.from,
        locale,
        body: text,
        status: 'queued',
      })
      .onConflictDoNothing({ target: whatsappMessages.dedupeKey })
      .returning({ id: whatsappMessages.id })
    if (row) {
      try {
        const settings = await readWhatsappSettings()
        // A reply inside the 24-hour window: plain text is allowed.
        const { provider, result } = await sendWithSettings(settings, {
          to: message.from,
          text,
          locale,
          template: null,
          params: [],
        })
        confirmed = result.ok
        await db
          .update(whatsappMessages)
          .set({
            provider,
            status: result.ok ? 'sent' : 'failed',
            providerMessageId: result.ok ? result.messageId : null,
            error: result.ok ? null : result.error.slice(0, 500),
            attempts: 1,
            sentAt: result.ok ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(whatsappMessages.id, row.id))
      } catch (error) {
        console.error('[whatsapp] stop confirmation failed', { command, error })
        await db
          .update(whatsappMessages)
          .set({ status: 'failed', error: String(error).slice(0, 500), updatedAt: new Date() })
          .where(eq(whatsappMessages.id, row.id))
      }
    }
  }
  return { command, changed, confirmed }
}
