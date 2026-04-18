# PHASES

> **Status (as of 2026-04-18): all 12 phases complete.** This document is preserved as an implementation record. PRs by phase:
> - Phase 0: #24
> - Phase 1A/1B: #32, #34
> - Phase 2: #33
> - Phase 3A/3B/3C: #41, #40, #46
> - Phase 4: #42
> - Phase 5: #54
> - Phase 6: #58
> - Phase 7: #63
> - Phase 8A/8B: #64, #62
> - Phase 9: #68
> - Phase 10: #74
> - Phase 11: #76
> - Phase 12 (split): #52 (SEO), #53 (PWA), #57 (Umami), #67 (error pages + a11y), #73 (deploy runbook)
> - Post-phase: #78 (multi-device passkey)

Each phase maps to one PR and one shippable milestone. A phase is not "done" until it can be deployed and exercised end-to-end — partial work stays on its branch until the whole phase is ready. This keeps main always green and deployable and gives QA a clean unit of review at every step.

---

## Cross-cutting conventions

- **Migrations per phase** — each phase adds its own Drizzle migration files. Migrations run on boot; the schema at any given commit matches what that phase shipped.
- **Tests per phase** — each phase ships with Vitest unit/integration tests and Playwright E2E tests covering the new flows introduced in that phase.
- **Phase 0 seed vs Phase 2 overlay** — Phase 0's initial migration seeds `site_config` with non-personal defaults (timezone, spacing, horizon, template bodies, stats thresholds, auto-publish flags). Phase 2 introduces the `SEED_FROM_BRIEF` env var, which overlays personal data (name, phone, bio, etc.) into those tables only when the target rows are empty — making it idempotent and safe to re-run.

---

### Phase 0 — Skeleton

**Ships:** Next.js 15 + App Router, Tailwind, shadcn init; Drizzle + SQLite + drizzle-kit; migrations-on-boot; healthcheck `/api/health`; GH Actions → GHCR on merge to main; non-root UID 1001:1001; `/data` volume; multi-stage Dockerfile; port 5827; Vitest + Playwright harness; service worker registration stub (push logic lands in Phase 8); initial migration seeds `site_config` defaults (timezone, spacing, horizon, all six template bodies, stats thresholds, auto-publish flags).

**Depends on:** —

---

### Phase 1 — Auth

**Ships:** Passkey enrollment/login via SimpleWebAuthn; `admins`, `credentials` (multi-device per admin via `device_type`), `recovery_codes` (hashed, single-use, auto-regenerate on use); `ADMIN_EMAILS` reconciliation on boot; `BOOTSTRAP_ENABLED`; CLI `admin:list/reset/disable/enable` (note: `admin:add` deferred — ADMIN_EMAILS + restart is source of truth); protected `/admin/*` routes; Auth.js v5 + SimpleWebAuthn adapter; minimal admin shell (nav + logout + unread badge placeholder).

**Depends on:** 0

---

### Phase 2 — Public landing (seeded)

**Ships:** `/` renders hero / bio / services / contact / buried "Text Sawyer directly" SMS link (from `site_config.phone` + `site_config.sms_template`); `SEED_FROM_BRIEF` env var is **idempotent** — fills personal data only when target tables are empty.

**Depends on:** 0

---

### Phase 3 — Admin CMS

**Ships:** Admin edits all `site_config` fields (including all six message templates, `business_founded_year`, stats toggles, timezone); CRUDs `services` with soft-archive; hero image upload; `site_photos` gallery (upload, caption, reorder, soft-archive); public page re-reads live from DB.

**Depends on:** 1, 2

---

### Phase 4 — Availability + schedule editor

**Ships:** `weekly_template_windows`, `availability_overrides`, `availability_override_windows` tables + admin UI; all booking-related settings editable; precedence rule (override → template → closed); start-time generator (discard-slack); timezone validated against `Intl.supportedValuesOf('timeZone')`; admin-only, no booking UI yet.

**Depends on:** 1

---

### Phase 5 — Booking flow + customer page

**Ships:** Public booking form (day → start-time → fields → photos); required fields: name, phone, address, service, start-time; optional: email, notes, photos; EXIF stripping via `exifr`; honeypot hidden field (silent 200 on bot fill); rate-limit middleware using `BOOKING_RATE_LIMIT_PER_HOUR` default 30; form validation (name ≤100, E.164 phone, RFC 5321 email, address ≤500, notes ≤2000); **`customers` + `customer_addresses` tables created here + matching logic (phone → email → create); address accumulation with `last_used_at` bump**; `bookings` (with `customer_id` + `address_id` FKs + `address_text` snapshot + `updated_at`) + `booking_attachments`; start-time hold = `[start_time − spacing, start_time + spacing]`; partial UNIQUE index on `bookings(start_at) WHERE status IN ('pending','accepted')`; `/bookings/<token>` page (view + cancel); zero-availability empty state.

