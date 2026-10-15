/**
 * The Studio assistant's tools.
 *
 * Authorization is the tool's job, every time, from the server-built context
 * (the staff member's own role) — never from anything the model says:
 *
 *  - each tool names the capability it needs and refuses with `forbidden`
 *    when `can(role, capability)` is false, before touching any data;
 *  - writes are proposals: the arguments are validated and stored, a card
 *    shows the exact change, and only a Confirm click runs it — through the
 *    EXISTING Studio server action, with the staff member's own session, so
 *    the action's own `requireCapability()` and audit row apply as well;
 *  - customer contact details reach the model masked (`maskEmail`,
 *    `maskPhone`): the model needs to tell customers apart, not to read their
 *    inboxes. Full details stay on the linked Studio page.
 *
 * No database imports here (see ./staff-deps.ts), so the tests can run it
 * against fakes.
 */

import { z } from 'zod'

import { can, isElevated, type Capability, type Role } from '@/lib/auth/roles'
import { BOOKING_STATUSES } from '@/lib/orders/booking-status'
import { ORDER_STATUSES } from '@/lib/orders/state'
import { formatMoney } from '@/lib/money'

import type { AssistantTool, ToolResult } from './engine'

export const TRIP_STATUSES = [
  'new',
  'under_review',
  'in_progress',
  'waiting_customer',
  'completed',
  'cancelled',
] as const
export const CONTACT_STATUSES = ['new', 'read', 'replied', 'closed'] as const
export const CONTENT_TYPES = ['activity', 'package', 'article', 'itinerary'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]
export type Range = 'today' | '7d' | '30d' | 'all'

/* --------------------------------------------------------------------------
   Data the tools read (implemented in staff-deps.ts)
   -------------------------------------------------------------------------- */

export interface StaffOrderRow {
  id: string
  orderNumber: string
  status: string
  totalMinor: number
  currency: string
  customerName: string | null
  customerEmail: string | null
  placedAt: string
}

export interface StaffOrderItem {
  id: string
  name: string
  kind: string
  quantity: number
  travelDate: string | null
  travelTime: string | null
  bookingStatus: string
  lineTotalMinor: number
}

export interface StaffDeps {
  stats(input: {
    orders: boolean
    leads: boolean
    customers: boolean
    payments: boolean
  }): Promise<Record<string, unknown>>
  listOrders(input: {
    range: Range
    status: string | null
    q: string | null
    limit: number
  }): Promise<StaffOrderRow[]>
  getOrder(orderNumber: string): Promise<(StaffOrderRow & { items: StaffOrderItem[] }) | null>
  orderPayments(orderId: string): Promise<
    {
      status: string
      amountMinor: number
      currency: string
      method: string | null
      provider: string
      createdAt: string
    }[]
  >
  listBookings(input: {
    from: string
    to: string
    status: string | null
    limit: number
  }): Promise<(StaffOrderItem & { orderNumber: string; orderId: string })[]>
  listCustomers(input: { q: string | null; limit: number }): Promise<
    {
      id: string
      name: string | null
      email: string
      phone: string | null
      role: string
      createdAt: string
    }[]
  >
  getCustomer(id: string): Promise<{
    id: string
    name: string | null
    email: string
    phone: string | null
    role: string
    createdAt: string
    orders: {
      orderNumber: string
      status: string
      totalMinor: number
      currency: string
      placedAt: string
    }[]
    access: { kind: string; expiresAt: string | null }[]
  } | null>
  listLeads(input: {
    kind: 'custom' | 'contact'
    status: string | null
    limit: number
  }): Promise<Record<string, unknown>[]>
  getLead(input: {
    kind: 'custom' | 'contact'
    id: string
  }): Promise<Record<string, unknown> | null>
  paymentsSummary(
    range: Range,
  ): Promise<{ status: string; currency: string; count: number; amountMinor: number }[]>
  listContent(input: {
    type: ContentType | 'place'
    q: string | null
    status: string | null
    limit: number
  }): Promise<{ id: string; slug: string; name: string; status: string; price?: string | null }[]>
  settings(): Promise<Record<string, unknown>>
  /** For proposals: the current state the card shows as "before". */
  orderItemState(
    orderNumber: string,
    orderItemId: string,
  ): Promise<{ orderId: string; name: string; bookingStatus: string; orderStatus: string } | null>
  contentState(type: ContentType, id: string): Promise<{ name: string; status: string } | null>
  leadState(
    kind: 'custom' | 'contact',
    id: string,
  ): Promise<{ name: string; status: string; notes: string | null } | null>
  slugTaken(slug: string): Promise<boolean>
  regionId(key: string): Promise<string | null>
  createAction(input: {
    conversationId: string
    kind: string
    args: Record<string, unknown>
    summary: Record<string, unknown>
  }): Promise<string>
}

