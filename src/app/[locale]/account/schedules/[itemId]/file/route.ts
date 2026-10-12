/**
 * الملف للعارض داخل الموقع (`../view`) — نفس الفحوص والختم، `inline`،
 * ولا يُحتسب ضمن حد التحميلات.
 */

import { deliverSchedule } from '../../../_lib/schedule-file'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; itemId: string }> },
) {
  const { locale, itemId } = await params
  return deliverSchedule(request, locale, itemId, 'view')
}
