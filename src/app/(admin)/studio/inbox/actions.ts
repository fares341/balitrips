'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { notifications } from '@/db/schema'

import { requireCapability } from '../../_lib/session'

/** إشعارات الفريق مشتركة: "مقروء" يعني أن أحداً من الفريق رآه. */
export async function markStaffInboxRead(): Promise<void> {
  await requireCapability('admin.access')
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.audience, 'staff'), isNull(notifications.readAt)))
  revalidatePath('/studio/inbox')
}
