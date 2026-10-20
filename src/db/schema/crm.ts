import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps } from './_shared'
import { users } from './auth'
import { customTripRequests, orders } from './commerce'

/**
 * Phase 4 (migration 0020): customer relationship and support.
 *
 * Internal notes, tags and tasks are for the team only and never reach a
 * customer-facing page or a marketing tool. Tickets are shared with the
 * customer, except messages flagged `internal`.
 */

// ---------------------------------------------------------------------------
// Notes and tags
// ---------------------------------------------------------------------------

export const customerNotes = pgTable(
  'customer_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('customer_notes_user_idx').on(t.userId, t.createdAt)],
)

export const customerTags = pgTable(
  'customer_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Lower-case, letters/digits/dashes. */
    tag: varchar('tag', { length: 40 }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('customer_tags_unique').on(t.userId, t.tag),
    index('customer_tags_tag_idx').on(t.tag),
  ],
)

// ---------------------------------------------------------------------------
// Follow-up tasks
// ---------------------------------------------------------------------------

export const TASK_STATUSES = ['open', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const crmTasks = pgTable(
  'crm_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 200 }).notNull(),
    notes: text('notes'),
    /** Plain date in Bali time. */
    dueDate: date('due_date'),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => users.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id').references(() => customTripRequests.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    /** open | done | cancelled */
    status: varchar('status', { length: 16 }).notNull().default('open'),
    /** The worker's reminder to the assignee went out (once per task). */
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('crm_tasks_assignee_idx').on(t.assigneeId, t.status),
    index('crm_tasks_due_idx').on(t.status, t.dueDate),
    index('crm_tasks_customer_idx').on(t.customerId),
  ],
)

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export const TICKET_CATEGORIES = [
  'booking_change',
  'payment',
  'download',
  'complaint',
  'supplier_complaint',
  'other',
] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** BT-T-000123, from `ticket_number_seq`. */
    number: varchar('number', { length: 24 }).notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Who to answer: the account's address, or the contact form's for a guest. */
    email: varchar('email', { length: 256 }),
    name: varchar('name', { length: 128 }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 200 }).notNull(),
    category: varchar('category', { length: 24 }).notNull().default('other'),
    priority: varchar('priority', { length: 8 }).notNull().default('normal'),
    /** open | pending_customer | resolved | closed */
    status: varchar('status', { length: 20 }).notNull().default('open'),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    /** account | contact | staff */
    source: varchar('source', { length: 12 }).notNull().default('account'),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** The worker told the admin this urgent ticket waits for a first answer. */
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    lastCustomerMessageAt: timestamp('last_customer_message_at', { withTimezone: true }),
    /** 1–5, given by the customer after the ticket is resolved. */
    rating: integer('rating'),
    ratingComment: text('rating_comment'),
    ...timestamps,
  },
  (t) => [
    index('support_tickets_status_idx').on(t.status, t.priority),
    index('support_tickets_user_idx').on(t.userId),
    index('support_tickets_assignee_idx').on(t.assigneeId),
  ],
)

export interface TicketAttachment {
  key: string
  filename: string
  bytes: number
  contentType: string
}

export const supportTicketMessages = pgTable(
  'support_ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    /** staff | customer */
    authorType: varchar('author_type', { length: 8 }).notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    /** A note between staff. Never shown to the customer. */
    internal: boolean('internal').notNull().default(false),
    attachments: jsonb('attachments').$type<TicketAttachment[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('support_ticket_messages_ticket_idx').on(t.ticketId, t.createdAt)],
)

/** Saved answers staff insert into a reply. */
export const supportSavedReplies = pgTable('support_saved_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 120 }).notNull(),
  body: text('body').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
})
