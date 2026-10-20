/**
 * Phase 6: critical alerts to the team.
 *
 * Each kind of alert goes out at most once per throttle window (default six
 * hours), however many app instances or worker runs notice the problem: the
 * "last sent" time is a row in `system_heartbeats` (`alert:<key>`) claimed
 * with one conditional upsert, so only one caller wins.
 *
 * Delivery is the normal staff notification (Studio inbox + e-mail to the
 * admins, or to STAFF_ALERT_EMAILS when set).
 */

import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { notifyStaff, type NotificationParams, type StaffNotificationType } from '@/lib/notify'

export type AlertType = Extract<
  StaffNotificationType,
  | 'staff_alert_backup'
  | 'staff_alert_jobs'
  | 'staff_alert_errors'
  | 'staff_alert_payment'
  | 'staff_alert_integration'
>

/** True when this caller won the right to send `key` now. */
export async function claimAlert(key: string, throttleHours = 6): Promise<boolean> {
  const rows = await db.execute<{ name: string }>(sql`
    insert into system_heartbeats (name, last_ok_at, updated_at)
    values (${`alert:${key}`.slice(0, 80)}, now(), now())
    on conflict (name) do update set last_ok_at = now(), updated_at = now()
    where system_heartbeats.last_ok_at < now() - make_interval(hours => ${throttleHours})
    returning name
  `)
  return rows.length > 0
}

/** Send one alert unless the same key was sent within the throttle window. Never throws. */
export async function sendAlert(
  type: AlertType,
  key: string,
  params: NotificationParams,
  throttleHours = 6,
  /** Studio page the alert links to. */
  href = '/system',
): Promise<boolean> {
  try {
    if (!(await claimAlert(key, throttleHours))) return false
    await notifyStaff(type, params, href)
    console.warn('[alert] sent', { type, key, params })
    return true
  } catch (error) {
    console.error('[alert] could not send', { type, key, error })
    return false
  }
}
