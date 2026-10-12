/**
 * Development transport.
 *
 * Prints the message instead of sending it, and reports `delivered: true` so
 * the calling flow behaves exactly as it will in production — a dev transport
 * that reports failure would train everyone to ignore the failure path.
 *
 * The plain-text part is printed rather than the HTML: it is the part that
 * carries the reset link, the order total and the download URL, and it fits
 * on a terminal. The HTML is written to a temp file only when
 * `EMAIL_DEBUG_HTML=true`, because pasting 6 KB of table markup into a
 * console makes the log useless for everything else.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { EmailMessage, EmailTransport, SendResult } from './types'

export class ConsoleTransport implements EmailTransport {
  readonly name = 'console'

  async send(message: EmailMessage): Promise<SendResult> {
    const lines = [
      '',
      '──────────────────────────────────────────────────────────────',
      `  to:      ${message.to}`,
      `  subject: ${message.subject}`,
      ...(message.attachments === undefined || message.attachments.length === 0
        ? []
        : [`  files:   ${message.attachments.map((a) => a.filename).join(', ')}`]),
      '──────────────────────────────────────────────────────────────',
      message.text,
      '──────────────────────────────────────────────────────────────',
    ]

    if (process.env.EMAIL_DEBUG_HTML === 'true') {
      try {
        const file = join(mkdtempSync(join(tmpdir(), 'bali-mail-')), 'message.html')
        writeFileSync(file, message.html, 'utf8')
        lines.push(`  html:    ${file}`, '')
      } catch (error) {
        lines.push(`  html:    could not be written (${String(error)})`, '')
      }
    }

    console.info(lines.join('\n'))

    return { id: null, delivered: true }
  }
}
