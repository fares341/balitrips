# Roles and permissions (Phase 6)

Source of truth: `src/lib/auth/roles.ts`. This page mirrors it; the unit test
`src/lib/auth/roles-matrix.test.ts` holds the same table and fails if the two
drift. The Studio browser check (`scripts/admin-check.mjs`) reads the table from
`roles.ts` and signs in as every role (`scripts/create-test-accounts.ts` creates
one account per role) to confirm each role sees exactly its pages.

Every check runs on the server, in each page and each server action
(`requireCapability`). Hiding a sidebar link is presentation only.

## Roles

| Role | Studio | Meant for |
| --- | --- | --- |
| `admin` | everything | Super Admin: team, settings, money, system health. Holds every capability, including future ones. |
| `staff` | yes | The original all-round team role. **Unchanged effective access** (see note). |
| `operations_manager` | yes | Bookings and day-to-day operations, availability, prices, VIP settings, reports. |
| `booking_agent` | yes | Prepare and confirm bookings, availability, customer follow-up. |
| `support_agent` | yes | Support tickets, notes, tasks; reads orders and customers. |
| `content_editor` | yes | Activities, places, articles, media, translations. **No prices.** |
| `marketing_manager` | yes | Content, discount codes, leads, reports. No customer export. |
| `accountant` | yes | Payments, profit, payment checks, supplier payables. No refunds. |
| `bookings_operator` | yes | «مشغّل حجوزات» (owner, Oct 2026): runs bookings while the owner travels. Holds only `admin.access`, `orders.read`, `orders.fulfil`, `bookings.confirm`, `leads.read` — sees orders and custom-trip requests, confirms with the operator, charges or releases a card hold, marks lines done or cancelled. No content, prices, settings, team, customers list, payments or money pages. |
| `supplier_portal` | **no** | Reserved for a future supplier portal. Zero capabilities: signs in like a customer and gets a 404 on any Studio URL. |
| `customer` | no | Site visitors with an account. |

Two-step sign-in (TOTP) is mandatory for every role except `customer`
(`requiresTwoFactor`). For `supplier_portal` there is no Studio screen to enrol
from yet; the future portal must enrol them before showing anything.

## Capability matrix

`A` = admin, `S` = staff, `O` = operations_manager, `B` = booking_agent,
`Su` = support_agent, `C` = content_editor, `M` = marketing_manager,
`Ac` = accountant. `supplier_portal` and `customer` hold nothing.

