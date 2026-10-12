# Bali Trips

Trilingual (English / العربية / Bahasa Indonesia) travel-booking platform for Bali —
activities, private drivers, itineraries, packages, and a freemium interactive map,
with an integrated admin tool.

RTL-first: Arabic is a primary language and the entire layout mirrors.

## Requirements

- **Node.js ≥ 20.9** (Next.js 16 requires it; Node 18 is EOL and will refuse to build)
- pnpm 9
- Docker (for Postgres and the PDF renderer)

## Getting started

```bash
pnpm install
cp .env.example .env.local     # then fill in the blanks
docker compose up -d           # Postgres on :5433, Gotenberg on :3001
pnpm db:migrate
pnpm db:seed                   # 831 rows from the design handoff
pnpm dev
```

Postgres binds host port **5433**, not 5432. A native Postgres on the
default port is common, and a silent collision means migrations and seeds
run against the wrong database.

The site runs at http://localhost:3000, with `/ar` and `/id` for the other locales.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pnpm test` | Unit + integration tests |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed content from the design handoff |
| `pnpm worker` | Background job worker |

## Layout

```
design/handoff/     Design reference (NOT built, NOT shipped) — the original
                    HTML/React prototype. bt-styles.css is the source of truth
                    for design tokens; the handoff README's token table is stale.
messages/           UI translations, 597 keys x 3 locales, extracted from the handoff
scripts/            One-off tooling (message extraction, asset generation)
src/app/            Next.js App Router
src/i18n/           Locale config, routing, request setup
src/styles/         Design tokens, base styles, font pipeline
```

## Things that will bite you

- **Never `next build` on the droplet.** It peaks at 1.5–3 GB and on the 4 GiB box
  the OOM killer takes Postgres, not Node — a deploy becomes a database outage.
  Builds run in CI.
- **Never call `cookies()` or `headers()` in the root layout.** It marks every page
  `private, no-store` and makes the entire site uncacheable at the edge, sending
  every visitor on a round trip to Singapore.
- **Use CSS logical properties** (`padding-inline`, `inset-inline-start`, `ms-`/`me-`)
  rather than left/right, or Arabic layouts rot silently.
- **Money is integer minor units plus a currency code**, everywhere. Never floats,
  never a bare `$`.

## Documentation

The full implementation plan — architecture, data model, phases, and a 65-item
corner-case analysis — lives outside this repo in the planning document.
