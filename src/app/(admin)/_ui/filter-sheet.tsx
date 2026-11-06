'use client'

import { useState } from 'react'

/**
 * On phones the extra filters fold into a sheet behind one button (with the
 * number of active filters); on wide screens they are always shown and the
 * button is hidden. Pure CSS decides which, so nothing jumps after hydration.
 */
export function FilterSheet({
  label,
  activeLabel,
  active,
  children,
}: {
  label: string
  activeLabel: string
  active: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="a-fsheet" data-open={open}>
      <button
        type="button"
        className="a-btn ghost a-fsheet-btn"
        aria-expanded={open}
        aria-controls="a-fsheet-body"
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {active > 0 ? <span className="a-qf-n">{activeLabel}</span> : null}
      </button>
      <div className="a-fsheet-body" id="a-fsheet-body">
        {children}
      </div>
    </div>
  )
}
