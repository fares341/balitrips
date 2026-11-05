'use client'

/**
 * «Match with Google»: starts the background job and shows its progress,
 * polling every 2 s while it runs. The job lives in the server process
 * (`@/lib/google-places/match-job`); each place's result is saved as it
 * goes, so leaving this page does not stop or lose anything.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'

import type { MatchProgress } from '@/lib/google-places/match-job'

import { useAdminT } from '../../../_ui/i18n-provider'
import { matchStatus, startMatch, stopMatch } from './actions'

export function MatchPanel({ initial, enabled }: { initial: MatchProgress; enabled: boolean }) {
  const { t } = useAdminT()
  const router = useRouter()
  const [progress, setProgress] = useState(initial)
  const [pending, startTransition] = useTransition()

  const poll = useCallback(async () => {
    const next = await matchStatus()
    setProgress((prev) => {
      if (prev.running && !next.running) router.refresh()
      return next
    })
  }, [router])

  useEffect(() => {
    if (!progress.running) return
    const timer = setInterval(() => void poll(), 2000)
    return () => clearInterval(timer)
  }, [progress.running, poll])

  const run = (recheck: boolean) =>
    startTransition(async () => {
      setProgress(await startMatch(recheck))
    })
  const stop = () =>
    startTransition(async () => {
      setProgress(await stopMatch())
    })

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="a-card" data-testid="gp-match-panel">
      <h2 style={{ marginTop: 0 }}>{t('gp.job_title')}</h2>
      <p className="a-muted">{t('gp.job_hint')}</p>
      <div className="a-actions">
        <button
          className="a-btn"
          type="button"
          disabled={!enabled || progress.running || pending}
          onClick={() => run(false)}
        >
          {t('gp.start')}
        </button>
        <button
          className="a-btn ghost"
          type="button"
          disabled={!enabled || progress.running || pending}
          onClick={() => run(true)}
        >
          {t('gp.recheck')}
        </button>
        {progress.running ? (
          <button className="a-btn ghost" type="button" disabled={pending} onClick={stop}>
            {t('gp.stop')}
          </button>
        ) : null}
      </div>
      <div aria-live="polite" style={{ marginTop: 12 }}>
        {progress.running ? (
          <>
            <progress max={100} value={pct} style={{ width: '100%' }} />
            <p>{t('gp.running', { done: progress.done, total: progress.total })}</p>
          </>
        ) : progress.startedAt ? (
          <p>
            {t('gp.result', {
              done: progress.done,
              total: progress.total,
              auto: progress.auto,
              review: progress.review,
              none: progress.none,
              errors: progress.errors,
            })}{' '}
            {progress.stopped
              ? t(`gp.stopped_${progress.stopped}`, { error: progress.lastError ?? '' })
              : null}
          </p>
        ) : (
          <p className="a-muted">{t('gp.never_run')}</p>
        )}
      </div>
    </div>
  )
}
