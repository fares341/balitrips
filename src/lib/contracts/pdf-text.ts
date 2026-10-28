/**
 * Plain text out of a PDF, on the server (contract summaries).
 *
 * pdfjs-dist's legacy build runs in Node. Its worker module is imported and
 * handed over as `globalThis.pdfjsWorker`, so pdfjs runs it on the main
 * thread instead of trying to spawn a worker from a file path (which a
 * bundled server cannot resolve). Scanned PDFs have no text layer: the
 * result is '' and the caller says so.
 */

const MAX_PAGES = 60
export const MAX_TEXT_CHARS = 60_000

let workerReady: Promise<void> | null = null

async function ensureWorker(): Promise<void> {
  workerReady ??= (async () => {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
  })()
  return workerReady
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  await ensureWorker()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  })
  const doc = await task.promise
  try {
    const parts: string[] = []
    let length = 0
    const pages = Math.min(doc.numPages, MAX_PAGES)
    for (let number = 1; number <= pages && length < MAX_TEXT_CHARS; number += 1) {
      const page = await doc.getPage(number)
      const content = await page.getTextContent()
      const line = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (line !== '') {
        parts.push(line)
        length += line.length
      }
    }
    return parts.join('\n\n').slice(0, MAX_TEXT_CHARS)
  } finally {
    await doc.destroy()
  }
}
