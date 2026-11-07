/**
 * Packages drag order (Studio list → public /packages). Pure, so the rule is
 * tested: the dragged ids come first in the order given; any package the
 * list did not include (created meanwhile, filtered out) keeps its relative
 * place after them. Unknown and duplicate ids are ignored. Positions start
 * at 1 and have no gaps.
 */
export function sortPositions(
  current: readonly string[],
  submitted: readonly string[],
): { id: string; sortOrder: number }[] {
  const known = new Set(current)
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of submitted) {
    if (!known.has(id) || seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
  }
  for (const id of current) if (!seen.has(id)) ordered.push(id)
  return ordered.map((id, index) => ({ id, sortOrder: index + 1 }))
}
