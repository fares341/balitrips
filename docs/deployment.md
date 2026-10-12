# Staging deployment

Live at **https://staging.balitrips.co** on a DigitalOcean droplet in SGP1
(`174.138.26.163`). The production domain `balitrips.co` is untouched and
still served by Hostinger.

## Stack

Six containers via `docker-compose.prod.yml`, memory-budgeted for 2 vCPU /
3.8 GiB: Caddy (TLS, HTTP/3), app-blue and app-green (blue/green), a worker,
Postgres 17, and Gotenberg for PDFs. Plus 2 GiB of swap — with under 4 GiB of
RAM, swap is what stops the OOM killer taking Postgres during a spike.

## Things that had to be solved, so they are not rediscovered

**The image build needs a database.** `next build` prerenders every content
page, so `generateStaticParams` queries Postgres *at build time*. The order is
therefore: start Postgres, migrate, seed, *then* build. Building first fails
with "Failed to collect page data", which reads like a code fault.

**BuildKit sandboxes RUN steps.** Putting the builder on the compose network
is not enough — the build must also be granted the builder's network:

```bash
docker buildx create --name balibuilder --driver docker-container \
  --driver-opt network=bali_backend \
  --buildkitd-flags "--allow-insecure-entitlement network.host" --use

docker buildx build --allow network.host --network host \
  --target runner -t bali-app:local --build-arg DATABASE_URL="$DB" --load .
```

Passing `--network bali_backend` to the build instead is rejected outright.

**Never source an env file to derive another.** A duplicated key with an empty
value silently won, which left Caddy with a blank `ACME_EMAIL` and a parse
error that pointed at the Caddyfile rather than the env file. Extract literally:

```bash
for k in SITE_DOMAIN ACME_EMAIL ADMIN_BASE_PATH; do grep "^$k=" .env.production; done > caddy.env
```

**Build on the droplet only while nothing else runs.** It worked here because
Postgres was the sole container up. Once traffic is real, builds belong in CI.

## Secrets

`.env.production` is root-owned, `0600`, and never leaves the droplet.
`app.env`, `caddy.env` and `postgres.env` are derived from it. Postgres,
Better Auth, Payload and webhook secrets were generated *on the box* with
`openssl rand`.

The GitHub deploy key is read-only and scoped to this repository, so a
compromised droplet cannot push code.

## Production switch (batch 5)

Set `LIVE_MODE=true` on the real server (see `.env.production.example`). It
forces admin 2FA on and refuses sandbox payments whatever else the env file
says, and the Studio dashboard lists any remaining configuration gaps.

**Rotate every secret.** The previous `.env.production`, `app.env`,
`postgres.env` and a database dump (admin password hash, live sessions) were
shipped inside the project archive. Generate new `POSTGRES_PASSWORD`,
`BETTER_AUTH_SECRET`, `PAYMENT_WEBHOOK_SECRET`, change the admin password, and
treat the old values as public.

## Not production-ready

- `PAYMENT_PROVIDER=sandbox` with `ALLOW_SANDBOX_PAYMENTS=true`. **Cannot take
  real money.** Both must go before launch.
- One Spaces bucket in **SFO3** while the droplet is in **SGP1** — every image
  crosses the Pacific, and public images share a bucket with paid PDFs. Split
  into `bali-public` / `bali-private` in SGP1, with separate keys.
- Imagery is generated placeholder; policy pages are placeholder prose.
- Open defects in `known-issues.md`, notably that rate limiting trusts a
  client-set `x-forwarded-for`. That matters more on a public host than it did
  locally.
