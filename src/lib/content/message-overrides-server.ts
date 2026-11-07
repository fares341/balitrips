import 'server-only'

import { unstable_cache } from 'next/cache'

import { db } from '@/db'
import { messageOverrides } from '@/db/schema'

import type { MessageOverrides } from './message-overrides'

/** Dropped by every Studio screen that saves a site text. */
export const MESSAGE_OVERRIDES_TAG = 'message-overrides'

async function load(): Promise<MessageOverrides> {
  try {
    const rows = await db
      .select({ key: messageOverrides.key, values: messageOverrides.values })
      .from(messageOverrides)
    const out: MessageOverrides = {}
    for (const row of rows) out[row.key] = row.values ?? {}
    return out
  } catch (error) {
    // No database (build step, outage): the bundled texts are shown.
    console.warn(`[message-overrides] using bundled texts: ${String(error)}`)
    return {}
  }
}

export const readMessageOverrides = unstable_cache(load, ['message-overrides-v1'], {
  tags: [MESSAGE_OVERRIDES_TAG],
  revalidate: 300,
})
