import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  attributionFor,
  groupImages,
  importMediaId,
  parseDescriptions,
  parseManifest,
  planPlace,
  splitCredit,
  uniquePhotoIds,
  type ManifestImage,
} from './plan'

const fx = (f: string) => readFileSync(join(__dirname, '__fixtures__', f), 'utf8')

describe('CSV parsing', () => {
  it('reads quoted commas, doubled quotes, newlines and Arabic', () => {
    const { images, problems } = parseManifest(fx('manifest.csv'))
    expect(problems).toEqual([])
    expect(images).toHaveLength(2)
    expect(images[0]!.altEn).toBe('Coast at Waterblow, Bali')
    expect(images[0]!.altAr).toBe('ساحل ووتربلو، بالي')
    const d = parseDescriptions(fx('descriptions.csv'))
    expect(d.problems).toEqual([])
    expect(d.rows[0]!.short).toEqual({ ar: 'ساحل، صخور', en: 'Rocks, "blow" waves' })
    expect(d.rows[0]!.long.en).toBe('Long, text\non two lines')
  })
  it('rejects unsafe file names and missing columns', () => {
    expect(parseManifest('slug,file,position\na,../x.webp,1').problems).toHaveLength(1)
    expect(parseManifest('slug,file\na,a.webp').problems[0]!.message).toMatch(/position/)
  })
  it('needs exactly one cover per slug', () => {
    const { images } = parseManifest('slug,file,position\na,a-1.webp,2\na,a-2.webp,3\nb,b-1.webp,1')
    const g = groupImages(images)
    expect(g.problems).toHaveLength(1)
    expect([...g.bySlug.keys()]).toEqual(['b'])
  })
})

describe('attribution', () => {
  it('splits author and licence on the last parenthesis', () => {
    expect(splitCredit('BxHxTxCx (using album) (CC BY-SA 2.0)')).toEqual({
      author: 'BxHxTxCx (using album)',
      license: 'CC BY-SA 2.0',
    })
    const a = attributionFor({
      credit: 'Triy (CC BY 4.0)',
      sourceUrl: 'https://upload.wikimedia.org/a.jpg',
    })
    expect(a.source).toBe('commons')
    expect(a.credit).toContain('Triy')
  })
})

const img = (slug: string, file: string, position: number): ManifestImage => ({
  slug,
  file,
  position,
  altEn: '',
  altAr: '',
  sourceUrl: null,
  credit: '',
  line: 2,
})
const place = (heroId: string | null, galleryIds: string[] = []) => ({
  id: 'p',
  slug: 's',
  heroId,
  galleryIds,
  description: { en: 'kept' },
  detailedDescription: null,
})
const opts = { replaceUnique: false, overwriteDescriptions: false }
const images = [img('s', 's-1.webp', 1), img('s', 's-2.webp', 2)]

describe('skip rule', () => {
  it('counts only live, non-shared, non-ours photos', () => {
    const ctx = { live: new Set(['a', 'b', 'c']), shared: new Set(['b']), ours: new Set(['c']) }
    expect(uniquePhotoIds(place('a', ['b', 'c', 'dead']), ctx)).toEqual(['a'])
  })
})

describe('planPlace', () => {
  it('replaces shared placeholders', () => {
    const p = planPlace(
      place('ph'),
      images,
      undefined,
      { live: new Set(['ph']), shared: new Set(['ph']) },
      opts,
    )
    expect(p.photos).toEqual({
      kind: 'assign',
      heroId: importMediaId('s', 's-1.webp'),
      galleryIds: [importMediaId('s', 's-2.webp')],
      replacedUnique: 0,
    })
  })
  it('keeps a unique photo unless --replace-unique', () => {
    const ctx = { live: new Set(['u']), shared: new Set<string>() }
    expect(planPlace(place('u'), images, undefined, ctx, opts).photos.kind).toBe('skip-unique')
    expect(
      planPlace(place('u'), images, undefined, ctx, { ...opts, replaceUnique: true }).photos.kind,
    ).toBe('assign')
  })
  it('is idempotent once imported', () => {
    const ids = images.map((i) => importMediaId(i.slug, i.file))
    const p = planPlace(
      place(ids[0]!, [ids[1]!]),
      images,
      undefined,
      { live: new Set(ids), shared: new Set() },
      opts,
    )
    expect(p.photos.kind).toBe('already')
  })
  it('fills only empty locales unless overwriting', () => {
    const d = { slug: 's', short: { en: 'new', ar: 'جديد' }, long: { id: 'panjang' } }
    const p = planPlace(place(null), [], d, { live: new Set(), shared: new Set() }, opts)
    expect(p.next.description).toEqual({ en: 'kept', ar: 'جديد' })
    expect(p.next.detailedDescription).toEqual({ id: 'panjang' })
    const o = planPlace(
      place(null),
      [],
      d,
      { live: new Set(), shared: new Set() },
      { ...opts, overwriteDescriptions: true },
    )
    expect(o.next.description).toEqual({ en: 'new', ar: 'جديد' })
  })
})