**Depends on:** 3, 4

---

### Phase 6 — Admin inbox + booking management

**Ships:** Inbox grouped by status + "Needs attention" view (accepted + past); accept/decline actions; reschedule = cancel + recreate (old token page shows rescheduled pointer to new token); admin-initiated bookings (status=`accepted`, soft warnings only on spacing/advance-notice, "pick existing customer or create new" selector); customer cancel → `notifications` row (kind=`booking_canceled_by_customer`); `notifications` table schema (id, kind, payload_json, read, created_at); unread badge + inbox page with mark-as-read; admin header strip stats ("Pending: X · Confirmed this week: Y"); optimistic locking via `bookings.updated_at`.

**Depends on:** 5

---

### Phase 7 — Confirmations + calendar

**Ships:** Mailto/SMS buttons on booking detail; template variable interpolation with **unknown variables rendered as literal text (no crash)**; all six templates used at their right moments; `.ics` at `/bookings/<token>/ics` with VALARM 24h reminder; Google Calendar render URL; `/c/<token>` explicit route (302 → ics on hit, 404 on miss).

**Depends on:** 6

---

### Phase 8 — Push + scheduled jobs

**Ships:** Service worker (production push logic); VAPID keys; `push_subscriptions` table; push dispatched on new booking submission + customer cancel + each reminder; **two cron schedules**: `*/15 * * * *` sweep for pending reminders (24h + 48h, in-app + push) and auto-expire (72h, status→expired, release hold); `0 3 * * *` nightly for SQLite backup + photo retention cleanup (booking + review photos); `cron_runs` table for health tracking; PWA manifest stub deployed so "Add to Home Screen" works on iOS.

**Depends on:** 6

---

### Phase 9 — Complete queue + reviews

**Ships:** Mark completed / no-show from Needs-attention queue; **`completed` is terminal for cancellation (no arrow to `canceled`)**; "Request review" button → mailto/SMS + creates pending `reviews` row with token; **`reviews.booking_id` nullable for standalone reviews**; `review_photos` table; `/review/<token>` public page (rating 1–5, text, optional photos, EXIF stripped, same caps as booking photos); auto-publish rule (rating ≥ `min_rating_for_auto_publish` AND `auto_publish_top_review_photos=true` → copies review photos to `site_photos` with `source_review_id` FK); admin Reviews section with search (rating/date/customer); only review photos auto-publish, not review text (reviews remain internal).

**Depends on:** 6, 7

---

### Phase 10 — INDEX book

**Ships:** Admin Index Book section (search via SQL `LIKE` on name/phone/email/address + customer detail view: master info + editable notes + address history + bookings chronological + reviews + photos from completed jobs); "Send review request" button on customer detail page creates a **standalone** review (`booking_id=NULL`). Customers/addresses tables + matching logic already landed in Phase 5; this phase is admin UI on top.

**Depends on:** 5, 9

---

### Phase 11 — Stats widget

**Ships:** Four stat cards on the landing page under hero: ⭐ avg rating + review count; completed jobs; distinct customers; years in business (from `business_founded_year`); gated by `show_landing_stats` + `min_reviews_for_landing_stats`; in-memory cache with 5-min TTL, invalidated by revalidation on booking/review writes.

**Depends on:** 9, 10

---

### Phase 12 — Polish + cutover

**Ships:** SEO (robots.txt + sitemap.xml + meta title/description + 1200×630 OG image + Twitter card tags); 404/500/invalid-token branded pages (invalid-token is vague to avoid enumeration); accessibility pass (keyboard nav, contrast, alt text, ARIA landmarks, WCAG 2.1 AA best-effort, `axe-core` wired into Playwright CI); PWA manifest + icons + favicon finalized; **Umami analytics container in docker-compose + Caddyfile block for `analytics.showalter.business`**; final image build → push → homelab deploy → Caddyfile update (main domain + umami subdomain).

**Depends on:** all prior

---

## Parallelization notes

The dependency graph has three windows where phases can run concurrently:

- **After Phase 0:** Phases 1, 2, and 4 are all independent of each other and can be developed in parallel — 1 needs only 0, 2 needs only 0, 4 needs only 1 (but can be started in parallel with 2 once 1 is done).
- **After Phase 6:** Phases 7 and 8 both depend solely on 6 and can run in parallel with each other.
- **After Phase 9:** Phases 10 and 11 can run in parallel — 10 depends on 5 and 9, 11 depends on 9 and 10, so 10 starts immediately after 9 while 11 waits for both.

In practice: a two-agent setup can exploit the Phase 0 and Phase 6 windows to compress the timeline by roughly 2–3 phases.

---

## Critical path

`0 → 1 → 3 → 5 → 6 → 7/8 → 9 → 11 → 12` (~9 sequential gates)
