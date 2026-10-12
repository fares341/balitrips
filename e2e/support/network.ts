import type { Page, Response } from '@playwright/test'

/**
 * Records the body of every response the page receives.
 *
 * The paywall test cannot look only at `page.content()`. A React Server
 * Component payload arrives as a flight stream appended to the document, a
 * client navigation fetches `?_rsc=…`, and an API route answers JSON — a
 * secret can be in any of those and in none of the rendered DOM. The
 * prototype's leak was precisely of that shape: the data was in the payload
 * and hidden with CSS.
 *
 * Bodies are captured lazily and failures are swallowed: a redirect, a 204 or
 * a response the browser discarded has no body to read, and that is not a
 * test failure.
 */
export interface CapturedResponse {
  url: string
  status: number
  contentType: string
  body: string
}

/** Binary types with nothing text-shaped to search. */
const BINARY = /^(image|video|audio|font)\//

export class ResponseRecorder {
  private readonly pending: Promise<CapturedResponse | null>[] = []

  private readonly handler: (response: Response) => void

  private constructor(private readonly page: Page) {
    this.handler = (response) => {
      this.pending.push(read(response))
    }
  }

  static attach(page: Page): ResponseRecorder {
    const recorder = new ResponseRecorder(page)
    page.on('response', recorder.handler)
    return recorder
  }

  /** Stop listening and return everything captured so far. */
  async collect(): Promise<CapturedResponse[]> {
    this.page.off('response', this.handler)
    const settled = await Promise.all(this.pending)
    return settled.filter((one): one is CapturedResponse => one !== null)
  }
}

async function read(response: Response): Promise<CapturedResponse | null> {
  const contentType = (response.headers()['content-type'] ?? '').toLowerCase()
  if (BINARY.test(contentType)) return null

  try {
    const buffer = await response.body()
    return {
      url: response.url(),
      status: response.status(),
      contentType,
      body: buffer.toString('utf8'),
    }
  } catch {
    // No body available (redirect, cached, aborted, or the browser dropped
    // it). Nothing was delivered to the page, so nothing leaked.
    return null
  }
}
