/**
 * WhatsApp STOP / START replies (owner, Nov 2026; Meta and Saudi CITC rules:
 * a customer must be able to stop messages by replying).
 *
 * A reply whose WHOLE text (after normalising) is a stop word opts the
 * number out; a start word opts it back in. Matching ignores case, Arabic
 * diacritics and tatweel, alef/hamza forms, and surrounding punctuation or
 * emoji — but a sentence that merely contains "stop" ("don't stop the
 * tour") is NOT an opt-out.
 *
 * Pure: shared by the webhook, the tests and Studio.
 */

export type StopCommand = 'stop' | 'start'

const STOP_WORDS = [
  'stop',
  'stopall',
  'unsubscribe',
  'ايقاف',
  'الغاء',
  'توقف',
  'الغاء الاشتراك',
  'berhenti',
]
const START_WORDS = ['start', 'subscribe', 'unstop', 'اشتراك', 'اشترك', 'mulai']

/** Lower-case, strip diacritics/tatweel, unify alef/ya/ta-marbuta, trim punctuation. */
export function normaliseReply(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOP = new Set(STOP_WORDS.map(normaliseReply))
const START = new Set(START_WORDS.map(normaliseReply))

export function parseStopCommand(text: string | null | undefined): StopCommand | null {
  if (typeof text !== 'string' || text.length > 60) return null
  const value = normaliseReply(text)
  if (value === '') return null
  if (STOP.has(value)) return 'stop'
  if (START.has(value)) return 'start'
  return null
}

/** The one confirmation sent back, in the person's language. */
export function stopConfirmation(command: StopCommand, locale: string): string {
  const texts: Record<StopCommand, Record<string, string>> = {
    stop: {
      ar: 'تم إيقاف رسائل واتساب من بالي تريبس. لإعادة تفعيلها أرسل «اشتراك».',
      en: 'You will no longer receive WhatsApp messages from Bali Trips. Reply START to turn them back on.',
      id: 'Anda tidak akan menerima pesan WhatsApp dari Bali Trips lagi. Balas START untuk mengaktifkannya kembali.',
    },
    start: {
      ar: 'تم تفعيل رسائل واتساب من بالي تريبس مجدداً. لإيقافها أرسل «إيقاف».',
      en: 'WhatsApp messages from Bali Trips are back on. Reply STOP to turn them off.',
      id: 'Pesan WhatsApp dari Bali Trips aktif kembali. Balas STOP untuk menghentikannya.',
    },
  }
  return texts[command][locale] ?? texts[command].en ?? ''
}

export interface InboundText {
  /** Sender, E.164 digits without '+'. */
  from: string
  text: string
  /** Provider message id (dedupe), when given. */
  id: string | null
}

/**
 * Text messages from a provider webhook body: Meta Cloud API
 * (`entry[].changes[].value.messages[]`) or a flat `{from|mobile|phone,
 * message|text|body, id}` (Mazbot and similar). Anything else → [].
 */
export function inboundTexts(payload: unknown): InboundText[] {
  const out: InboundText[] = []
  const digits = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : ''
  const push = (from: unknown, text: unknown, id: unknown) => {
    const number = digits(from)
    if (number.length < 8 || number.length > 15 || typeof text !== 'string') return
    out.push({
      from: number,
      text,
      id: typeof id === 'string' && id !== '' ? id.slice(0, 120) : null,
    })
  }
  if (typeof payload !== 'object' || payload === null) return out
  const body = payload as Record<string, unknown>

  if (Array.isArray(body.entry)) {
    for (const entry of body.entry as { changes?: { value?: { messages?: unknown[] } }[] }[]) {
      for (const change of entry?.changes ?? []) {
        for (const message of change?.value?.messages ?? []) {
          const m = message as {
            from?: unknown
            id?: unknown
            type?: unknown
            text?: { body?: unknown }
            button?: { text?: unknown }
            interactive?: { button_reply?: { title?: unknown } }
          }
          const text =
            m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? undefined
          push(m.from, text, m.id)
        }
      }
    }
    return out
  }

  const nested = (body.data ?? body.message ?? null) as Record<string, unknown> | null
  for (const source of [body, typeof nested === 'object' ? nested : null]) {
    if (!source) continue
    const from = source.from ?? source.mobile ?? source.phone ?? source.sender
    const text = source.text ?? source.body ?? source.message
    const textValue =
      typeof text === 'object' && text !== null ? (text as { body?: unknown }).body : text
    if (from !== undefined && typeof textValue === 'string') {
      push(from, textValue, source.id ?? source.message_id)
      break
    }
  }
  return out
}
