import type { ReactNode } from 'react'

/**
 * Settings only the technical team should touch, folded away under
 * "Advanced (for your technical team)".
 *
 * Shown to administrators only. For anyone else the current values travel as
 * hidden inputs (`keep`), so saving the surrounding form never clears them.
 */
export function Advanced({
  show,
  title,
  hint,
  keep = [],
  children,
}: {
  show: boolean
  title: string
  hint?: string
  keep?: ReadonlyArray<readonly [name: string, value: string]>
  children: ReactNode
}) {
  if (!show) {
    return (
      <>
        {keep.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </>
    )
  }
  return (
    <details className="a-advanced">
      <summary>{title}</summary>
      <div className="a-advanced-body">
        {hint ? <p className="a-hint">{hint}</p> : null}
        {children}
      </div>
    </details>
  )
}
