/**
 * Cross-place duplicate guard for free photos: one picture must not end up
 * on two places. Exact duplicates by sha256 of the bytes, near-duplicates
 * (same picture resized / re-encoded) by 64-bit dHash within a few bits.
 * Pure; the hashes come from `@/lib/places-audit/photo-hash` helpers.
 */

import { hammingHex, NEAR_HASH_BITS } from '@/lib/places-audit/detectors'

export interface HashedPhoto {
  /** Who owns it: a place id. */
  placeId: string
  sha: string | null
  dhash: string | null
}

export class PhotoRegistry {
  private bySha = new Map<string, string>()
  private dhashes: { dhash: string; placeId: string }[] = []

  constructor(
    seed: readonly HashedPhoto[] = [],
    private readonly nearBits = NEAR_HASH_BITS,
  ) {
    for (const one of seed) this.add(one)
  }

  /** The other place that already uses this picture, or null. */
  conflict(photo: HashedPhoto): { placeId: string; kind: 'exact' | 'near' } | null {
    if (photo.sha) {
      const owner = this.bySha.get(photo.sha)
      if (owner && owner !== photo.placeId) return { placeId: owner, kind: 'exact' }
    }
    if (photo.dhash) {
      for (const one of this.dhashes) {
        if (one.placeId === photo.placeId) continue
        if (hammingHex(one.dhash, photo.dhash) <= this.nearBits)
          return { placeId: one.placeId, kind: 'near' }
      }
    }
    return null
  }

  add(photo: HashedPhoto): void {
    if (photo.sha && !this.bySha.has(photo.sha)) this.bySha.set(photo.sha, photo.placeId)
    if (photo.dhash) this.dhashes.push({ dhash: photo.dhash, placeId: photo.placeId })
  }
}
