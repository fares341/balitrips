/**
 * Axe wiring.
 *
 * One place decides which rule set runs and where the pass/fail line sits, so
 * an individual spec cannot quietly move it. Two things here are load-bearing:
 *
 *  - **The threshold is `serious` and `critical`, and nothing may lower it.**
 *    `moderate` and `minor` findings are printed in full and do not fail the
 *    run, because a suite that fails on `region` noise gets muted within a
 *    week. That is the only concession; a serious finding fails, full stop.
 *  - **Every finding is printed with its rule id, its impact and the actual
 *    element**, not a count. "3 violations" is not actionable at 9pm.
 *
 * ## Why the result types are declared here
 *
 * `axe-core` is a transitive dependency of `@axe-core/playwright`, and pnpm's
 * strict `node_modules` layout means it is not resolvable from the repository
 * root — `import type { Result } from 'axe-core'` does not compile. Adding it
 * as a direct dependency to satisfy a type-only import would touch the
 * lockfile for no runtime gain, so the handful of fields this file actually
 * reads are declared below instead. They are a subset of axe's published
 * result shape and are checked structurally against it at the one cast.
 */

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/* --------------------------------------------------------------------------
   The slice of axe's result shape this suite consumes.
   -------------------------------------------------------------------------- */

export type AxeImpact = 'minor' | 'moderate' | 'serious' | 'critical'

export interface AxeNode {
  /** CSS selectors, one per frame level. */
  target: (string | string[])[]
  html: string
  failureSummary?: string
}

export interface AxeViolation {
  id: string
  impact?: AxeImpact | null
  help: string
  helpUrl: string
  nodes: AxeNode[]
}

interface AxeRunResult {
  url: string
  violations: AxeViolation[]
  passes: unknown[]
  incomplete: unknown[]
}

/* --------------------------------------------------------------------------
   Configuration
   -------------------------------------------------------------------------- */

/**
 * WCAG 2.0/2.1/2.2 level A and AA — the conformance target a commercial
 * travel site is held to — plus Deque's best-practice pack.
 *
 * Best practice is included for its reporting value, not to fail anything:
 * almost every rule in it is scored `moderate` or `minor`, so it lands in the
 * advisory half of the report by construction.
 */
export const AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
] as const

/** Impacts that fail a test. */
const BLOCKING: readonly AxeImpact[] = ['critical', 'serious']

export interface AxeReport {
  url: string
  /** `critical` / `serious`. Non-empty means the page fails. */
  blocking: AxeViolation[]
  /** `moderate` / `minor` / unscored. Reported only. */
  advisory: AxeViolation[]
  /** Rules that ran and found nothing — evidence a rule ran at all. */
  passCount: number
  /** Rules axe could not decide on its own. */
  incompleteCount: number
}

/** Run axe over the whole document and split the findings by impact. */
export async function runAxe(page: Page): Promise<AxeReport> {
  const results = (await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze()) as AxeRunResult

  const blocking: AxeViolation[] = []
  const advisory: AxeViolation[] = []

  for (const violation of results.violations) {
    const impact = violation.impact ?? null
    if (impact !== null && BLOCKING.includes(impact)) blocking.push(violation)
    else advisory.push(violation)
  }

  return {
    url: results.url,
    blocking,
    advisory,
    passCount: results.passes.length,
    incompleteCount: results.incomplete.length,
  }
}

/* --------------------------------------------------------------------------
   Reporting
   -------------------------------------------------------------------------- */

/** Collapse whitespace and clip, so a 4KB `<section>` does not fill the log. */
function snippet(html: string, max = 160): string {
  const flat = html.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function targetOf(node: AxeNode): string {
  return node.target
    .map((part: string | string[]) => (typeof part === 'string' ? part : part.join(' ')))
    .join(' >>> ')
}

/**
 * A finding, rendered for a human.
 *
 * Rule id first because that is what you search the axe docs for; the element
 * next because that is what you open in devtools.
 */
export function formatViolation(violation: AxeViolation): string {
  const lines = [
    `  [${violation.impact ?? 'unscored'}] ${violation.id} — ${violation.help}`,
    `    ${violation.helpUrl}`,
  ]
  for (const node of violation.nodes) {
    lines.push(`    · ${targetOf(node)}`)
    lines.push(`      ${snippet(node.html)}`)
    const why = node.failureSummary?.replace(/\s*\n\s*/g, ' ').trim()
    if (why !== undefined && why !== '') lines.push(`      ${why}`)
  }
  return lines.join('\n')
}

export function formatViolations(violations: readonly AxeViolation[]): string {
  return violations.map(formatViolation).join('\n')
}
