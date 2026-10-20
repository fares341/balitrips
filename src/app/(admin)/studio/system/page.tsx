import { desc, eq, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { errorEvents, integrationLogs, supplierIntegrations, webhookEvents } from '@/db/schema'
import { integrationErrorCounts } from '@/lib/integrations/service'
import {
  backupStatus,
  BACKUP_STALE_HOURS,
  migrationStatus,
  overallState,
  runHealthChecks,
  type CheckState,
} from '@/lib/monitoring/health'
import { problemJobs, queueOverview } from '@/lib/monitoring/jobs'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Advanced } from '../../_ui/advanced'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { jobAction, resolveAllErrors, resolveError } from './actions'

export const dynamic = 'force-dynamic'

const TONE: Record<CheckState, 'good' | 'warn' | 'bad'> = { ok: 'good', warn: 'warn', down: 'bad' }

/** Each part runs on its own: one broken source never blanks the whole page. */
async function safely<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (error) {
    console.error('[system] a health section failed', error)
    return null
  }
}

/** Studio → System health (Phase 6). Plain status first; technical detail folded away. */
export default async function SystemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('system.read')
  const { t } = await getAdminI18n()
  const params = await searchParams

  const [checks, backup, errors, queues, jobs, webhooks, integrationLog, integrations, migrations] =
    await Promise.all([
      runHealthChecks(),
      safely(() => backupStatus()),
      safely(() =>
        db
          .select()
          .from(errorEvents)
          .orderBy(sql`${errorEvents.resolvedAt} is not null`, desc(errorEvents.lastSeenAt))
          .limit(50),
      ),
      safely(() => queueOverview()),
      safely(() => problemJobs(30)),
      safely(() =>
        db
          .select({
            id: webhookEvents.id,
            provider: webhookEvents.provider,
            eventType: webhookEvents.eventType,
            processedAt: webhookEvents.processedAt,
            createdAt: webhookEvents.createdAt,
          })
          .from(webhookEvents)
          .orderBy(desc(webhookEvents.createdAt))
          .limit(40),
      ),
      safely(() =>
        db
          .select({
            id: integrationLogs.id,
            integrationId: integrationLogs.integrationId,
            name: supplierIntegrations.name,
            operation: integrationLogs.operation,
            status: integrationLogs.status,
            createdAt: integrationLogs.createdAt,
          })
          .from(integrationLogs)
          .leftJoin(
            supplierIntegrations,
            eq(supplierIntegrations.id, integrationLogs.integrationId),
          )
          .orderBy(desc(integrationLogs.createdAt))
          .limit(30),
      ),
      safely(() => integrationErrorCounts()),
      safely(() => migrationStatus()),
    ])

  const state = overallState(checks)
  const openErrors = (errors ?? []).filter((row) => row.resolvedAt === null)
  const deadCount = jobs?.dead.length ?? 0

  return (
    <>
      <PageHead title={t('sys.title')} description={t('sys.description')} />
      <Flash searchParams={params} />

      <div
        className={`a-flash ${state === 'ok' ? 'ok' : state === 'warn' ? 'warn' : 'err'}`}
        role="status"
      >
        <div>
          <strong>{t(`sys.overall_${state}`)}</strong>
        </div>
      </div>

      <div className="a-grid">
        {checks.map((check) => (
          <div className="a-stat" key={check.name}>
            <span>{t(`sys.check_${check.name}`)}</span>
            <b>
              <Pill tone={TONE[check.state]}>{t(`sys.state_${check.state}`)}</Pill>
            </b>
          </div>
        ))}
        <div className="a-stat">
          <span>{t('sys.open_errors')}</span>
          <b>{openErrors.length}</b>
        </div>
        <div className="a-stat">
          <span>{t('sys.dead_letters')}</span>
          <b>{deadCount}</b>
        </div>
        <div className="a-stat">
          <span>{t('sys.supplier_errors')}</span>
          <b>{integrations ? integrations.failing : '—'}</b>
        </div>
      </div>
      <Advanced show title={t('sys.technical')}>
        <Table>
          <thead>
            <tr>
              <th>{t('sys.check')}</th>
              <th>{t('sys.result')}</th>
              <th>{t('sys.time')}</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr key={check.name}>
                <td className="a-mono">{check.name}</td>
                <td className="a-mono" dir="ltr">
                  {check.detail}
                </td>
                <td dir="ltr">{check.ms} ms</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="a-hint">{t('sys.deep_endpoint')}</p>
      </Advanced>

      <div className="a-card" id="backup">
        <h2>{t('sys.backup_title')}</h2>
        {backup === null ? (
          <Empty>{t('sys.unavailable')}</Empty>
        ) : backup.lastOkAt === null ? (
          <p>
            <Pill tone="warn">{t('sys.backup_never')}</Pill>
          </p>
        ) : (
          <p>
            <Pill tone={backup.stale ? 'bad' : 'good'}>
              {backup.stale ? t('sys.backup_late') : t('sys.backup_ok')}
            </Pill>{' '}
            {t('sys.backup_last')} <When value={backup.lastOkAt} />
          </p>
        )}
        <p className="a-hint">{t('sys.backup_hint', { hours: BACKUP_STALE_HOURS })}</p>
      </div>

      <div className="a-card" id="errors">
        <div className="a-card-head">
          <h2>{t('sys.errors_title')}</h2>
          {openErrors.length > 0 ? (
            <form action={resolveAllErrors}>
              <button className="a-btn ghost small" type="submit">
                {t('sys.resolve_all')}
              </button>
            </form>
          ) : null}
        </div>
        <p className="a-hint">{t('sys.errors_hint')}</p>
        {errors === null ? (
          <Empty>{t('sys.unavailable')}</Empty>
        ) : errors.length === 0 ? (
          <Empty>{t('sys.errors_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('sys.last_seen')}</th>
                <th>{t('sys.where')}</th>
                <th>{t('sys.times')}</th>
                <th>{t('sys.message')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {errors.map((row) => (
                <tr key={row.id}>
                  <td>
                    <When value={row.lastSeenAt} />
                  </td>
                  <td>
                    {t(`sys.source_${row.source}`)}
                    {row.path ? (
                      <div className="a-hint a-mono" dir="ltr">
                        {row.path}
                      </div>
                    ) : null}
                  </td>
                  <td>{row.count}</td>
                  <td>
                    <div
                      className="a-mono"
                      dir="ltr"
                      style={{ maxWidth: 520, overflowWrap: 'anywhere' }}
                    >
                      {row.message.slice(0, 300)}
                    </div>
                    {row.stack ? (
                      <details>
                        <summary className="a-hint">{t('sys.stack')}</summary>
                        <pre
                          className="a-mono"
                          dir="ltr"
                          style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}
                        >
                          {row.stack.slice(0, 3000)}
                        </pre>
                      </details>
                    ) : null}
                  </td>
                  <td>
                    {row.resolvedAt === null ? (
                      <form action={resolveError}>
                        <input type="hidden" name="id" value={row.id} />
                        <button className="a-btn ghost small" type="submit">
                          {t('sys.resolve')}
                        </button>
                      </form>
                    ) : (
                      <Pill tone="good">{t('sys.resolved')}</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card" id="jobs">
        <h2>{t('sys.jobs_title')}</h2>
        <p className="a-hint">{t('sys.jobs_hint')}</p>
        {queues === null ? (
          <Empty>{t('sys.unavailable')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('sys.queue')}</th>
                <th>{t('sys.waiting')}</th>
                <th>{t('sys.running')}</th>
                <th>{t('sys.failed')}</th>
                <th>{t('sys.later')}</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue) => (
                <tr key={queue.name}>
                  <td className="a-mono" dir="ltr">
                    {queue.name}
                    {queue.isDeadLetter ? (
                      <div>
                        <Pill tone="warn">{t('sys.dead_letter_queue')}</Pill>
                      </div>
                    ) : null}
                  </td>
                  <td>{queue.ready}</td>
                  <td>{queue.active}</td>
                  <td>{queue.failed}</td>
                  <td>{queue.deferred}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {jobs === null ? null : (
          <>
            <h3>{t('sys.dead_title')}</h3>
            {jobs.dead.length === 0 ? (
              <Empty>{t('sys.dead_empty')}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>{t('sys.when')}</th>
                    <th>{t('sys.queue')}</th>
                    <th>{t('sys.message')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {jobs.dead.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <When value={job.createdOn} />
                      </td>
                      <td className="a-mono" dir="ltr">
                        {job.sourceName ?? job.name}
                      </td>
                      <td className="a-mono" dir="ltr">
                        {(job.error ?? '—').slice(0, 200)}
                      </td>
                      <td>
                        <div className="a-actions">
                          <form action={jobAction}>
                            <input type="hidden" name="queue" value={job.name} />
                            <input type="hidden" name="id" value={job.id} />
                            <input type="hidden" name="kind" value="retry_dead" />
                            <button className="a-btn small" type="submit">
                              {t('sys.run_again')}
                            </button>
                          </form>
                          <form action={jobAction}>
                            <input type="hidden" name="queue" value={job.name} />
                            <input type="hidden" name="id" value={job.id} />
                            <input type="hidden" name="kind" value="delete_dead" />
                            <button className="a-btn danger small" type="submit">
                              {t('sys.delete')}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {jobs.failed.length > 0 ? (
              <>
                <h3>{t('sys.failed_title')}</h3>
                <Table>
                  <thead>
                    <tr>
                      <th>{t('sys.when')}</th>
                      <th>{t('sys.queue')}</th>
                      <th>{t('sys.message')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.failed.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <When value={job.completedOn ?? job.createdOn} />
                        </td>
                        <td className="a-mono" dir="ltr">
                          {job.name}
                        </td>
                        <td className="a-mono" dir="ltr">
                          {(job.error ?? '—').slice(0, 200)}
                        </td>
                        <td>
                          <form action={jobAction}>
                            <input type="hidden" name="queue" value={job.name} />
                            <input type="hidden" name="id" value={job.id} />
                            <input type="hidden" name="kind" value="retry_failed" />
                            <button className="a-btn small" type="submit">
                              {t('sys.run_again')}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            ) : null}
          </>
        )}
      </div>

      <div className="a-card" id="webhooks">
        <h2>{t('sys.webhooks_title')}</h2>
        <p className="a-hint">{t('sys.webhooks_hint')}</p>
        {webhooks === null ? (
          <Empty>{t('sys.unavailable')}</Empty>
        ) : webhooks.length === 0 ? (
          <Empty>{t('sys.webhooks_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('sys.when')}</th>
                <th>{t('sys.from')}</th>
                <th>{t('sys.event')}</th>
                <th>{t('sys.handled')}</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((row) => (
                <tr key={row.id}>
                  <td>
                    <When value={row.createdAt} />
                  </td>
                  <td className="a-mono" dir="ltr">
                    {row.provider}
                  </td>
                  <td className="a-mono" dir="ltr">
                    {row.eventType ?? '—'}
                  </td>
                  <td>
                    {row.processedAt ? (
                      <Pill tone="good">{t('sys.yes')}</Pill>
                    ) : (
                      <Pill tone="warn">{t('sys.not_yet')}</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card" id="integrations">
        <h2>{t('sys.integrations_title')}</h2>
        {integrations ? (
          <p>
            {t('sys.integrations_summary', {
              total: integrations.connections,
              failing: integrations.failing,
              errors: integrations.errorsLast24h,
            })}{' '}
            <Link href={adminHref('/integrations')}>{t('nav.integrations')}</Link>
          </p>
        ) : null}
        {integrationLog === null || integrationLog.length === 0 ? (
          <Empty>{t('sys.integrations_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('sys.when')}</th>
                <th>{t('sys.connection')}</th>
                <th>{t('sys.event')}</th>
                <th>{t('sys.result')}</th>
              </tr>
            </thead>
            <tbody>
              {integrationLog.map((row) => (
                <tr key={row.id}>
                  <td>
                    <When value={row.createdAt} />
                  </td>
                  <td>
                    {row.integrationId ? (
                      <Link href={adminHref(`/integrations/${row.integrationId}`)}>
                        {row.name ?? '—'}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="a-mono" dir="ltr">
                    {row.operation}
                  </td>
                  <td>
                    <Pill
                      tone={
                        row.status === 'ok' ? 'good' : row.status === 'error' ? 'bad' : 'neutral'
                      }
                    >
                      {t(`int.log_${row.status}`)}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card" id="migrations">
        <h2>{t('sys.migrations_title')}</h2>
        {migrations === null ? (
          <Empty>{t('sys.unavailable')}</Empty>
        ) : (
          <>
            <p>
              {migrations.rows.every((row) => row.applied) ? (
                <Pill tone="good">{t('sys.migrations_ok')}</Pill>
              ) : (
                <Pill tone="bad">{t('sys.migrations_pending')}</Pill>
              )}{' '}
              {t('sys.migrations_count', { count: migrations.appliedCount })}
            </p>
            <Advanced show title={t('sys.technical')}>
              <Table>
                <thead>
                  <tr>
                    <th>{t('sys.migration')}</th>
                    <th>{t('sys.applied')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...migrations.rows].reverse().map((row) => (
                    <tr key={row.tag}>
                      <td className="a-mono" dir="ltr">
                        {row.tag}
                      </td>
                      <td>
                        <Pill tone={row.applied ? 'good' : 'bad'}>
                          {row.applied ? t('sys.yes') : t('sys.no')}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Advanced>
          </>
        )}
      </div>
    </>
  )
}
