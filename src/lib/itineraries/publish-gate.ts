/**
 * PDF status and publish gating (corrected spec §3.1 / §5 / §9) — pure.
 *
 * An itinerary may only be published when a ready file exists for Arabic at
 * least: an uploaded PDF (which wins over the generated one), OR a generated
 * one. The generated PDF is rendered by the worker right after publish from
 * the day plan, so «generated» counts as ready when a rendered Arabic file
 * already exists, or when the day plan is complete enough to render one
 * (every day has an activity or is an explicit free day).
 */

export type PdfStatus =
  /** An uploaded PDF is current for this locale (vN). */
  | { kind: 'uploaded'; fileVersion: number }
  /** A generated PDF exists, or will be rendered from the complete day plan. */
  | { kind: 'generated'; rendered: boolean }
  /** Nothing to deliver — shown red in Studio; blocks publishing. */
  | { kind: 'none' }

export interface PdfFacts {
  /** Current uploaded file version for the locale, or null. */
  uploadedVersion: number | null
  /** A generated file exists for the locale (any version). */
  generatedExists: boolean
  /** Days authored. */
  dayCount: number
  /** Days with neither an activity nor «free day». */
  unresolvedDays: number
}

export function pdfStatus(facts: PdfFacts): PdfStatus {
  if (facts.uploadedVersion !== null && facts.uploadedVersion > 0) {
    return { kind: 'uploaded', fileVersion: facts.uploadedVersion }
  }
  if (facts.generatedExists) return { kind: 'generated', rendered: true }
  if (facts.dayCount > 0 && facts.unresolvedDays === 0) {
    return { kind: 'generated', rendered: false }
  }
  return { kind: 'none' }
}

export type PublishBlock = 'no_days' | 'unresolved_days' | 'no_pdf'

/**
 * Why publishing is refused, or null when it may go ahead. The day checks
 * come first (they were the rule before); the PDF rule is the phase-1 gate,
 * applied to the Arabic file.
 */
export function publishBlock(arabic: PdfFacts): PublishBlock | null {
  if (arabic.dayCount === 0) return 'no_days'
  if (arabic.unresolvedDays > 0) return 'unresolved_days'
  if (pdfStatus(arabic).kind === 'none') return 'no_pdf'
  return null
}

/** «اسم الملف عند العميل»: a safe file name ending in .pdf, or null. */
export function cleanDownloadFilename(raw: string | null | undefined): string | null {
  if (!raw) return null
  const base = raw
    .normalize('NFC')
    .replace(/\.pdf$/i, '')
    // No path separators, control characters or characters Windows refuses.
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
  return base ? `${base}.pdf` : null
}

/** First bytes are `%PDF-`. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  )
}

const PDF_MIME = new Set(['application/pdf', 'application/x-pdf'])

/** The browser-declared type is a PDF one (checked together with the magic bytes). */
export function isPdfMime(type: string | null | undefined): boolean {
  return PDF_MIME.has((type ?? '').toLowerCase().trim())
}
