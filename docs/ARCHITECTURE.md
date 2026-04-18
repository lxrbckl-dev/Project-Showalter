# Architecture — file structure and conventions

Canonical reference for how this repo is laid out. Adopted before Phase 1 so
the scaffold doesn't need to be reshuffled once real features start landing.

## TL;DR

- **Hybrid: route-grouped UI + feature-based domain modules.** Next.js App
  Router handles routing via `src/app/(public)/` and `src/app/(admin)/` route
  groups; all non-UI domain logic lives in `src/features/<domain>/` and is
  imported by routes (no business logic in `src/app/**`).
- **Per-domain schema files** under `src/db/schema/<domain>.ts`, re-exported
  from `src/db/schema/index.ts`. One growing file is a common Drizzle pain
  point — splitting early avoids it.
- **Colocated unit tests** (`foo.ts` + `foo.test.ts`) for anything under
  `src/`. **E2E tests** live in `tests/e2e/` (Playwright). **Integration
  tests** that want a dedicated dir can live in `tests/unit/` if they don't
  fit next to a source file.
- **Kebab-case file names** everywhere (`site-config.ts`, `booking-state.ts`).
  React components are the one exception: `PascalCase.tsx`.
- **No barrel files except at schema and feature boundaries.** Inside a
  feature, import modules directly — `import { validateBooking } from
  '@/features/bookings/validate'`. Barrels (`index.ts`) are used only at
  `src/db/schema/` (Drizzle needs a single import target) and at each
  `src/features/<domain>/index.ts` once the domain has a stable public API.

## Top-level layout

```
<repo-root>/
├── docs/                            # design + ops reference
│   ├── BRIEF.md
│   ├── STACK.md
│   ├── PHASES.md
│   ├── RUNBOOK.md
│   └── ARCHITECTURE.md              # ← this file
├── drizzle/                         # SQL migration files (drizzle-kit output)
├── public/                          # static assets served as-is
├── src/                             # application source
│   ├── app/                         # Next.js App Router — ROUTES ONLY (thin)
│   ├── components/                  # shared React components
│   ├── db/                          # Drizzle client + per-domain schema
│   ├── features/                    # domain modules (auth, bookings, …)
│   ├── lib/                         # cross-cutting utilities (no deps on features)
│   ├── server/                      # long-running server infra (boot, cron, …)
│   ├── cli/                         # CLI entry points (`admin:list`, …)
│   └── instrumentation.ts           # Next.js entry hook (`src/` layout lives here, not repo root)
├── tests/                           # tests that don't colocate
│   ├── e2e/                         # Playwright end-to-end
│   └── unit/                        # optional — integration-style Vitest specs
├── next.config.ts                   # Next.js config (MUST be at root)
├── tailwind.config.ts               # Tailwind config (MUST be at root)
├── drizzle.config.ts                # Drizzle CLI config
├── vitest.config.ts                 # Vitest config
├── playwright.config.ts             # Playwright config
└── package.json
```

Config files stay at the repo root because Next.js / Drizzle / Tailwind /
Vitest / Playwright all look for them there by default — moving them just
costs path overrides.

## `src/app/` — routes only

Next.js App Router. **This directory contains routes, layouts, route
handlers, and route-specific UI fragments only.** Business logic, DB access,
and dispatcher calls are imported from `src/features/**`.

```
src/app/
├── layout.tsx                       # root HTML shell (loads globals.css, SW registration)
├── globals.css
├── page.tsx                         # temporary Phase 0 placeholder
├── api/
│   └── health/route.ts              # GET /api/health
├── (public)/                        # route group — marketing + booking + customer pages
│   ├── layout.tsx                   # (Phase 2) public chrome
│   ├── page.tsx                     # (Phase 2) long-scroll landing
│   ├── bookings/[token]/
│   │   ├── page.tsx                 # (Phase 5) customer booking page
│   │   └── ics/route.ts             # (Phase 7) .ics download
│   ├── review/[token]/page.tsx      # (Phase 9) review submission
│   └── c/[token]/route.ts           # (Phase 7) SMS shortlink (302 → /bookings/<token>/ics)
└── (admin)/                         # route group — admin app
    ├── layout.tsx                   # (Phase 1) auth guard + admin chrome (bottom tab bar / sidebar)
    └── admin/
        ├── login/page.tsx           # (Phase 1) passkey login + enrollment
        ├── dashboard/page.tsx       # (Phase 6) header strip + Needs-attention queue
        ├── inbox/page.tsx           # (Phase 6) bookings inbox
        ├── schedule/page.tsx        # (Phase 4) weekly template + overrides
        ├── services/page.tsx        # (Phase 3) services CRUD
        ├── content/page.tsx         # (Phase 3) site_config + templates
        ├── gallery/page.tsx         # (Phase 3) site_photos manager
        ├── index-book/page.tsx      # (Phase 10) customers directory
        ├── reviews/page.tsx         # (Phase 9) reviews moderation
        └── settings/page.tsx        # (Phase 3+6) misc settings, push enroll, etc.
```

