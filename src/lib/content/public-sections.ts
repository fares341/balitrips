/**
 * Sections that hide themselves while empty (owner, Oct 2026).
 *
 * With no published package the site shows no «Packages» link (header,
 * drawer, footer, home cards) and /packages explains what to do instead of
 * «nothing matches these filters». Same for the blog. As soon as one item is
 * published the links come back on their own — no switch to flip.
 */

export interface PublicSections {
  packages: boolean
  blog: boolean
}

export const ALL_SECTIONS: PublicSections = { packages: true, blog: true }

/** Paths whose section is empty, for the navigation to leave out. */
export function hiddenHrefs(sections: PublicSections): string[] {
  const hidden: string[] = []
  if (!sections.packages) hidden.push('/packages')
  if (!sections.blog) hidden.push('/blog')
  return hidden
}

export function withoutHidden<T extends { href: string }>(
  routes: readonly T[],
  hidden: readonly string[],
): T[] {
  return routes.filter((route) => !hidden.includes(route.href))
}
