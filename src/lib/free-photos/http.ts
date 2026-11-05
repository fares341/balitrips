/**
 * Polite HTTP for the free-photo sources: a descriptive User-Agent (the
 * Wikimedia User-Agent policy asks for one with a way to reach us — a
 * generic site URL, never a person's address), one request at a time per
 * host with a minimum gap, and a few retries on 429 / 5xx with backoff
 * (honouring Retry-After). `fetch` is injected so tests never touch the
 * network.
 */

export const USER_AGENT = 'BaliTrips/1.0 (https://balitrips.co)'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** Minimum gap between two requests to the same host (ms). */
export const HOST_GAP_MS: Record<string, number> = {
  'commons.wikimedia.org': 250,
  'upload.wikimedia.org': 250,
  'query.wikidata.org': 1000,
  'api.openverse.org': 1100,
  'api.unsplash.com': 1000,
}
const DEFAULT_GAP_MS = 500

export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface PoliteOptions {
  fetch?: FetchLike
  /** 0 in tests. */
  gapScale?: number
  retries?: number
}

export class PoliteClient {
  private readonly fetchFn: FetchLike
  private readonly last = new Map<string, number>()
  private readonly queue = new Map<string, Promise<void>>()
  private readonly gapScale: number
  private readonly retries: number
  requests = 0

  constructor(options: PoliteOptions = {}) {
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init))
    this.gapScale = options.gapScale ?? 1
    this.retries = options.retries ?? 3
  }

  private async turn(host: string): Promise<void> {
    const prev = this.queue.get(host) ?? Promise.resolve()
    let release!: () => void
    const mine = new Promise<void>((r) => (release = r))
    this.queue.set(
      host,
      prev.then(() => mine),
    )
    await prev
    const gap = (HOST_GAP_MS[host] ?? DEFAULT_GAP_MS) * this.gapScale
    const wait = (this.last.get(host) ?? 0) + gap - Date.now()
    if (wait > 0) await sleep(wait)
    this.last.set(host, Date.now())
    release()
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<Response> {
    const host = new URL(url).host
    let backoff = 1000 * this.gapScale
    for (let attempt = 0; ; attempt += 1) {
      await this.turn(host)
      this.requests += 1
      const res = await this.fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(20_000),
      })
      if (res.ok) return res
      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt >= this.retries) throw new HttpError(res.status, url)
      const after = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 * this.gapScale : backoff)
      backoff *= 2
    }
  }

  async json<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const res = await this.get(url, { Accept: 'application/json', ...headers })
    return (await res.json()) as T
  }

  async bytes(url: string): Promise<Uint8Array> {
    const res = await this.get(url, { Accept: 'image/*' })
    return new Uint8Array(await res.arrayBuffer())
  }
}