export interface StaffCtx {
  role: Role
  userId: string
  locale: 'en' | 'ar'
  conversationId: string
  /** Studio link builder (the configured base path). */
  href: (path: string) => string
  deps: StaffDeps
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const money = (minor: number, currency: string) => formatMoney(minor, currency, 'en')
const UUID = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'an id returned by a tool',
  )
const DATE = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const ORDER_NUMBER = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/)
const RANGE = z.enum(['today', '7d', '30d', 'all'])

/** `s***@example.com`: enough to tell two customers apart. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

/** `•••• 4567`: the last digits only. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length < 4 ? '••••' : `•••• ${digits.slice(-4)}`
}

type Tool = AssistantTool<StaffCtx>

export function forbidden(capability: Capability): ToolResult {
  return { data: { error: 'forbidden', needs: capability } }
}

/** True when this staff member may use a tool gated on `capability`. */
export function allowed(ctx: Pick<StaffCtx, 'role'>, capability: Capability): boolean {
  return isElevated(ctx.role) && can(ctx.role, capability)
}

function staffTool<S extends z.ZodType>(spec: {
  name: string
  description: string
  capability: Capability
  parameters: Record<string, unknown>
  schema: S
  run: (args: z.infer<S>, ctx: StaffCtx) => Promise<ToolResult>
}): Tool & { capability: Capability } {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    schema: spec.schema,
    capability: spec.capability,
    // The gate runs before the body, for every call.
    run: (async (args: z.infer<S>, ctx: StaffCtx) => {
      if (!allowed(ctx, spec.capability)) return forbidden(spec.capability)
      return spec.run(args, ctx)
    }) as unknown as Tool['run'],
  }
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const orderCard = (o: StaffOrderRow, ctx: StaffCtx) => ({
  orderNumber: o.orderNumber,
  status: o.status,
  total: money(o.totalMinor, o.currency),
  customer: o.customerName,
  email: maskEmail(o.customerEmail),
  placedAt: o.placedAt,
  studio: ctx.href(`/orders/${o.id}`),
})

/* --------------------------------------------------------------------------
   Read tools
   -------------------------------------------------------------------------- */

const statsTool = staffTool({
  name: 'dashboard_stats',
  description:
    'Headline numbers: orders today, awaiting fulfilment, revenue this month, new leads, customers.',
  capability: 'admin.access',
  parameters: obj({}),
  schema: z.object({}),
  run: async (_args, ctx) => ({
    data: await ctx.deps.stats({
      orders: allowed(ctx, 'orders.read'),
      leads: allowed(ctx, 'leads.read'),
      customers: allowed(ctx, 'customers.read'),
      payments: allowed(ctx, 'payments.read'),
    }),
  }),
})

