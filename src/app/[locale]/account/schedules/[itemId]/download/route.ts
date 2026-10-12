/**
 * تحميل جدول PDF — مختوم بعلامة مائية باسم المشتري ورقم طلبه.
 *
 * كل الفحوص (الجلسة، الجهاز، الحظر، الملكية، الدفع، الاسترداد، سياسة
 * التحميل وحده) في `deliverSchedule()`. انظر ../../../_lib/schedule-file.ts.
 *
 * لا يعيد التوجيه إلى التخزين: الملف الأصلي بلا علامة لا يغادر الخادم.
 */

import { deliverSchedule } from '../../../_lib/schedule-file'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; itemId: string }> },
) {
  const { locale, itemId } = await params
  return deliverSchedule(request, locale, itemId, 'download')
}
