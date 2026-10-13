import { FormError } from './form'

/**
 * Slugs.
 *
 * A slug is a permanent, public, indexed URL — never reuse one across
 * entities and never silently rewrite one after publish, or the search
 * ranking that took months to earn goes to a 404.
 */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      // Decomposing first and dropping the marks turns "Ubud Café" into
      // "ubud-cafe"; without it the ASCII filter below would leave "caf-e".
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
  )
}

/**
 * Validate an admin-supplied slug.
 *
 * Rejects rather than silently repairs: an editor who typed `Ubud Tour`
 * should be told the slug changed, not discover it on the live URL.
 */
export function assertSlug(value: string): string {
  const slug = value.trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new FormError(
      `"${value}" is not a valid slug. Use lowercase letters, digits and single hyphens.`,
      'form.slug_invalid',
      { value },
    )
  }
  return slug
}
