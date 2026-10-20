import type { MarketingSettings } from './settings'

/**
 * Abandoned checkout reminders.
 *
 * Needs the customer's marketing consent (`users.marketing_consent`, phase 4);
 * until that exists nobody is contacted.
 */
export async function sendCheckoutReminders(
  settings: MarketingSettings,
  _now = new Date(),
): Promise<{ sent: number; skipped: string | null }> {
  if (!settings.abandonedEnabled) return { sent: 0, skipped: 'off' }
  return { sent: 0, skipped: 'no_consent_field' }
}
