# Known issues

Current as of the end of the build session. Resolved items are kept with
their diagnosis, because each cost real time and the reasoning is worth more
than the fix.

---

## Open

### 1. Unbacked brand claims

`/about` and the homepage present "500+ hand-picked places", "4.9★ traveler
rating" and "12k+ trips planned" as fact. Only "regions covered" is a live
count; the seed holds 9 map places. Replace with real aggregates or remove
before launch — these are the kind of claim a consumer-protection regulator
treats as a representation.

### 2. All imagery is generated placeholder

`scripts/seed-media.mjs` attached 52 generated SVG scenes so the layout can
be evaluated. They are clearly credited "Generated placeholder — replace
with licensed photography". Real photography imports through the admin media
library; the seed only fills rows where `hero_image_id` is null, so a
re-seed cannot paint over uploaded work.

### 3. Policy pages are placeholder prose

Terms, privacy, refund and cookies exist as real routes with a
"pending legal review" note. A **refund policy is a prerequisite for a
travel merchant account**, not a launch-week nicety.

### 4. Two-factor is enforced in development

TOTP is mandatory for staff and admin, which is right for production and
pure friction locally. Recommendation: gate on `NODE_ENV === 'production'`
so it is required where it matters and skipped on a developer's machine.
Left as-is pending a decision — "we'll add it back before launch" is how it
never gets added back.

### 5. Arabic and Indonesian copy is unreviewed

780 keys per locale, machine-carried from the handoff. Needs a native
speaker before launch.

---

## Resolved

### Locale self-redirect loop

`GET /` answered `307` with `Location: /` while emitting
`x-middleware-rewrite: /en` in the same response — every unprefixed English
route was unreachable.

Not a regression from our code: `src/i18n/config.ts` was byte-identical to
the commit where it last worked, and every *prefixed* locale was fine (`/ar`
and `/id` returned 200 across all routes including detail pages). That
isolated it to next-intl 4.13's `as-needed` handling of the unprefixed
default locale.

Fixed by switching `localePrefix` to `always`. English URLs are now
`/en/...` and `/` redirects to `/en`. Costs one redirect on the bare domain;
buys a working site and symmetry across locales, which removes a special
case from canonical tags and hreflang.

### Admin unreachable — 404 for a valid administrator

The proxy's "refuse the internal mount" guard was 404ing the admin it had
just routed to. A rewrite re-enters the proxy, and the guard could not
distinguish its own routed traffic from a direct request. Marking the
rewrite with a header did not help: the re-entry carries the **original**
pathname, so marker and path disagree, and the anti-forgery check then
rejected our own traffic with a 400.

The guard was removed rather than patched. It carried no security weight —
`requireCapability()` runs server-side inside every admin page and server
action, so `/studio` is exactly as protected as the configured path, and
rotating `ADMIN_BASE_PATH` still retires the old public URL.

### Admin 2FA enrolment page did not exist

`studio/security/` contained `actions.ts` but no `page.tsx`. An elevated
account was correctly redirected there to enrol and hit a 404, so the admin
was unreachable for everyone.

The page is the one admin route deliberately exempt from the two-factor
gate, because it is where the second factor is set up; gating it recreates
exactly that loop. It still requires an elevated session and 404s for
anonymous and customer visitors.

### Sign-in rejected from the browser

Better Auth answered `Invalid origin: http://localhost:3200` because
`BETTER_AUTH_URL` named port 3000 while the app served on 3200, and
`trustedOrigins` derives from it.

Notable for *how* it hid: curl sends no `Origin` header, so every
API-level check passed and the bug appeared not to exist. It only
reproduced from a real browser.

### Stale webhook cancelled paid orders

The state machine permits `paid -> cancelled` because an operator
cancelling a paid booking is legitimate. A *webhook* saying "failed" is not:
providers retry, and a failed first attempt is routinely delivered after the
successful retry that superseded it. Honouring it released the vehicle,
revoked the customer's access, and left a settled charge against a cancelled
order — undiscovered until the day of travel. Failure events now apply only
to orders still `pending`.

### Every activity with fixed departures was unbookable

`activities.time_slots` is authored as `HH:mm`; `cart_items.travel_time` is
a Postgres `time` column and reads back as `HH:mm:ss`. The raw string
compare never matched, so checkout reported `invalid_time_slot` with nothing
the traveller could change. Both sides are normalised now, with regression
tests.

Found by the integration suite. No amount of typechecking or unit testing
would have caught it — it needed a real column round-trip.

---

## Environment traps

Recorded in full in `local-setup.md`. In short:

- **The standalone build ships no static assets.** Pages return 200 while
  every stylesheet, script and image 404s, so the site renders unstyled.
  Use `pnpm start:standalone`.
- **The standalone server does not read `.env.local`.** Next only loads
  dotenv files in `dev` and `build`.
- **Docker Desktop may install per-user**, leaving `docker` off PATH while
  the engine runs fine.
- **`wsl -l -v` reporting no distributions is normal** while Docker is
  stopped.
- **Git Bash rewrites POSIX-looking env values** when invoking Windows
  executables, so `ADMIN_BASE_PATH=/studio-8f2a` can arrive mangled.

---

## A note on verification

Several bugs in this session survived because the checks that should have
caught them only asserted HTTP status codes. A page returning 200 tells you
almost nothing: the CSS can be entirely absent, a translation key can be
missing, sign-in can be refused, and the status stays green.

When verifying, assert the thing you actually care about — that the assets
resolve, that the gated data is absent from the payload, that the order
reached `paid`.