const listOrdersTool = staffTool({
  name: 'list_orders',
  description:
    'Orders, newest first. range: today | 7d | 30d | all (Bali time). Optional status and search text (order number, customer name/email).',
  capability: 'orders.read',
  parameters: obj({
    range: { type: 'string', enum: ['today', '7d', '30d', 'all'] },
    status: { type: 'string', enum: [...ORDER_STATUSES] },
    q: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 25 },
  }),
  schema: z.object({
    range: RANGE.optional(),
    status: z.enum(ORDER_STATUSES).optional(),
    q: z.string().trim().max(80).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  run: async (args, ctx) => {
    const rows = await ctx.deps.listOrders({
      range: args.range ?? '7d',
      status: args.status ?? null,
      q: args.q ?? null,
      limit: args.limit ?? 15,
    })
    return { data: { count: rows.length, orders: rows.map((o) => orderCard(o, ctx)) } }
  },
})

const getOrderTool = staffTool({
  name: 'get_order',
  description:
    'One order by its order number, with its lines (ids, booking statuses) and, with payments permission, its payments.',
  capability: 'orders.read',
  parameters: obj({ orderNumber: { type: 'string' } }, ['orderNumber']),
  schema: z.object({ orderNumber: ORDER_NUMBER }),
  run: async ({ orderNumber }, ctx) => {
    const order = await ctx.deps.getOrder(orderNumber)
    if (!order) return { data: { found: false } }
    const payments = allowed(ctx, 'payments.read') ? await ctx.deps.orderPayments(order.id) : null
    return {
      data: {
        found: true,
        ...orderCard(order, ctx),
        items: order.items.map((item) => ({
          orderItemId: item.id,
          name: item.name,
          kind: item.kind,
          quantity: item.quantity,
          date: item.travelDate,
          time: item.travelTime?.slice(0, 5) ?? null,
          bookingStatus: item.bookingStatus,
          total: money(item.lineTotalMinor, order.currency),
        })),
        ...(payments === null
          ? { payments: 'hidden (needs payments.read)' }
          : {
              payments: payments.map((p) => ({
                status: p.status,
                amount: money(p.amountMinor, p.currency),
                method: p.method,
                provider: p.provider,
                at: p.createdAt,
              })),
            }),
      },
    }
  },
})

const listBookingsTool = staffTool({
  name: 'list_bookings',
  description:
    'Booked items (order lines) by travel date, for planning with providers. Defaults to today through the next 7 days.',
  capability: 'orders.read',
  parameters: obj({
    from: { type: 'string', description: 'YYYY-MM-DD' },
    to: { type: 'string', description: 'YYYY-MM-DD' },
    status: { type: 'string', enum: [...BOOKING_STATUSES] },
  }),
  schema: z.object({
    from: DATE.optional(),
    to: DATE.optional(),
    status: z.enum(BOOKING_STATUSES).optional(),
  }),
  run: async (args, ctx) => {
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
    const week = new Date(Date.now() + 8 * 3600_000 + 7 * 86400_000).toISOString().slice(0, 10)
    const rows = await ctx.deps.listBookings({
      from: args.from ?? today,
      to: args.to ?? week,
      status: args.status ?? null,
      limit: 40,
    })
    return {
      data: {
        count: rows.length,
        bookings: rows.map((row) => ({
          orderNumber: row.orderNumber,
          orderItemId: row.id,
          name: row.name,
          date: row.travelDate,
          time: row.travelTime?.slice(0, 5) ?? null,
          quantity: row.quantity,
          bookingStatus: row.bookingStatus,
          studio: ctx.href(`/orders/${row.orderId}`),
        })),
      },
    }
  },
})

const listCustomersTool = staffTool({
  name: 'list_customers',
  description:
    'Customer accounts, newest first, optionally matching a name/email/phone fragment. Contact details are masked.',
  capability: 'customers.read',
  parameters: obj({ q: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 25 } }),
  schema: z.object({
    q: z.string().trim().max(80).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  run: async (args, ctx) => {
    const rows = await ctx.deps.listCustomers({ q: args.q ?? null, limit: args.limit ?? 15 })
    return {
      data: {
        customers: rows.map((c) => ({
          id: c.id,
          name: c.name,
          email: maskEmail(c.email),
          phone: maskPhone(c.phone),
          role: c.role,
          joined: c.createdAt,
          studio: ctx.href(`/customers/${c.id}`),
        })),
      },
    }
  },
})

const getCustomerTool = staffTool({
  name: 'get_customer',
  description: 'One customer by id: masked contact details, recent orders and live map access.',
  capability: 'customers.read',
  parameters: obj({ id: { type: 'string' } }, ['id']),
  schema: z.object({ id: UUID }),
  run: async ({ id }, ctx) => {
    const c = await ctx.deps.getCustomer(id)
    if (!c) return { data: { found: false } }
    return {
      data: {
        found: true,
        id: c.id,
        name: c.name,
        email: maskEmail(c.email),
        phone: maskPhone(c.phone),
        role: c.role,
        joined: c.createdAt,
        studio: ctx.href(`/customers/${c.id}`),
        // Orders are shown only to someone who may read orders.
        orders: allowed(ctx, 'orders.read')
          ? c.orders.map((o) => ({
              orderNumber: o.orderNumber,
              status: o.status,
              total: money(o.totalMinor, o.currency),
              placedAt: o.placedAt,
            }))
          : 'hidden (needs orders.read)',
        access: c.access,
      },
    }
  },
})

const listLeadsTool = staffTool({
  name: 'list_leads',
  description:
    'Leads, newest first: kind "custom" = custom trip requests, "contact" = contact-form messages. Optional status.',
  capability: 'leads.read',
  parameters: obj(
    {
      kind: { type: 'string', enum: ['custom', 'contact'] },
      status: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 25 },
    },
    ['kind'],
  ),
  schema: z.object({
    kind: z.enum(['custom', 'contact']),
    status: z.string().trim().max(24).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  run: async (args, ctx) => {
    const rows = await ctx.deps.listLeads({
      kind: args.kind,
      status: args.status ?? null,
      limit: args.limit ?? 15,
    })
    return {
      data: {
        kind: args.kind,
        leads: rows.map((row) => ({
          ...row,
          email: maskEmail(typeof row.email === 'string' ? row.email : null),
          phone: maskPhone(typeof row.phone === 'string' ? row.phone : null),
          ...(args.kind === 'custom' && typeof row.id === 'string'
            ? { studio: ctx.href(`/leads/${row.id}`) }
            : {}),
        })),
      },
    }
  },
})

const getLeadTool = staffTool({
  name: 'get_lead',
  description:
    'One lead by id (kind "custom" or "contact"), with the customer\'s message/notes and internal notes.',
  capability: 'leads.read',
  parameters: obj(
    { kind: { type: 'string', enum: ['custom', 'contact'] }, id: { type: 'string' } },
    ['kind', 'id'],
  ),
  schema: z.object({ kind: z.enum(['custom', 'contact']), id: UUID }),
  run: async ({ kind, id }, ctx) => {
    const row = await ctx.deps.getLead({ kind, id })
    if (!row) return { data: { found: false } }
    return {
      data: {
        found: true,
        ...row,
        email: maskEmail(typeof row.email === 'string' ? row.email : null),
        phone: maskPhone(typeof row.phone === 'string' ? row.phone : null),
        ...(kind === 'custom'
          ? { studio: ctx.href(`/leads/${id}`) }
          : { studio: ctx.href('/leads') }),
      },
    }
  },
})

const paymentsTool = staffTool({
  name: 'payments_summary',
  description: 'Payments grouped by status and currency for a period (today | 7d | 30d | all).',
  capability: 'payments.read',
  parameters: obj({ range: { type: 'string', enum: ['today', '7d', '30d', 'all'] } }),
  schema: z.object({ range: RANGE.optional() }),
  run: async (args, ctx) => {
    const rows = await ctx.deps.paymentsSummary(args.range ?? '30d')
    return {
      data: {
        range: args.range ?? '30d',
        studio: ctx.href('/payments'),
        groups: rows.map((row) => ({
          status: row.status,
          currency: row.currency,
          count: row.count,
          amount: money(row.amountMinor, row.currency),
        })),
      },
    }
  },
})

const listContentTool = staffTool({
  name: 'list_content',
  description:
    'Catalogue content with status: type activity | package | itinerary | article | place. Optional name search and status (draft/published).',
  capability: 'content.read',
  parameters: obj(
    {
      type: { type: 'string', enum: [...CONTENT_TYPES, 'place'] },
      q: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'published'] },
      limit: { type: 'integer', minimum: 1, maximum: 30 },
    },
    ['type'],
  ),
  schema: z.object({
    type: z.enum([...CONTENT_TYPES, 'place']),
    q: z.string().trim().max(80).optional(),
    status: z.enum(['draft', 'published']).optional(),
    limit: z.number().int().min(1).max(30).optional(),
  }),
  run: async (args, ctx) => {
    const rows = await ctx.deps.listContent({
      type: args.type,
      q: args.q ?? null,
      status: args.status ?? null,
      limit: args.limit ?? 20,
    })
    const base = {
      activity: '/activities',
      package: '/packages',
      itinerary: '/itineraries',
      article: '/articles',
      place: '/places',
    }[args.type]
    return {
      data: {
        type: args.type,
        items: rows.map((row) => ({ ...row, studio: ctx.href(`${base}/${row.id}`) })),
      },
    }
  },
})

const settingsTool = staffTool({
  name: 'get_settings',
  description:
    'Site configuration: currencies, fees, contact details and assistant settings (no secrets).',
  capability: 'config.write',
  parameters: obj({}),
  schema: z.object({}),
  run: async (_args, ctx) => ({
    data: { ...(await ctx.deps.settings()), studio: ctx.href('/config') },
  }),
})

/* --------------------------------------------------------------------------
   Proposals (run only after the staff member confirms)
   -------------------------------------------------------------------------- */

async function propose(
  ctx: StaffCtx,
  kind: string,
  args: Record<string, unknown>,
  summary: Record<string, unknown>,
): Promise<ToolResult> {
  const id = await ctx.deps.createAction({
    conversationId: ctx.conversationId,
    kind,
    args,
    summary,
  })
  return {
    data: {
      proposed: true,
      shown: summary,
      note: 'Waiting for the staff member to press Confirm. Not done yet.',
    },
    action: { id, kind, summary },
  }
}

const proposeBookingStatus = staffTool({
  name: 'propose_booking_status',
  description:
    'Propose moving one booked item (order line) to a new provider status: created → sent_to_provider → confirmed → completed, or cancel_requested → cancelled → refunded.',
  capability: 'orders.fulfil',
  parameters: obj(
    {
      orderNumber: { type: 'string' },
      orderItemId: { type: 'string' },
      status: { type: 'string', enum: [...BOOKING_STATUSES] },
      notifyCustomer: { type: 'boolean' },
    },
    ['orderNumber', 'orderItemId', 'status'],
  ),
  schema: z.object({
    orderNumber: ORDER_NUMBER,
    orderItemId: UUID,
    status: z.enum(BOOKING_STATUSES),
    notifyCustomer: z.boolean().optional(),
  }),
  run: async (args, ctx) => {
    const state = await ctx.deps.orderItemState(args.orderNumber, args.orderItemId)
    if (!state) return { data: { error: 'not_found', detail: 'no such line in that order' } }
    if (state.bookingStatus === args.status)
      return { data: { error: 'no_change', current: state.bookingStatus } }
    return propose(
      ctx,
      'booking_status',
      {
        orderId: state.orderId,
        orderItemId: args.orderItemId,
        status: args.status,
        notify: args.notifyCustomer === true,
      },
      {
        order: args.orderNumber,
        item: state.name,
        change: `${state.bookingStatus} → ${args.status}`,
        notifyCustomer: args.notifyCustomer === true,
      },
    )
  },
})

const proposePublish = staffTool({
  name: 'propose_publish',
  description:
    'Propose publishing or unpublishing (back to draft) an activity, package, article or itinerary by id (from list_content).',
  capability: 'content.publish',
  parameters: obj(
    {
      type: { type: 'string', enum: [...CONTENT_TYPES] },
      id: { type: 'string' },
      publish: { type: 'boolean', description: 'true = publish, false = unpublish' },
    },
    ['type', 'id', 'publish'],
  ),
  schema: z.object({ type: z.enum(CONTENT_TYPES), id: UUID, publish: z.boolean() }),
  run: async (args, ctx) => {
    const state = await ctx.deps.contentState(args.type, args.id)
    if (!state) return { data: { error: 'not_found' } }
    const next = args.publish ? 'published' : 'draft'
    if (state.status === next) return { data: { error: 'no_change', current: state.status } }
    return propose(
      ctx,
      'content_status',
      { type: args.type, id: args.id, publish: args.publish },
      { [args.type]: state.name, change: `${state.status} → ${next}` },
    )
  },
})

const proposePlaceDraft = staffTool({
  name: 'propose_place_draft',
  description:
    'Propose creating a new map place as a DRAFT (not visible on the site until someone publishes it in Studio). Locked (map plan) by default.',
  capability: 'content.write',
  parameters: obj(
    {
      slug: { type: 'string', description: 'lowercase-with-dashes' },
      nameEn: { type: 'string' },
      nameAr: { type: 'string' },
      nameId: { type: 'string' },
      lat: { type: 'number' },
      lon: { type: 'number' },
      regionKey: { type: 'string' },
      descriptionEn: { type: 'string' },
    },
    ['slug', 'nameEn', 'lat', 'lon'],
  ),
  schema: z.object({
    slug: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    nameEn: z.string().trim().min(1).max(120),
    nameAr: z.string().trim().max(120).optional(),
    nameId: z.string().trim().max(120).optional(),
    // Bali and the nearby islands only.
    lat: z.number().min(-9.2).max(-7.7),
    lon: z.number().min(114.3).max(116.8),
    regionKey: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-z0-9_-]+$/)
      .optional(),
    descriptionEn: z.string().trim().max(1000).optional(),
  }),
  run: async (args, ctx) => {
    if (await ctx.deps.slugTaken(args.slug)) return { data: { error: 'slug_taken' } }
    const regionId = args.regionKey ? await ctx.deps.regionId(args.regionKey) : null
    if (args.regionKey && regionId === null) return { data: { error: 'unknown_region' } }
    return propose(
      ctx,
      'place_draft',
      { ...args, regionId },
      {
        place: args.nameEn,
        slug: args.slug,
        coordinates: `${args.lat.toFixed(5)}, ${args.lon.toFixed(5)}`,
        region: args.regionKey ?? null,
        status: 'draft',
      },
    )
  },
})

