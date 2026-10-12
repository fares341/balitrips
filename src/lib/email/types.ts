/**
 * The transport boundary.
 *
 * Everything that sends mail depends on `EmailTransport` and nothing else.
 * Resend is one implementation; the development console is another; a test
 * can pass a third that just collects messages. Swapping providers — which
 * this project will do the first time a deliverability problem shows up — is
 * one new file and one line in `index.ts`.
 */

export interface EmailAttachment {
  filename: string
  content: Uint8Array
  contentType?: string
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
  /**
   * Always required, never optional.
   *
   * A message with no text part scores badly with every spam filter, and it
   * is the only thing a screen reader in a plain-text client has to work
   * with. Every template here builds both.
   */
  text: string
  replyTo?: string
  attachments?: readonly EmailAttachment[]
}

export interface SendResult {
  /** Provider message id when one was returned. */
  id: string | null
  /**
   * `false` means the message was NOT handed to a provider — no credentials,
   * or the provider rejected it. Callers decide whether that is fatal; the
   * auth endpoints deliberately treat it as non-fatal so the response cannot
   * be used to probe which addresses exist.
   */
  delivered: boolean
  error?: string
}

export interface EmailTransport {
  readonly name: string
  send(message: EmailMessage): Promise<SendResult>
}

/** A rendered, ready-to-send message plus the locale it was rendered in. */
export interface RenderedEmail {
  subject: string
  html: string
  text: string
}
