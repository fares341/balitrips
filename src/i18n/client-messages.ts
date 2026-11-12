import type { AbstractIntlMessages } from 'next-intl'

import clientKeys from './client-message-keys.json'

const CLIENT_KEYS: readonly string[] = clientKeys

/**
 * Only the messages client components can ask for (see
 * scripts/client-message-keys.mjs). Server components keep reading the full
 * catalogue through getTranslations; this subset is what gets serialised into
 * every page's RSC payload, so the whole ~3,000-key catalogue no longer rides
 * along with each HTML response.
 */
export function pickClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  const out: AbstractIntlMessages = {}
  for (const key of CLIENT_KEYS) {
    const value = messages[key]
    if (value !== undefined) out[key] = value
  }
  return out
}