const proposeLeadStatus = staffTool({
  name: 'propose_lead_status',
  description:
    'Propose moving a custom trip request to a new status (the customer is notified as the Leads page does).',
  capability: 'leads.read',
  parameters: obj(
    { requestId: { type: 'string' }, status: { type: 'string', enum: [...TRIP_STATUSES] } },
    ['requestId', 'status'],
  ),
  schema: z.object({ requestId: UUID, status: z.enum(TRIP_STATUSES) }),
  run: async (args, ctx) => {
    const state = await ctx.deps.leadState('custom', args.requestId)
    if (!state) return { data: { error: 'not_found' } }
    if (state.status === args.status) return { data: { error: 'no_change', current: state.status } }
    return propose(ctx, 'lead_status', args, {
      request: state.name,
      change: `${state.status} → ${args.status}`,
    })
  },
})

const proposeLeadNote = staffTool({
  name: 'propose_lead_note',
  description:
    'Propose adding an internal note (a reply draft, a call summary) to a custom trip request. Appended to the existing notes; never shown to the customer.',
  capability: 'leads.read',
  parameters: obj({ requestId: { type: 'string' }, note: { type: 'string' } }, [
    'requestId',
    'note',
  ]),
  schema: z.object({ requestId: UUID, note: z.string().trim().min(1).max(2000) }),
  run: async (args, ctx) => {
    const state = await ctx.deps.leadState('custom', args.requestId)
    if (!state) return { data: { error: 'not_found' } }
    return propose(ctx, 'lead_note', args, { request: state.name, addNote: args.note })
  },
})

