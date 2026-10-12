/**
 * Gotenberg client.
 *
 * PDFs are rendered by a Chromium sidecar, not in-process. `@react-pdf/renderer`
 * and every other pure-JS engine has had broken BiDi and Arabic shaping for
 * years — text comes out with disconnected letterforms and reversed runs,
 * which is worse than a failure because it looks like it worked. Chromium
 * lays out mixed Arabic/English correctly, so the render is delegated.
 *
 * WHERE THIS MAY RUN
 *
 * The worker. Only the worker. A render peaks around 1.5 GiB inside the
 * sidecar and the droplet has 4 GiB shared with Postgres and Next; the OOM
 * killer picks the largest resident process, which is Postgres, so a render
 * on the request path turns a PDF download into a database outage. The
 * `pdf.itinerary` queue is capped at one concurrent job for the same reason
 * — see `src/worker/index.ts`.
 *
 * FONTS
 *
 * The container must have **Noto Naskh Arabic** installed (Debian:
 * `fonts-noto-core`, or install the family explicitly). Without an Arabic
 * face Chromium falls back to tofu boxes or, worse, to a Latin face that
 * renders the code points unshaped. `gotenberg/gotenberg:8` ships the Noto
 * core set, so a stock image is fine — but a slimmed or custom image is not,
 * and the failure is silent until an Arabic customer opens their itinerary.
 *
 * NETWORK ISOLATION
 *
 * docker-compose starts Gotenberg with
 * `--chromium-allow-list=file:///tmp/.*`, so the renderer can load nothing
 * but the files posted with the request. That is deliberate SSRF protection:
 * PDF HTML is assembled from admin-authored content, and a `<img src>` to an
 * internal address would otherwise let the renderer read the droplet's
 * metadata endpoint. It also means **templates must be entirely
 * self-contained** — no remote fonts, stylesheets or images.
 */

const DEFAULT_URL = 'http://localhost:3001'
const CONVERT_PATH = '/forms/chromium/convert/html'

export class GotenbergError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** A 502 from a restarting sidecar deserves a retry; a 400 does not. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'GotenbergError'
  }
}

export interface PdfMetadata {
  Title?: string
  Author?: string
  Subject?: string
  Creator?: string
  Keywords?: string
}

export interface RenderPdfOptions {
  /** The complete document. Must reference no external resources. */
  html: string
  /**
   * Extra files posted alongside, addressable from the HTML by bare
   * filename. Only needed if a template ever embeds a font file.
   */
  files?: readonly { name: string; content: Uint8Array | string; contentType?: string }[]
  landscape?: boolean
  /** Inches. Gotenberg 8 reads unitless numbers as inches. */
  margins?: { top: number; bottom: number; left: number; right: number }
  metadata?: PdfMetadata
  timeoutMs?: number
}

/** A4 in inches, with a margin that leaves room for a bound or printed copy. */
const A4 = { width: 8.27, height: 11.7 }
const DEFAULT_MARGINS = { top: 0.6, bottom: 0.6, left: 0.55, right: 0.55 }

export function gotenbergUrl(): string {
  const raw = process.env.GOTENBERG_URL?.trim()
  return (raw === undefined || raw === '' ? DEFAULT_URL : raw).replace(/\/+$/, '')
}

export async function renderPdf(options: RenderPdfOptions): Promise<Uint8Array> {
  const form = new FormData()

  // The field name MUST be `files` and the entry point MUST be called
  // index.html — Gotenberg navigates to that name specifically.
  form.append('files', new Blob([options.html], { type: 'text/html' }), 'index.html')

  for (const file of options.files ?? []) {
    const bytes =
      typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : file.content
    form.append(
      'files',
      new Blob([new Uint8Array(bytes)], { type: file.contentType ?? 'application/octet-stream' }),
      file.name,
    )
  }

  const margins = options.margins ?? DEFAULT_MARGINS
  form.append('paperWidth', String(options.landscape === true ? A4.height : A4.width))
  form.append('paperHeight', String(options.landscape === true ? A4.width : A4.height))
  form.append('marginTop', String(margins.top))
  form.append('marginBottom', String(margins.bottom))
  form.append('marginLeft', String(margins.left))
  form.append('marginRight', String(margins.right))
  // Background colours and rules are part of the design, not decoration
  // Chromium may drop for print.
  form.append('printBackground', 'true')
  // Render the screen stylesheet. There is only one stylesheet in these
  // templates, and it is written for paper.
  form.append('emulatedMediaType', 'print')

  if (options.metadata !== undefined) {
    form.append('metadata', JSON.stringify(options.metadata))
  }

  const url = `${gotenbergUrl()}${CONVERT_PATH}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    })
  } catch (error) {
    throw new GotenbergError(`Could not reach Gotenberg at ${url}: ${String(error)}`, null, true)
  }

  if (!response.ok) {
    // Gotenberg puts a genuinely useful message in the body — a missing
    // form field, a Chromium navigation error, an allow-list rejection.
    const detail = await response.text().catch(() => '')
    throw new GotenbergError(
      `Gotenberg returned ${response.status}: ${detail.slice(0, 500)}`,
      response.status,
      response.status >= 500 || response.status === 429,
    )
  }

  const bytes = new Uint8Array(await response.arrayBuffer())

  // A zero-byte or non-PDF body means the sidecar answered but produced
  // nothing usable; storing it would put a broken file behind a paywall.
  if (bytes.byteLength === 0 || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    throw new GotenbergError(
      `Gotenberg returned ${bytes.byteLength} bytes that are not a PDF`,
      response.status,
      true,
    )
  }

  return bytes
}

/** Liveness of the sidecar, for the worker's startup log. */
export async function gotenbergHealthy(timeoutMs = 3_000): Promise<boolean> {
  try {
    const response = await fetch(`${gotenbergUrl()}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
  } catch {
    return false
  }
}
