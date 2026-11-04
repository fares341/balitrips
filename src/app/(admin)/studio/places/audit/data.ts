/**
 * «تدقيق الأماكن» — loads every non-archived map place (VIP and hidden
 * included) and runs the detectors. SELECTs only; the page and its CSV share it.
 */

import 'server-only'

import { inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { categories, mapPlaces, media } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { hashAll, type MediaRef } from '@/lib/places-audit/photo-hash'
import {
  ISSUE_ORDER,
  runAudit,
  type AuditFinding,
  type AuditPlace,
  type IssueKind,
} from '@/lib/places-audit/run'

import type { AuditLang } from './labels'

export interface AuditRow extends AuditFinding {
  name: string
  slug: string
  status: string
  hidden: boolean
  category: string
}

export interface AuditResult {
  scanned: number
  hashed: { files: number; failed: number } | null
  byIssue: { issue: IssueKind; rows: AuditRow[] }[]
}

export async function loadPlacesAudit(lang: AuditLang, withHashes: boolean): Promise<AuditResult> {
  const [rows, cats] = await Promise.all([
    db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        legacyId: mapPlaces.legacyId,
        name: mapPlaces.name,
        status: mapPlaces.status,
        isHidden: mapPlaces.isHidden,
        lat: mapPlaces.lat,
        lon: mapPlaces.lon,
        categoryId: mapPlaces.categoryId,
        categoryText: mapPlaces.category,
        heroImageId: mapPlaces.heroImageId,
        gallery: mapPlaces.galleryImageIds,
      })
      .from(mapPlaces)
      .where(isNull(mapPlaces.deletedAt)),
    db.select({ id: categories.id, key: categories.key, label: categories.label }).from(categories),
  ])

  const catLabel = new Map(cats.map((c) => [c.id, pick(c.label, lang, c.key)]))
  const places: AuditPlace[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    status: r.status,
    name: { ar: r.name?.ar, en: r.name?.en, id: r.name?.id },
    lat: r.lat,
    lon: r.lon,
    category: r.categoryId ?? (r.categoryText?.en ? `text:${r.categoryText.en}` : null),
    sourceId: r.legacyId,
    heroKey: r.heroImageId,
    galleryKeys: (r.gallery ?? []).filter((k): k is string => typeof k === 'string' && k !== ''),
  }))

  let hashes: Map<string, { sha: string; dhash: string }> | undefined
  let hashed: AuditResult['hashed'] = null
  if (withHashes) {
    const ids = [
      ...new Set(
        places.flatMap((p) => [p.heroKey, ...p.galleryKeys]).filter((k): k is string => !!k),
      ),
    ]
    const refs: MediaRef[] = []
    for (let i = 0; i < ids.length; i += 1000) {
      refs.push(
        ...(await db
          .select({ id: media.id, objectKey: media.objectKey, width: media.width })
          .from(media)
          .where(inArray(media.id, ids.slice(i, i + 1000)))),
      )
    }
    const result = await hashAll(refs)
    hashes = result.hashes
    hashed = { files: result.hashes.size, failed: result.failed }
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  const findings = runAudit(places, hashes)
  const grouped = new Map<IssueKind, AuditRow[]>()
  for (const f of findings) {
    const r = byId.get(f.placeId)!
    const list = grouped.get(f.issue) ?? []
    list.push({
      ...f,
      name: pick(r.name, lang, r.slug),
      slug: r.slug,
      status: r.status,
      hidden: r.isHidden,
      category: (r.categoryId && catLabel.get(r.categoryId)) || pick(r.categoryText, lang, ''),
    })
    grouped.set(f.issue, list)
  }

  return {
    scanned: rows.length,
    hashed,
    byIssue: ISSUE_ORDER.map((issue) => ({
      issue,
      rows: (grouped.get(issue) ?? []).sort(
        (a, b) =>
          (a.group ?? '').localeCompare(b.group ?? '', 'en', { numeric: true }) ||
          a.name.localeCompare(b.name),
      ),
    })),
  }
}