| Capability | A | S | O | B | Su | C | M | Ac | Where it is enforced |
| --- | - | - | - | - | - | - | - | - | --- |
| `admin.access` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Studio entry, dashboard, inbox |
| `content.read` | ✓ | ✓ |  |  |  | ✓ | ✓ |  | Catalogue lists |
| `content.write` | ✓ | ✓ |  |  |  | ✓ | ✓ |  | Editors, taxonomy |
| `content.publish` | ✓ | ✓ |  |  |  | ✓ | ✓ |  | Publish / unpublish |
| `media.upload` | ✓ | ✓ |  |  |  | ✓ | ✓ |  | Media library |
| `translations.write` | ✓ | ✓ |  |  |  | ✓ | ✓ |  | Website texts |
| `orders.read` | ✓ | ✓ | ✓ | ✓ | ✓ |  |  | ✓ | Orders, suppliers list |
| `orders.fulfil` | ✓ | ✓ | ✓ | ✓ |  |  |  |  | Line delivery, supplier assignment, receipts |
| `bookings.confirm` (new) | ✓ | ✓ | ✓ | ✓ |  |  |  |  | Confirm order; record supplier confirmation |
| `orders.refund` | ✓ |  |  |  |  |  |  |  | Refunds |
| `payments.read` | ✓ | ✓ | ✓ |  |  |  |  | ✓ | Payments |
| `entitlements.grant` | ✓ |  |  |  |  |  |  |  | Manual map/VIP grants |
| `capacity.write` | ✓ | ✓ | ✓ | ✓ |  |  |  |  | Capacity, availability calendar |
| `prices.write` (new) | ✓ | ✓ | ✓ |  |  |  |  |  | Every stored price or cost: activity "from" price, package and child prices, seasonal prices, legacy and library add-on prices (and per-activity overrides), itinerary and package prices, plan prices, supplier offer cost and sell price (with `suppliers.write`), vehicle day rates, CSV cost import (`src/lib/auth/price-guard.ts`) |
| `customers.read` | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | Customers, entitlements list, duplicates |
| `customers.export` | ✓ |  |  |  |  |  |  |  | CSV exports of personal data |
| `customers.merge` | ✓ |  |  |  |  |  |  |  | Merge accounts |
| `leads.read` | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | Leads |
| `crm.write` | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  | Notes, tags, tasks, support |
| `discounts.write` | ✓ |  |  |  |  |  | ✓ |  | Discount codes |
| `finance.read` | ✓ |  |  |  |  |  |  | ✓ | Profit, payment checks |
| `suppliers.write` | ✓ |  |  |  |  |  |  | ✓ | Supplier costs, payables |
| `reports.read` (new) | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ | Reports, map analytics, the dashboard's period figures, scheduled report e-mails (Phase 5; was `orders.read`) |
| `vip.manage` (new) | ✓ |  | ✓ |  |  |  |  |  | VIP settings (was `config.write`) |
| `audit.read` | ✓ | ✓ | ✓ |  |  |  |  | ✓ | Audit log |
| `security.read` | ✓ | ✓ | ✓ |  |  |  |  |  | Protection pages |
| `security.write` | ✓ |  |  |  |  |  |  |  | Bans |
| `config.write` | ✓ |  |  |  |  |  |  |  | Settings, plans |
| `roles.write` | ✓ |  |  |  |  |  |  |  | Role on the customer page, notifications |
| `users.manage` (new) | ✓ |  |  |  |  |  |  |  | Studio → Team & permissions |
| `integrations.write` (new) | ✓ |  |  |  |  |  |  |  | Studio → Integrations |
| `system.read` (new) | ✓ |  |  |  |  |  |  |  | Studio → System health, `/api/health/deep` |

**Staff note.** `bookings.confirm` was split out of `orders.fulfil`,
`prices.write` out of `content.write` and `reports.read` out of `orders.read`.
Staff hold all three, so a
staff account can do exactly what it could before; the split exists so that a
content editor cannot change prices and a support agent cannot confirm
bookings. Without `prices.write`, every editor above still saves names, texts
and options but the server refuses a changed price ("Your role cannot change
prices"; `assertPriceChangeAllowed` in `src/lib/auth/price-guard.ts`, unit
tested in `price-guard.test.ts`). The Studio shows those price fields
read-only with a short note for such a role, so an ordinary save posts the
stored price back unchanged. Discount codes keep `discounts.write`.

**Links follow access too.** `src/app/(admin)/_lib/route-access.ts` mirrors
the capability every Studio page requires (a unit test reads each page and
fails on drift); in-page links, dashboard shortcuts and report drill-downs to
a page the viewer cannot open are hidden or shown as plain text
(`StudioLink`). `scripts/admin-check.mjs` requests every visible Studio link
as each role and reports any that answers 404.

## Team management rules (Studio → Team & permissions)

- Only a role with `users.manage` manages accounts — today only `admin`.
- **No escalation:** the actor must already hold every capability of both the
  account's current role and the new one (`canAssignRole`). Tested for every
  pair of roles.
- Nobody changes or deactivates their own account there; the last active
  `admin` cannot be demoted or deactivated.
- Inviting: an existing customer account with that e-mail is given the role;
  otherwise an account is created without a password and Better Auth's reset
  e-mail lets the person choose one (link valid one hour, can be re-sent).
- Every change ends the account's sessions (so it applies immediately, not when
  the cookie cache expires), clears its two-factor session markers, and writes
  an `audit_log` row (`team.invite`, `team.add_existing`, `user.role`,
  `team.deactivate`, `team.reactivate`, `team.resend_invite`).
- Deactivation sets `users.status = 'inactive'` (sign-in refused, history kept).
