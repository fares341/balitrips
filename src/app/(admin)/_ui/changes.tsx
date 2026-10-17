import type { AuditLine } from '../_lib/audit-labels'

/** Changed fields or event details, one per line ("Status: published"). */
export function Changes({ lines }: { lines: AuditLine[] }) {
  if (lines.length === 0) return <span className="a-muted">—</span>
  return (
    <ul className="a-changes">
      {lines.slice(0, 12).map((line, index) => (
        <li key={index}>
          {line.field ? <span className="a-muted">{line.field}: </span> : null}
          <span dir="auto">{line.value}</span>
        </li>
      ))}
    </ul>
  )
}
