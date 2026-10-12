/** ملف جدول مخصص — نفس فحوص وختم جداول الرحلات، انظر ../../../_lib/schedule-file.ts */

import { deliverSchedule } from '../../../_lib/schedule-file'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; docId: string }> },
) {
  const { locale, docId } = await params
  return deliverSchedule(request, locale, docId, 'download', 'custom')
}
