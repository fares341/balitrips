/**
 * Duplicate images on a page (owner, Oct 2026).
 *
 * Merged activities (migration 0028) gathered the photos of every source, so
 * the same picture can appear twice: the same media row, or the same file
 * URL under another row, or another size of the same image. The
 * page shows each picture once; Studio's image report lists the rest.
 */

/**
 * The picture an image URL points at: the path without host or query, and a
 * derivative (`media/<id>/<width>.<format>`) reduced to its media id, so two
 * sizes of one image count as one.
 */
export function imageFileKey(url: string): string {
  const path = (url.split(/[?#]/)[0] ?? url).replace(/^https?:\/\/[^/]+/i, '').toLowerCase()
  const derivative = /\/media\/([0-9a-f-]{36})\/\d+\.[a-z0-9]+$/.exec(path)
  return derivative ? `media:${derivative[1]}` : path
}

/** Keep the first of each picture, by id and by file. Order is preserved. */
export function dedupeImages<T extends { id: string; url: string }>(images: readonly T[]): T[] {
  const ids = new Set<string>()
  const files = new Set<string>()
  const out: T[] = []
  for (const image of images) {
    const file = imageFileKey(image.url)
    if (ids.has(image.id) || files.has(file)) continue
    ids.add(image.id)
    files.add(file)
    out.push(image)
  }
  return out
}