**Why two route groups?** Route groups (`(public)` / `(admin)`) let the
public and admin surfaces have independent layouts (different chrome,
different auth) while sharing the same URL namespace. The admin layout
wraps its children in an auth gate; the public layout does not. Neither
group's parenthesized name appears in the URL.

**Phase 0 placeholder.** The current `src/app/page.tsx` is the minimal "Phase
0 skeleton" stub. Phase 2 moves this into `src/app/(public)/page.tsx` and
replaces its body with the real landing.

**Route handlers call features, never DB directly.** A route handler like
`api/bookings/route.ts` reads `import { createBooking } from
'@/features/bookings/service'` — it doesn't `getDb()` on its own. This keeps
routes thin and the domain testable without spinning up Next.

## `src/features/<domain>/` — domain modules

Each domain is a folder containing everything you need to reason about that
domain in one place: data access, services, validators, types, domain-level
tests. A feature folder's typical contents (when populated):

```
src/features/bookings/
├── index.ts                         # public API (re-exports what other features import)
├── service.ts                       # orchestration (createBooking, acceptBooking, …)
├── queries.ts                       # read-side DB queries
├── state.ts                         # state machine (pending → accepted → completed, etc.)
├── availability.ts                  # start-time generation + spacing/hold logic
├── validate.ts                      # Zod schemas for public POST bodies
├── tokens.ts                        # random-token generation for /bookings/<token>
├── types.ts                         # row-shape-adjacent domain types
└── *.test.ts                        # colocated unit tests
```

Per-phase population:

| Phase | Feature folders populated |
|-------|---------------------------|
| 1     | `auth/`                   |
| 2     | `site-config/` (read-side only) |
| 3     | `site-config/` (write-side), `services/`, plus `site-photos/` skeleton |
| 4     | `availability/`           |
| 5     | `bookings/`, `customers/` (matching) |
| 6     | `bookings/` (admin), `notifications/` (inbox side) |
| 7     | `bookings/` (interpolation + ICS rendering) — calendar helpers live in `lib/calendar/` |
| 8     | `notifications/` (push dispatch), cron jobs in `src/server/cron/` |
| 9     | `reviews/`, `site-photos/` (auto-promote) |
| 10    | `customers/` (INDEX book UI layer backed by this feature) |
| 11    | `stats/` (new feature folder added here) |

**Cross-feature dependency rule.** Features may import from
`lib/`, `db/`, and `server/logger/`. They may NOT import from
`src/app/**` (routes depend on features, not the other way around) and
should not import sideways from sibling features — if two features need
shared logic, promote it to `lib/` or a dedicated third feature. This
keeps the dependency graph acyclic and the domains substitutable.

**No DB access outside `db/` + `features/**`.** Components never import
Drizzle directly. Route handlers, server actions, and CLI entry points
always call into a feature.

## `src/components/` — shared React

```
src/components/
├── ui/                              # shadcn/ui primitives (Button, Dialog, Calendar, …)
├── public/                          # shared between (public) pages (Hero, PriceTable, …)
└── admin/                           # shared between (admin) pages (BottomTabBar, StatusChip, …)
```

**Route-specific components live next to the route.** If a component is only
used by one page, put it in a `_components/` folder inside that page's dir
(Next.js ignores underscore-prefixed folders for routing). `src/components/`
is for components reused across two or more routes.

## `src/lib/` — cross-cutting utilities

Pure, framework-agnostic helpers with no domain knowledge and no DB access.

```
src/lib/
├── utils.ts                         # cn() — Tailwind class merger
├── utils.test.ts                    # colocated test (example pattern)
├── validators/                      # shared Zod schemas (phone, email, address, …)
├── formatters/                      # phone/date/money display helpers
├── interpolation/                   # [name], [service], … template interpolator (Phase 7)
├── calendar/                        # .ics generation + Google render URL (Phase 7)
├── crypto/                          # token generation helpers (Phase 5)
└── rate-limit/                      # IP-based rate limiter (Phase 5)
```

