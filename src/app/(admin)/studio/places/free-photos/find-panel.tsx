'use client'

/**
 * «Find free photos»: starts the background job and shows its progress,
 * polling every 2 s while it runs. The job lives in the server process
 * (`@/lib/free-photos/job`); each place's result is saved as it
 * goes, so leaving this page does not stop or lose anything.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'

import type { FreePhotoProgress } from '@/lib/free-photos/job'

import { useAdminT } from '../../../_ui/i18n-provider'
import { findStatus, startFind, stopFind } from './actions'

export function FindPanel({ initial }: { initial: FreePhotoProgress }) {
  const { t } = useAdminT()
  const router = useRouter()
  const [progress, setProgress] = useState(initial)
  const [pending, startTransition] = useTransition()

  const poll = useCallback(async () => {
    const next = await findStatus()
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
      setProgress(await startFind(recheck))
    })
  const stop = () =>
    startTransition(async () => {
      setProgress(await stopFind())
    })

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="a-card" data-testid="fp-find-panel">
      <h2 style={{ marginTop: 0 }}>{t('fp.job_title')}</h2>
      <p className="a-muted">{t('fp.job_hint')}</p>
      <div className="a-actions">
        <button
          className="a-btn"
          type="button"
          disabled={progress.running || pending}
          onClick={() => run(false)}
        >
          {t('fp.start')}
        </button>
        <button
          className="a-btn ghost"
          type="button"
          disabled={progress.running || pending}
          onClick={() => run(true)}
        >
          {t('fp.recheck')}
        </button>
        {progress.running ? (
          <button className="a-btn ghost" type="button" disabled={pending} onClick={stop}>
            {t('fp.stop')}
          </button>
        ) : null}
      </div>
      <div aria-live="polite" style={{ marginTop: 12 }}>
        {progress.running ? (
          <>
            <progress max={100} value={pct} style={{ width: '100%' }} />
            <p>{t('fp.running', { done: progress.done, total: progress.total })}</p>
          </>
        ) : progress.startedAt ? (
          <p>
            {t('fp.result', {
              done: progress.done,
              total: progress.total,
              good: progress.withGood,
              auto: progress.autoApplied,
              none: progress.none,
              errors: progress.errors,
            })}{' '}
            {progress.stopped
              ? t(`fp.stopped_${progress.stopped}`, { error: progress.lastError ?? '' })
              : null}
          </p>
        ) : (
          <p className="a-muted">{t('fp.never_run')}</p>
        )}
      </div>
    </div>
  )
}
