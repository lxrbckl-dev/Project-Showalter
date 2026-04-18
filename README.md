# Project Showalter

Booking + CMS site for Showalter Services — Sawyer Showalter's lawn care /
yard work business. Replaces a dead Linktree trial QR on `showalter.business`.
Single Next.js app serving both the public marketing page and the admin
console, backed by SQLite on a host volume.

For intent, design, and operations see:

- [BRIEF.md](./BRIEF.md) — project brief (client, scope, design direction)
- [STACK.md](./STACK.md) — tech stack, data model, flows
- PHASES.md — phased delivery plan (lands alongside Phase 0)
- [RUNBOOK.md](./RUNBOOK.md) — operations / deploy / backup / recovery

## Quickstart

```bash
pnpm install
cp .env.local.example .env.local
pnpm db:migrate          # creates ./dev.db and seeds site_config defaults
pnpm dev                 # http://localhost:3000
```

Production runs inside Docker on port **5827**; dev runs on **3000**.

## Scripts

- `pnpm dev` — Next.js dev server on port 3000
- `pnpm build` — production build (standalone output)
- `pnpm start` — run the production build on port 5827
- `pnpm lint` — eslint via `next lint`
- `pnpm test` — vitest unit tests (one-shot)
- `pnpm test:e2e` — playwright end-to-end tests
- `pnpm db:generate` — drizzle-kit migration generator
- `pnpm db:migrate` — apply SQL migrations under `./drizzle/`

## Environment

Every env var is documented in [`.env.example`](./.env.example). Migrations
run automatically at boot via Next.js `instrumentation.ts` — a failed
migration aborts startup rather than serving a half-migrated DB.

## Health

`GET /api/health` returns `{ "ok": true }` with HTTP 200. The Dockerfile's
`HEALTHCHECK` hits this route.
