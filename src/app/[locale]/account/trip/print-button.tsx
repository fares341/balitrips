'use client'

/**
 * Export schedule.
 *
 * One of the handoff's nine dead buttons. There is no PDF renderer on the
 * request path — Chromium peaks around 1.5 GiB and would not coexist with
 * Postgres on the 4 GiB box, which is why itinerary PDFs are generated at
 * publish time instead — so this hands the job to the browser's own print
 * dialog, where "Save as PDF" is one click away.
 *
 * A real, working export beats a button that pretends.
 */

import { useTranslations } from 'next-intl'

import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'

export function PrintTripButton() {
  const t = useTranslations()

  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => window.print()}>
      <Icon name="pdf" size={16} />
      {t('acct_trip_export')}
    </Button>
  )
}
