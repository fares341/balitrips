import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { users } from './auth'
import { timestamps } from './_shared'

/**
 * The AI assistants (public website + Studio).
 *
 *  - `assistant_conversations` — one chat. Owned by a browser token (stored as
 *    an HMAC, never raw) and, when signed in, by the user. Public chats are
 *    listed in Studio → Assistant for review.
 *  - `assistant_messages`      — the visible turns: what the visitor typed and
 *    what the assistant answered. Tool results are not stored (they are
 *    re-derived from the live catalogue on every turn).
 *  - `assistant_actions`       — a change the model PROPOSED (add to My Trip,
 *    send a custom-trip request, a Studio write). Nothing runs until the
 *    person clicks Confirm; the stored arguments are what runs, so the browser
 *    cannot alter the change between the card and the click.
 *  - `assistant_usage`         — daily counters: messages per IP (hashed) and
 *    the global spend, for the caps.
 *
 * Retention: conversations older than ASSISTANT_RETENTION_DAYS (90) are
 * deleted by the worker's daily `security.prune` job; messages and actions go
 * with them (cascade). Usage rows older than that are dropped too.
 */

export const assistantConversations = pgTable(
  'assistant_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `public` (website) or `studio` (staff). */
    kind: varchar('kind', { length: 16 }).notNull(),
    /** HMAC of the browser token (public) or of the staff user id (studio). */
    ownerHash: varchar('owner_hash', { length: 64 }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** HMAC of the IP — counting only, never shown. */
    ipHash: varchar('ip_hash', { length: 64 }),
    locale: varchar('locale', { length: 8 }).notNull(),
    messageCount: integer('message_count').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /** Millionths of a US dollar. */
    costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
    lastModel: varchar('last_model', { length: 100 }),
    ...timestamps,
  },
  (t) => [
    index('assistant_conv_owner_idx').on(t.ownerHash, t.updatedAt),
    index('assistant_conv_kind_idx').on(t.kind, t.createdAt),
  ],
)

export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => assistantConversations.id, { onDelete: 'cascade' }),
    /** `user` | `assistant`. */
    role: varchar('role', { length: 16 }).notNull(),
    content: text('content').notNull(),
    /** Names of the tools used to produce an assistant message. */
    tools: jsonb('tools').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assistant_msg_conv_idx').on(t.conversationId, t.createdAt)],
)

export const assistantActions = pgTable(
  'assistant_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => assistantConversations.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 48 }).notNull(),
    /** The validated arguments that will run on Confirm. */
    args: jsonb('args').$type<Record<string, unknown>>().notNull(),
    /** What the confirmation card shows. */
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
    /** `pending` → `done` | `failed` | `cancelled`. */
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    result: jsonb('result').$type<Record<string, unknown>>(),
    executedBy: uuid('executed_by').references(() => users.id, { onDelete: 'set null' }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assistant_action_conv_idx').on(t.conversationId)],
)

export const assistantUsage = pgTable(
  'assistant_usage',
  {
    day: date('day', { mode: 'string' }).notNull(),
    /** `global`, `studio`, or `ip:<hmac>`. */
    scope: varchar('scope', { length: 80 }).notNull(),
    messages: integer('messages').notNull().default(0),
    costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.scope] })],
)
