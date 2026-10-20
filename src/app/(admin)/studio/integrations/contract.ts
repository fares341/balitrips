/** Outside the `'use server'` file on purpose: it may export only async functions. */
export interface WebhookSecretState {
  status: 'idle' | 'created' | 'error'
  /** The new secret — present exactly once, in the response to the click that made it. */
  secret: string | null
  error: string | null
}

export const IDLE_WEBHOOK_SECRET: WebhookSecretState = { status: 'idle', secret: null, error: null }
