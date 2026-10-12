# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Bali Trips production image.
#
# Built in CI, never on the droplet: `next build` peaks at 1.5-3 GB and on a
# 4 GiB box the OOM killer takes Postgres, turning a deploy into a database
# outage.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app


# --- deps: install once, cached on the lockfile ---------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile


# --- builder --------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholders. Real secrets are injected at runtime, never baked
# into a layer — anyone who can pull the image can read its layers.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# `next build` prerenders every content page, so generateStaticParams queries
# Postgres AT BUILD TIME. Without a reachable database the build does not warn
# — it fails with "Failed to collect page data".
#
# Passed as a build arg rather than baked: it is only needed while building,
# the runtime value comes from env_file, and a connection string in an image
# layer is readable by anyone who can pull the image.
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

# NEXT_PUBLIC_* are INLINED into the client bundle by `next build`. Supplying
# them only at runtime does not "fall back" -- it compiles `undefined` into the
# JavaScript the browser downloads, and the failure is invisible until a user
# hits the feature. They must carry their real values HERE.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CDN_URL
ARG NEXT_PUBLIC_DEFAULT_CURRENCY
ARG NEXT_PUBLIC_CONTACT_EMAIL
ARG NEXT_PUBLIC_WHATSAPP_NUMBER
ARG NEXT_PUBLIC_WHATSAPP_DISPLAY
ARG NEXT_PUBLIC_SOCIAL_INSTAGRAM
ARG NEXT_PUBLIC_SOCIAL_TIKTOK
ARG NEXT_PUBLIC_SOCIAL_YOUTUBE
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}     NEXT_PUBLIC_CDN_URL=${NEXT_PUBLIC_CDN_URL}     NEXT_PUBLIC_DEFAULT_CURRENCY=${NEXT_PUBLIC_DEFAULT_CURRENCY}     NEXT_PUBLIC_CONTACT_EMAIL=${NEXT_PUBLIC_CONTACT_EMAIL}     NEXT_PUBLIC_WHATSAPP_NUMBER=${NEXT_PUBLIC_WHATSAPP_NUMBER}     NEXT_PUBLIC_WHATSAPP_DISPLAY=${NEXT_PUBLIC_WHATSAPP_DISPLAY}     NEXT_PUBLIC_SOCIAL_INSTAGRAM=${NEXT_PUBLIC_SOCIAL_INSTAGRAM}     NEXT_PUBLIC_SOCIAL_TIKTOK=${NEXT_PUBLIC_SOCIAL_TIKTOK}     NEXT_PUBLIC_SOCIAL_YOUTUBE=${NEXT_PUBLIC_SOCIAL_YOUTUBE}

# The admin path is compiled into generated admin links, so the build needs the
# deployment's real value rather than the placeholder default.
ARG ADMIN_BASE_PATH
ENV ADMIN_BASE_PATH=${ADMIN_BASE_PATH}

# getPaymentProvider() throws when neither a real provider nor the sandbox
# opt-in is configured, and prerendering evaluates it.
ARG PAYMENT_PROVIDER
ARG ALLOW_SANDBOX_PAYMENTS
ENV PAYMENT_PROVIDER=${PAYMENT_PROVIDER}     ALLOW_SANDBOX_PAYMENTS=${ALLOW_SANDBOX_PAYMENTS}

# A PLACEHOLDER, deliberately -- never the real secret.
#
# src/lib/auth/server.ts throws `BETTER_AUTH_SECRET is not set` whenever
# NODE_ENV=production and the variable is empty. This stage sets NODE_ENV
# =production above, so `next build` aborted with "Failed to collect page data"
# for the first prerendered page that imported the auth module, naming a route
# rather than the variable and pointing nowhere near the cause.
#
# The build needs the variable to EXIST, not to be correct: sessions are signed
# at request time with the value from env_file. Baking the real secret here
# would put it in an image layer, readable by anyone who can pull the image.
ENV BETTER_AUTH_SECRET=placeholder-for-build-only-replaced-at-runtime

RUN pnpm build


# --- runner ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]


# --- worker: same build, different entrypoint ------------------------------
# Background jobs (email, PDF generation, webhook retries, reconciliation).
# Separate container so a Gotenberg render or a stuck job cannot take the web
# process down with it.
FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs
CMD ["pnpm", "worker"]
