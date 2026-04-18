# Showalter Services

**A self-hosted lawn-care business website — public booking flow + admin CMS + review pipeline, deployed via Docker**

Status: **Built · 12 phases · 435 unit + 54 E2E tests**

---

## What this is

Showalter Services is a real, production website built for Sawyer Showalter's 15-year-old lawn-care business. Customers scan a QR code on a door hanger, land on `showalter.business`, and can book an appointment in under a minute. Sawyer gets a push notification, reviews the request from his phone, taps Accept, and fires off a confirmation SMS or email from his own number and Gmail — no server-side email provider required. Self-hosted on Alex's homelab behind Caddy + Docker, the whole thing is under his full control and costs nothing beyond the domain.

---

## Who it's for

- **Customers** — scan QR, pick a day + time, submit a booking (with optional photos), get a tokenized `/bookings/<token>` page to view or cancel, and receive a personalized confirmation from Sawyer's own phone/email.
- **Sawyer (operator)** — logs in via passkey (Face ID / Touch ID) from his phone, reviews bookings, accepts/declines/reschedules, marks jobs completed, requests reviews, and manages every piece of site content from the admin panel.
- **Alex (maintainer)** — Dockerized, deployable on his homelab via a single `docker compose up` + Caddy reverse proxy. One container, one SQLite file, zero managed services.

---

## Key features

### Public site
- Long-scroll landing with hero, stats band, about, photo gallery, services + prices, contact, and a buried SMS fallback
- Booking flow: pick a day → pick a start time → fill form (name, phone, address, service, optional notes + photos) → tokenized booking page to view or cancel
- Zero-availability state: friendly "no openings right now" message when the horizon is empty
- All content live-rendered from the DB; anything Sawyer edits in the admin updates instantly

### Admin (passkey-secured)
- Multi-device passkey login via Face ID / Touch ID — no passwords, no email OTP
- Inbox: pending queue + "needs attention" + history; accept / decline / reschedule / mark completed / mark no-show
- One-tap confirmation delivery: `mailto:` / `sms:` from Sawyer's own accounts (no server email dependency)
- Six editable message templates for every confirmation, decline, and review-request scenario
- Reviews: request from completed bookings (or standalone), customer submits via `/review/<token>`, 4+★ photos auto-publish to the landing gallery
- INDEX book: customer directory with search, address history, booking history, editable notes
- Content CMS: site config, all message templates, services CRUD, hero + gallery photo uploads
- Availability editor: weekly template + per-date overrides + settings (horizon, spacing, advance notice)
- Web Push notifications on iOS/Android when installed as a PWA
- Device management: add, rename, and remove passkeys; last-device guard prevents self-lockout

### Ops
- Single Docker container; SQLite on a bind-mounted `/data` volume; Caddy reverse proxy
- Scheduled jobs via `node-cron`: nightly SQLite backups (14-day retention), photo retention cleanup, 24h/48h pending-booking reminders, 72h auto-expire
- Umami analytics (self-hosted, side-by-side container)
- Structured stdout logging captured by Docker
- Full test suite: 435 unit + 54 E2E (Playwright with virtual WebAuthn authenticators)

---

## Architecture snapshot

```
          Internet
             │
             ▼
   ┌────────────────────┐
   │   Porkbun DNS      │  showalter.business → Alex's homelab public IP
   └─────────┬──────────┘
             │
             ▼
   ┌────────────────────┐
   │   Caddy (host)     │  TLS via Let's Encrypt, reverse proxy
   └─────────┬──────────┘
             │ localhost:5827
             ▼
   ┌────────────────────┐
   │  showalter (Docker)│  Next.js app on port 5827
   │                    │  mounts /data
   └─────────┬──────────┘
             │
             ▼
   ┌────────────────────┐
   │  /data (bind-mount)│  sqlite.db, uploads/, backups/
   └────────────────────┘
```

See [`docs/STACK.md`](./docs/STACK.md) for the full deployment topology, `docker-compose.yml`, and Caddyfile snippet.

---

## Quickstart (local development)

**Prerequisites:** Node 22, pnpm 10

1. Clone the repo
2. Install dependencies:
   ```
   pnpm install
   ```
3. Copy the env file (it has sane dev defaults and inline comments):
   ```
   cp .env.example .env.local
   ```
4. Run migrations (creates `./dev.db`):
   ```
   pnpm db:migrate
   ```
5. Start the dev server with Sawyer's brief data pre-seeded:
   ```
   SEED_FROM_BRIEF=true pnpm dev
   ```
6. Open `http://localhost:3000`

**First-time admin setup:**

1. Visit `/admin/login`. Since the admins table is empty on a fresh DB, the
   page renders the **founding-admin** form. Enter your email and enroll a
   passkey (WebAuthn works on `http://localhost` without TLS).
2. Save the recovery code shown once.
3. Invite additional admins from `/admin/settings/admins`: enter their email
   (and an optional friendly label), click **Create invite**, and share the
   generated URL with them. The invite is single-use, email-bound, and
   expires 24 hours after it was created.

No `ADMIN_EMAILS` / `BOOTSTRAP_ENABLED` env vars required — they were
retired in #83.

**Helpful commands:**

```
pnpm dev                     # dev server on :3000
pnpm build                   # production build (standalone output)
pnpm start                   # run the built standalone (requires asset copies — see Dockerfile)
pnpm test                    # vitest unit tests
pnpm test:e2e                # playwright E2E (spins up a prod-ish webServer)
pnpm db:migrate              # apply pending migrations
pnpm db:generate             # generate migration from drizzle schema changes
pnpm lint                    # eslint via next lint
pnpm admin:list              # list admins + their enrollment state
pnpm admin:reset <email>     # clear credentials + recovery code for an admin
pnpm admin:disable <email>   # soft-disable an admin
pnpm admin:enable <email>    # re-enable an admin
pnpm admin:list-invites      # list outstanding + historical invites
pnpm admin:revoke-invite <token-prefix>  # revoke an invite by token prefix
```

---

## Deployment

See [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) §6a for the full deploy procedure — image pull, compose up, Caddyfile configuration, first-boot passkey enrollment, and VAPID key generation. Don't duplicate it here.

---

## Documentation index

| File | What it covers |
|------|---------------|
| [`docs/BRIEF.md`](./docs/BRIEF.md) | Original product brief — the client, the business context, the design direction, and what was asked for |
| [`docs/STACK.md`](./docs/STACK.md) | Canonical technical reference — data model, env vars, availability model, booking flow, deployment topology, scheduled jobs |
| [`docs/PHASES.md`](./docs/PHASES.md) | Implementation plan and phase-by-phase record (all 12 phases complete) |
| [`docs/FEATURES.md`](./docs/FEATURES.md) | Detailed feature walkthrough organized around user journeys |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Code organization, file-structure conventions, per-directory intent |
| [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) | Operational procedures — deploy, backups, passkey recovery, accessibility testing, incident response |

---

## Tech stack

Next.js 15 · React · TypeScript · Tailwind · shadcn/ui · Drizzle + better-sqlite3 · Auth.js + SimpleWebAuthn · node-cron · web-push · Umami · Caddy · Docker

---

## Contributing / license

This is a private project built for Sawyer's business — not open-source in the traditional sense. If you're forking it to build your own self-hosted booking site for a small service business, PRs welcome.