**Rule of thumb:** if it needs a DB row, it's a feature, not a lib. If it's
pure in-and-out data transformation with no I/O, it's a lib.

## `src/db/` — Drizzle client + schema

```
src/db/
├── index.ts                         # getDb() / getSqlite() — the only place that opens SQLite
├── migrate.ts                       # migration runner (called by src/server/boot.ts)
└── schema/
    ├── index.ts                     # re-export barrel (Drizzle imports this)
    ├── site-config.ts               # Phase 0
    ├── admins.ts                    # Phase 1
    ├── credentials.ts               # Phase 1
    ├── recovery-codes.ts            # Phase 1
    ├── services.ts                  # Phase 3
    ├── uploads.ts                   # Phase 3
    ├── site-photos.ts               # Phase 3
    ├── availability.ts              # Phase 4 (weekly_template_windows + overrides)
    ├── customers.ts                 # Phase 5 (customers + customer_addresses)
    ├── bookings.ts                  # Phase 5
    ├── booking-attachments.ts       # Phase 5
    ├── notifications.ts             # Phase 6
    ├── push-subscriptions.ts        # Phase 8
    ├── cron-runs.ts                 # Phase 8
    ├── reviews.ts                   # Phase 9
    └── review-photos.ts             # Phase 9
```

**Why one file per domain?** By Phase 12 this schema has ~15 tables. A single
`schema.ts` becomes painful to navigate (`git blame` is noisy, merge
conflicts spike, the file ends up >800 lines). One file per domain keeps
each unit small, makes history easy to follow, and lets each phase's
migration PR be reviewed next to its schema addition.

**Barrel is required here.** Drizzle's client takes a single `schema`
object — `import * as schema from '@/db/schema'` works because
`schema/index.ts` re-exports every table. New domain files are added to
`schema/index.ts` in the phase that introduces them.

## `src/server/` — long-running server infrastructure

```
src/server/
├── boot.ts                          # called by src/instrumentation.ts; runs migrations + reconcile + seed
├── logger/                          # structured JSON logger wrapper
├── cron/                            # cron job definitions (Phase 8)
│   ├── sweep.ts                     # */15 * * * *  — reminders + auto-expire
│   ├── nightly.ts                   # 0 3 * * *     — backup + photo cleanup
│   └── index.ts                     # registry consumed by the scheduler
└── notifications/                   # in-app + Web Push dispatcher (Phase 6, 8)
    ├── dispatcher.ts                # entry point — takes a kind + payload, fans out
    ├── in-app.ts                    # writes notifications rows
    └── push.ts                      # sends Web Push via web-push lib
```

**Why split dispatcher from the `notifications/` feature?** The feature
folder owns the notifications inbox domain (read unread, mark read, list
for admin UI). The server dispatcher owns outbound fan-out. Separating
them prevents the circular dependency where "sending a notification"
lives next to "reading the inbox" and both try to import each other.
The feature imports the dispatcher; the dispatcher does not import the
feature (it writes via `db/` directly, within its own narrow slice).

## `src/cli/` — CLI entry points

`pnpm admin:list`, `pnpm admin:reset <email>`, `pnpm admin:enable <email>`,
etc. Each CLI file is a small `tsx`-runnable script that imports the
relevant feature and prints to stdout.

```
src/cli/
├── admin-list.ts                    # prints each admin: email, active, enrolled_at, device_count
├── admin-reset.ts                   # clears credentials + recovery_codes for an admin
├── admin-disable.ts                 # active=false
├── admin-enable.ts                  # active=true
├── admin-list-invites.ts            # prints every admin invite + derived status
└── admin-revoke-invite.ts           # revoke by token prefix (#83)
```

Wired in `package.json` scripts as `"admin:list": "tsx src/cli/admin-list.ts"`
etc. Docker exec'd in production:
`docker exec showalter pnpm admin:list`.

## Tests

Two styles coexist:

- **Colocated unit tests** (`foo.ts` + `foo.test.ts`) — the default for
  anything under `src/`. Vitest picks these up via
  `include: ['src/**/*.test.ts']`.
- **`tests/e2e/`** — Playwright end-to-end specs. Each `*.spec.ts` drives a
  real browser against a running server.
- **`tests/unit/`** — reserved for integration-style Vitest specs that
  don't want to sit next to a single source file (e.g. a cross-feature
  scenario). Also covered by the Vitest include pattern.