const proposeContactStatus = staffTool({
  name: 'propose_contact_status',
  description: 'Propose marking a contact-form message new / read / replied / closed.',
  capability: 'leads.read',
  parameters: obj(
    { messageId: { type: 'string' }, status: { type: 'string', enum: [...CONTACT_STATUSES] } },
    ['messageId', 'status'],
  ),
  schema: z.object({ messageId: UUID, status: z.enum(CONTACT_STATUSES) }),
  run: async (args, ctx) => {
    const state = await ctx.deps.leadState('contact', args.messageId)
    if (!state) return { data: { error: 'not_found' } }
    if (state.status === args.status) return { data: { error: 'no_change', current: state.status } }
    return propose(ctx, 'contact_status', args, {
      message: state.name,
      change: `${state.status} → ${args.status}`,
    })
  },
})

export const STAFF_TOOLS = [
  statsTool,
  listOrdersTool,
  getOrderTool,
  listBookingsTool,
  listCustomersTool,
  getCustomerTool,
  listLeadsTool,
  getLeadTool,
  paymentsTool,
  listContentTool,
  settingsTool,
  proposeBookingStatus,
  proposePublish,
  proposePlaceDraft,
  proposeLeadStatus,
  proposeLeadNote,
  proposeContactStatus,
] as const

/** The capability each proposal needs again when it is executed. */
export const ACTION_CAPABILITY: Record<string, Capability> = {
  booking_status: 'orders.fulfil',
  content_status: 'content.publish',
  place_draft: 'content.write',
  lead_status: 'leads.read',
  lead_note: 'leads.read',
  contact_status: 'leads.read',
}

/** Only the tools this role can use are offered to the model at all. */
export function toolsFor(role: Role): Tool[] {
  return STAFF_TOOLS.filter((tool) => allowed({ role }, tool.capability))
}
