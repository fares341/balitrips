'use client'

import { useEffect, useState } from 'react'

import { useAdminT } from './i18n-provider'

/**
 * First-visit quick tour of the media library (4 short steps). Remembered per
 * browser; "Show the tour again" in the screen guide clears it.
 */

const KEY = 'studio-tour:media:v1'
const STEPS = ['upload', 'name', 'pick', 'delete'] as const

export function MediaTour() {
  const { t } = useAdminT()
  const [step, setStep] = useState<number | null>(null)

  useEffect(() => {
    let seen = true
    try {
      seen = window.localStorage.getItem(KEY) === '1'
    } catch {
      // storage blocked: no tour
    }
    const open = () => setStep(0)
    window.addEventListener('studio-tour:media', open)
    if (!seen) window.setTimeout(open, 0)
    return () => window.removeEventListener('studio-tour:media', open)
  }, [])

  function finish() {
    try {
      window.localStorage.setItem(KEY, '1')
    } catch {
      // ignore
    }
    setStep(null)
  }

  if (step === null) return null
  const id = STEPS[step] ?? 'upload'
  const last = step === STEPS.length - 1

  return (
    <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-h">
      <p className="tour-count">
        {step + 1} / {STEPS.length}
      </p>
      <h3 id="tour-h">{t(`tour.media_${id}_t`)}</h3>
      <p>{t(`tour.media_${id}_d`)}</p>
      <div className="tour-actions">
        <button type="button" className="a-btn ghost small" onClick={finish}>
          {t('tour.skip')}
        </button>
        <button
          type="button"
          className="a-btn primary small"
          onClick={() => (last ? finish() : setStep(step + 1))}
        >
          {last ? t('tour.done') : t('tour.next')}
        </button>
      </div>
    </div>
  )
}
