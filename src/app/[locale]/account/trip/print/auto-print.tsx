'use client'

/**
 * "Export PDF": the browser's own print dialog, where "Save as PDF" is one
 * click away (no PDF renderer runs on the request path — see print-button).
 * With `auto`, the dialog opens once after the page has painted.
 */

import { useEffect } from 'react'

import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'

export function AutoPrint({ auto, label }: { auto: boolean; label: string }) {
  useEffect(() => {
    if (!auto) return
    // Let fonts and images settle so the first page is not printed blank.
    const timer = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(timer)
  }, [auto])

  return (
    <Button type="button" variant="orange" size="sm" onClick={() => window.print()}>
      <Icon name="pdf" size={16} color="#fff" /> {label}
    </Button>
  )
}
