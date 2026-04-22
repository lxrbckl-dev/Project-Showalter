# syntax=docker/dockerfile:1.7

# ─── deps ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app

# better-sqlite3 needs a C toolchain at install time; runtime only needs the
# compiled .node artifact, so these deps stay out of the final runner image.
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json pnpm-lock.yaml* .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ─── builder ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# Rebuild-time toolchain for any native deps pulled in during build.
RUN apk add --no-cache python3 make g++ libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# BASE_URL is required at build time because `next build` statically
# generates routes (robots.txt, sitemap.xml, opengraph-image, etc.) that
# bake absolute URLs into the output. Runtime .env still drives
# dynamically-rendered pages. Override with:
#   docker build --build-arg BASE_URL=https://staging.example.com
ARG BASE_URL=https://sawyer.showalter.business
ENV BASE_URL=$BASE_URL

RUN pnpm build

# ─── runner ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5827
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/data/sqlite.db

# Non-root user per Next.js standalone convention.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Data volume — sqlite.db, uploads/, backups/ all persist here.
RUN mkdir -p /data && chown -R nextjs:nodejs /data
VOLUME ["/data"]

# Standalone output: server.js + minimal runtime. Static + public assets go in
# their expected places.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs:nodejs

EXPOSE 5827

# Healthcheck hits the route handler. `wget` ships with alpine by default.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --spider --tries=1 http://localhost:5827/api/health || exit 1

CMD ["node", "server.js"]
