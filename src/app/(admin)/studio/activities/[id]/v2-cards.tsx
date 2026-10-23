/**
 * Activity editor cards added for the v2 page (client spec, Oct 2026): the
 * pre-publish checklist, revision history (from the audit log), content
 * templates, and the SEO & related-activities tab.
 */

import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import type { ReactNode } from 'react'

import { db } from '@/db'
import { activities, activityTiers, auditLog, users } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { missingForPublish } from '@/lib/content/activity-checklist'
import { TEMPLATE_KEYS } from '@/lib/content/activity-templates'
import { pick } from '@/lib/content/localize'

import { getAdminI18n } from '../../../_lib/i18n'
import { activityOptions } from '../../../_lib/lookups'
import { Field, LocalizedField, Select, TextInput } from '../../../_ui/field'
import { loadPickerMedia, MediaPicker } from '../../../_ui/media-picker'
import { OptionChecklist } from '../../../_ui/select-field'
import { When } from '../../../_ui/table'
import { loadChecklist } from '../checklist'
import { applyContentTemplate } from '../v2-actions'

type ActivityRow = typeof activities.$inferSelect

/** The activity's packages, for «applies to: all packages / this one». */
export async function packageScopes(activityId: string, locale: Locale) {
  const rows = await db
    .select({ id: activityTiers.id, key: activityTiers.key, name: activityTiers.name })
    .from(activityTiers)
    .where(and(eq(activityTiers.activityId, activityId), isNull(activityTiers.deletedAt)))
    .orderBy(asc(activityTiers.sortOrder))
  return rows.map((row) => ({ value: row.id, label: pick(row.name, locale, row.key) }))
}

/** What must be filled before publishing; shown on the basics tab. */
export async function ChecklistCard({ activityId }: { activityId: string }) {
  const { t } = await getAdminI18n()
  const items = await loadChecklist(db, activityId)
  if (!items) return null
  const missing = missingForPublish(items)
  return (
    <section className="a-card" id="checklist">
      <h2>{t('av2.checklist_title')}</h2>
      <p className="a-hint">
        {missing.length === 0 ? t('av2.checklist_ready') : t('av2.checklist_blocked')}
      </p>
      <ul className="a-checklist">
        {items.map((item) => (
          <li key={item.key} className={item.ok ? 'ok' : item.required ? 'missing' : 'warn'}>
            {t(`av2.check_${item.key}`)}
            {!item.ok && !item.required ? (
              <span className="a-muted"> · {t('av2.check_optional')}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Revision history: the last changes to the activity and its packages (audit log). */
export async function HistoryCard({ activityId }: { activityId: string }) {
  const { t } = await getAdminI18n()
  const tierIds = (
    await db
      .select({ id: activityTiers.id })
      .from(activityTiers)
      .where(eq(activityTiers.activityId, activityId))
  ).map((row) => row.id)
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      after: auditLog.after,
      actor: users.name,
      email: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(
      or(
        and(eq(auditLog.entityType, 'activity'), eq(auditLog.entityId, activityId)),
        tierIds.length > 0
          ? and(eq(auditLog.entityType, 'activity_tier'), inArray(auditLog.entityId, tierIds))
          : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(20)
  if (rows.length === 0) return null
  return (
    <section className="a-card" id="history">
      <h2>{t('av2.history_title')}</h2>
      <p className="a-hint">{t('av2.history_hint')}</p>
      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th>{t('common.updated')}</th>
              <th>{t('av2.history_action')}</th>
              <th>{t('av2.history_by')}</th>
              <th>{t('av2.history_fields')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <When value={row.createdAt} />
                </td>
                <td dir="ltr">{row.action}</td>
                <td>{row.actor ?? row.email ?? '—'}</td>
                <td dir="ltr" className="a-muted">
                  {row.after && typeof row.after === 'object'
                    ? Object.keys(row.after as Record<string, unknown>)
                        .slice(0, 6)
                        .join(', ')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** «Start from a template»: fills empty lists only, then asks for a review. */
export async function TemplateCard({
  activityId,
  current,
}: {
  activityId: string
  current: string | null
}) {
  const { t } = await getAdminI18n()
  return (
    <form className="a-card" action={applyContentTemplate.bind(null, activityId)}>
      <h2>{t('av2.template_title')}</h2>
      <p className="a-hint">{t('av2.template_hint')}</p>
      <div className="a-row">
        <Field label={t('av2.template')} htmlFor="template">
          <Select id="template" name="template" defaultValue={current ?? ''}>
            <option value="">—</option>
            {TEMPLATE_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`av2.template_${key}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="a-actions">
        <button className="a-btn ghost" type="submit">
          {t('av2.template_apply')}
        </button>
      </div>
    </form>
  )
}

/** SEO per language, share picture, canonical link and hand-picked related activities. */
export async function SeoTab({
  activity,
  save,
  actions,
}: {
  activity: ActivityRow
  save: (form: FormData) => Promise<void>
  actions: ReactNode
}) {
  const { t } = await getAdminI18n()
  const [mediaList, options] = await Promise.all([loadPickerMedia(), activityOptions()])
  return (
    <form className="a-form" action={save}>
      <div className="a-card">
        <h2>{t('av2.seo_title')}</h2>
        <p className="a-hint">{t('av2.seo_hint')}</p>
        <LocalizedField
          name="seoTitle"
          label={t('av2.seo_page_title')}
          value={activity.seoTitle}
          hint={t('av2.seo_page_title_hint')}
        />
        <LocalizedField
          name="seoDescription"
          label={t('av2.seo_description')}
          value={activity.seoDescription}
          rows={2}
          hint={t('av2.seo_description_hint')}
        />
        <MediaPicker
          name="ogImageId"
          label={t('av2.og_image')}
          items={mediaList}
          value={activity.ogImageId}
          hint={t('av2.og_image_hint')}
        />
        <Field label={t('av2.canonical')} htmlFor="canonicalUrl" hint={t('av2.canonical_hint')}>
          <TextInput
            id="canonicalUrl"
            name="canonicalUrl"
            type="url"
            dir="ltr"
            defaultValue={activity.canonicalUrl ?? ''}
          />
        </Field>
      </div>
      <div className="a-card">
        <h2>{t('av2.related_title')}</h2>
        <OptionChecklist
          name="relatedIds"
          label={t('av2.related')}
          options={options.filter((option) => option.value !== activity.id)}
          values={activity.relatedIds ?? []}
          hint={t('av2.related_hint')}
        />
      </div>
      {actions}
    </form>
  )
}