**Why colocated?** New contributors can find the spec for a file by
opening the folder; refactors that rename or move a file bring its test
along automatically; the test is in the reviewer's diff without hunting
for it. Vitest scales fine with colocated files.

**Why a separate `tests/e2e/`?** Playwright specs drive a *running* app
via HTTP — they don't import source files. They belong in their own tree
and have their own tsconfig-ish expectations. This is the standard
Playwright convention.

## Naming conventions

| Kind                       | Convention                 | Examples                              |
|----------------------------|----------------------------|---------------------------------------|
| TypeScript modules         | kebab-case `.ts`           | `site-config.ts`, `admin-reset.ts`    |
| React components           | PascalCase `.tsx`          | `BookingForm.tsx`, `StatusChip.tsx`   |
| Test files                 | `<source>.test.ts`         | `utils.test.ts`, `availability.test.ts` |
| Playwright specs           | `*.spec.ts`                | `home.spec.ts`, `booking.spec.ts`     |
| Next.js route files        | Framework-defined          | `page.tsx`, `layout.tsx`, `route.ts`  |
| Folders                    | kebab-case                 | `site-photos/`, `booking-attachments/` |
| DB table names             | snake_case plural          | `bookings`, `booking_attachments`     |
| Drizzle table exports      | camelCase singular-looking | `bookings`, `bookingAttachments`      |
| SQL migration files        | `NNNN_description.sql`     | `0000_initial.sql`, `0001_admins.sql` |

## Path alias

Single alias: `@/*` → `./src/*` (configured in `tsconfig.json` and mirrored
in `vitest.config.ts`). Internal imports always use `@/...` — never
relative `../../..` chains across feature boundaries. Within a single
folder, relative imports (`./validate`, `./types`) are fine.

## Architectural invariants

These are enforced by convention + code review. If they start getting
violated, add lint rules.

1. **No DB access from React components.** Only features (and the CLI /
   cron / dispatcher directly below them) call `getDb()`. Components
   receive data via server components' direct function calls or via
   server actions that proxy through a feature.
2. **No direct imports between sibling features.** If `bookings` needs
   something from `customers`, either `customers` exposes it through
   `customers/index.ts` (and `bookings` imports the public surface only)
   or the shared piece is promoted to `lib/`.
3. **No business logic in `src/app/**`.** Route handlers and server
   actions call features; they don't implement domain rules inline.
4. **Migrations are append-only.** Never edit a committed migration. Add a
   new one to amend the schema. (Drizzle's `_migrations` bookkeeping
   table in `src/db/migrate.ts` enforces this by filename.)
5. **Config is read via features, not env vars sprinkled throughout.**
   Access to `process.env.*` is concentrated at the edges (instrumentation,
   boot, a dedicated env-parsing module). Feature code receives typed
   config objects.
6. **No credentials in logs, error bodies, PR descriptions, or snapshot
   fixtures.** See STACK.md "Observability" — scrubbed at the logger
   boundary.
7. **Features stay server-only unless marked otherwise.** A feature file
   with `'use server'` action wrappers is fine; a feature importing
   React browser APIs is not. Browser-only helpers belong in
   `components/` or `lib/` with no server imports.

## Phase-by-phase growth summary

| Phase | Biggest structural addition |
|-------|------------------------------|
| 0     | Initial scaffold (this PR: restructure only, no new code) |
| 1     | `features/auth/`, `cli/admin-*.ts`, admin route group shell, 3 schema files |
| 2     | `app/(public)/page.tsx` populated; `features/site-config/` read-side |
| 3     | `features/services/`, `features/site-photos/` skeleton, admin CMS pages |
| 4     | `features/availability/`, admin schedule page |
| 5     | `features/bookings/`, `features/customers/`, public booking flow |
| 6     | `features/notifications/` inbox side, admin inbox page |
| 7     | `lib/interpolation/`, `lib/calendar/`, ICS + Google link routes |
| 8     | `server/cron/`, `server/notifications/push.ts`, service worker + VAPID wiring |
| 9     | `features/reviews/`, `features/site-photos/` auto-promote |
| 10    | Admin INDEX book page on top of existing `features/customers/` |
| 11    | `features/stats/` (new), landing stats band component |
| 12    | SEO + a11y polish, no structural change beyond `public/` additions |

No phase in this plan requires reshuffling an earlier phase's folders.
That's the test the structure was designed against.
