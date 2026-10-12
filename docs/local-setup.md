# Local setup

## Node

Requires **Node ≥ 20.9** — Next.js 16 and Vitest 4 both refuse to run on
Node 18, which reached end of life in April 2025. `.nvmrc` pins 22.20.0.

## Database

Postgres runs in Docker on **host port 5433**, not 5432.

```bash
docker compose up -d postgres
pnpm db:migrate      # 37 tables + order_number_seq
pnpm db:seed         # 831 rows from the design handoff, idempotent
```

The non-standard port is deliberate. A developer machine commonly already
has a native Postgres on 5432, and a silent collision means migrations and
seeds run against the wrong database — which is exactly what happened here
during development, surfacing as a confusing auth error.

Verify which one you are talking to:

```bash
docker exec bali-postgres psql -U bali -d bali -c "select current_database();"
```

### Seed contents

| Table | Rows |
|---|---|
| regions / categories | 5 / 13 |
| activities (+ categories) | 15 (+31) |
| itineraries | 8 |
| **itinerary_days** | **54** (44 with an activity, 10 authored free days) |
| packages (+ activities, regions) | 6 (+22, +14) |
| landmarks | 8 |
| map_places | 9 (4 free, 5 gated) |
| articles (+ categories) | 6 (+5) |
| reviews | 12 |
| driver_vehicles | 3 |
| translations | 685 |

No media is seeded — every image in the handoff is a `loremflickr`
placeholder, so `heroImageId` is null throughout and licensed photography
is imported separately.

The seed is safely re-runnable: it upserts on natural keys and only
overwrites handoff-derived columns, so `status`, `publishedAt`, `timeSlots`,
`leadTimeHours`, `maxGuests`, `fleetSize` and `version` are written once at
insert and a re-seed cannot revert an admin's edits.

## Builds need a database

`next build` prerenders every content page, so `generateStaticParams`
queries Postgres at build time. **A build against an empty or unreachable
database fails.** That is the intended trade-off — the alternative is
silently shipping a site with no content — but it means CI migrates and
seeds before building, and so must any deployment pipeline.

## Docker on Windows

Docker Desktop may install per-user rather than to `Program Files`. If
`docker` is not on your PATH, look in:

```
%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin
```

Docker Desktop also creates its `docker-desktop` WSL distro on startup and
removes it on exit, so `wsl -l -v` reporting no distributions while Docker
is stopped is normal and does not mean WSL is broken.

## Verified end to end

Against Postgres 17.10 with the seed loaded, serving the production build:

| Check | Result |
|---|---|
| Migrations | 37 tables + `order_number_seq` |
| Seed | 831 rows, idempotent across repeat runs |
| Build | 51 statically prerendered locale pages |
| Public routes | all 200 in en / ar / id |
| Unknown slugs | **404**, not the handoff's silent fallback to record #1 |
| Arabic | `<html lang="ar" dir="rtl">` |
| Admin, signed out | **404** — does not confirm the path exists |
| **Map paywall** | gated place names **and coordinates** absent from the anonymous payload |

The paywall result is the one that matters most. The prototype shipped every
locked place's name, coordinates, rating and image to every browser and hid
them behind `•••••` and a CSS blur. The check greps the served HTML for each
gated place's name and both coordinates and asserts absence, so it fails if
that regression ever returns.

### Running the built server locally

`.next/standalone/server.js` does **not** read `.env.local` — Next only
loads dotenv files in `next dev` and `next build`. Export the environment
first or the process boots without `DATABASE_URL` and every dynamic route
500s:

```bash
set -a; . ./.env.local; set +a
PORT=3200 node .next/standalone/server.js
```

On the droplet this is supplied by the systemd unit or compose `env_file`,
so it only bites when running the built output by hand.

### The standalone build does not include static assets

`output: 'standalone'` emits a self-contained server that deliberately
**excludes `.next/static` and `public/`** — Next expects the deploy step to
place them. The Dockerfile does. Running the built output by hand does not.

The failure is misleading: the server boots, every page returns **200**, and
every stylesheet, script, font and image **404s**. The site renders as
unstyled HTML, which looks like a CSS bug rather than a packaging one. Route
smoke tests that only assert HTML status codes pass throughout.

Use the helper, which copies the assets and loads `.env.local`:

```bash
pnpm build
pnpm start:standalone 3200
```

When checking a build by hand, assert that the assets referenced by the HTML
actually resolve — not just that the page returned 200.
