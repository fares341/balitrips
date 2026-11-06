/**
 * The download link in the delivery e-mail (phase 4). Signed, expiring,
 * use-limited and revocable — see src/lib/itineraries/download-tokens.ts.
 * Streams the stamped PDF; never redirects to storage.
 */

import { deliverScheduleByToken } from '../../account/_lib/schedule-file'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; token: string }> },
) {
  const { locale, token } = await params
  return deliverScheduleByToken(request, locale, token)
}
