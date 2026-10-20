import { and, eq, lt, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { crmTasks } from '@/db/schema'
import { loadStaff } from '@/lib/crm/queries'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { buildQuery, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { baliToday, loadTasks, NewTaskForm, TaskList } from './task-ui'

export const dynamic = 'force-dynamic'

const VIEWS = ['mine', 'all', 'overdue', 'done'] as const
type View = (typeof VIEWS)[number]

/** المهام — follow-ups for the team, each linked to a customer, request or order. */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const raw = param(params, 'view')
  const view: View = (VIEWS as readonly string[]).includes(raw ?? '') ? (raw as View) : 'mine'
  const today = baliToday()

  const where: SQL | undefined =
    view === 'mine'
      ? and(eq(crmTasks.assigneeId, session.userId), eq(crmTasks.status, 'open'))
      : view === 'overdue'
        ? and(eq(crmTasks.status, 'open'), lt(crmTasks.dueDate, today))
        : view === 'done'
          ? sql`${crmTasks.status} <> 'open'`
          : eq(crmTasks.status, 'open')

  const [tasks, staff] = await Promise.all([loadTasks(where), loadStaff()])

  return (
    <>
      <PageHead title={t('tasks.title')} description={t('tasks.description')} />
      <Flash searchParams={params} />

      <nav className="a-tabs" aria-label={t('tasks.views')}>
        {VIEWS.map((value) => (
          <Link
            key={value}
            className="a-tab"
            aria-current={value === view ? 'page' : undefined}
            href={`${adminHref('/tasks')}${buildQuery(params, { view: value })}`}
          >
            {t(`tasks.view_${value}`)}
          </Link>
        ))}
      </nav>

      <div className="a-card">
        <TaskList tasks={tasks} back="/tasks" />
      </div>

      <div className="a-card">
        <h2>{t('tasks.new')}</h2>
        <p className="a-hint">{t('tasks.new_hint')}</p>
        <NewTaskForm back="/tasks" staff={staff} defaultAssignee={session.userId} linkFields />
      </div>
    </>
  )
}
