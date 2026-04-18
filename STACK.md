# Tech Stack — Project Showalter

This document captures the tech-stack decision for the Showalter Services site. Everything here is the current agreed-on direction; revise via PR if anything changes.

## Overview

| Layer              | Choice                                    | Why |
|--------------------|-------------------------------------------|-----|
| Framework          | **Next.js 15** (App Router)               | One codebase for public site + admin + API. Server actions simplify the CMS surface. React UI pairs well with the admin calendar. |
| Database           | **SQLite** via **Drizzle ORM**            | Single file, zero ops. Fits a one-user admin + low-write workload. Mounted via a host volume, easy to back up. |
| Auth               | **Auth.js + WebAuthn (passkeys); multi-admin via `ADMIN_EMAILS` env list** | One-tap biometric login. No passwords, no external email/SMS dependency for login. Admin slot count is env-configurable; unenrolled slots are gated by a BOOTSTRAP_ENABLED flag. |
| UI                 | **Tailwind + shadcn/ui**                  | Fast to style. Pre-built calendar/date-picker, table, dialog components. Dark-green / black / white theme is trivially configurable via CSS variables. |
| Images             | **Next.js `Image`** (plain, no `sharp`)   | Good enough for one hero photo + a small gallery. Skipping `sharp` keeps the image pipeline simple. |
| Analytics          | **Umami** (self-hosted)                   | Privacy-friendly, lightweight, Dockerable. Tracks QR-scan → site-visit conversion without tracking individual visitors. |
| Email / SMS delivery | **Client-side `mailto:` and `sms:` URIs** | Sawyer sends confirmations from his own Gmail / phone. No server-side email provider, no from-address setup. |
| Container          | **Single Docker image**                   | Multi-stage build, runs on internal port **5827**. |
| Calendar integration | **Public `.ics` endpoint + Google render URL** | `.ics` served from `/bookings/<token>/ics`; Google via `calendar.google.com/calendar/render?...`. Both links embedded in the prefilled email body. |
| Data persistence   | **Host bind-mount** at `/data`            | SQLite DB file, uploaded images, and nightly backups all persist outside the container. |
| Backups            | **In-container cron**                     | Nightly `sqlite3 .backup` dump into `/data/backups/YYYY-MM-DD.db`, 14-day retention; same cron also purges expired booking attachments. |
| CI/CD              | **GitHub Actions → GHCR**                 | On merge to `main`, build and push `ghcr.io/lxrbckl-dev/project-showalter:{latest,<sha>}`. Alex pulls on the homelab. |
| Reverse proxy      | **Caddy** (on host)                       | TLS auto-provisioned via Let's Encrypt. Fronts `showalter.business`. |

### Nightly cron

The nightly cron container runs two tasks: (1) SQLite `.backup` dump into `/data/backups/YYYY-MM-DD.db` with 14-day retention; (2) booking-photo retention cleanup per `photo_retention_days_after_resolve`.

## Data model (sketch)

SQLite, one schema. All admin-editable unless noted.

### `site_config`
Single-row table.
- `phone` TEXT
- `email` TEXT
- `tiktok_url` TEXT
- `bio` TEXT
- `sms_template` TEXT
- `hero_image_path` TEXT
- `booking_horizon_weeks` INTEGER (default 4)
- `min_advance_notice_hours` INTEGER (default 36) — hide candidate start times earlier than `now() + this value`; admin-configurable
- `start_time_increment_minutes` INTEGER (default 30)
- `booking_spacing_minutes` INTEGER (default 60)
- `max_booking_photos` INTEGER (default 3)
- `booking_photo_max_bytes` INTEGER (default 10485760)  — 10 MB
- `photo_retention_days_after_resolve` INTEGER (default 30)
- `timezone` TEXT (default `'America/Chicago'`)
- `business_founded_year` INTEGER (e.g. `2023`) — used by the landing-page stats widget
- `show_landing_stats` BOOLEAN (default true) — master toggle for the landing-page stats band
- `min_reviews_for_landing_stats` INTEGER (default 3) — stats band stays hidden until this many submitted reviews exist
- `min_rating_for_auto_publish` INTEGER (default 4) — reviews at or above this rating can auto-promote their photos
- `auto_publish_top_review_photos` BOOLEAN (default true) — master toggle for auto-promotion into `site_photos`
- `template_confirmation_email` TEXT — confirmation email body (admin-editable; default shipped, see Message templates)
- `template_confirmation_sms` TEXT — confirmation SMS body
- `template_decline_email` TEXT — decline email body
- `template_decline_sms` TEXT — decline SMS body
- `template_review_request_email` TEXT — review-request email body
- `template_review_request_sms` TEXT — review-request SMS body

### `services`
- `id` INTEGER PK
- `name` TEXT
- `description` TEXT
- `price_cents` INTEGER (nullable — for "TBD" services like snow)
- `price_suffix` TEXT — e.g. `+` for variable, empty for fixed
- `sort_order` INTEGER
- `active` BOOLEAN — soft-archive instead of delete

### `weekly_template_windows`
Recurring weekly pattern. Empty rows for a weekday = unavailable (opt-in model).
- `id` INTEGER PK
- `day_of_week` INTEGER  (0=Sun … 6=Sat)
- `start_time` TEXT      (HH:MM, 24h)
- `end_time` TEXT        (HH:MM, 24h)
- `note` TEXT (optional, e.g. "after school only")

### `availability_overrides`
One row per date that overrides the template.
- `date` TEXT PK         (YYYY-MM-DD)
- `mode` TEXT            ('open' | 'closed')
- `note` TEXT (optional)

### `availability_override_windows`
Windows used only when the matching override row has `mode='open'`.
- `id` INTEGER PK
- `date` TEXT FK → availability_overrides.date
- `start_time` TEXT
- `end_time` TEXT

### `admins`
One row per admin slot (seeded from `ADMIN_EMAILS` env var on boot).
- `id` INTEGER PK
- `email` TEXT UNIQUE
- `active` BOOLEAN (default true)     — soft-disable toggle (no deletions)
- `enrolled_at` TEXT (nullable)       — NULL until the passkey is registered
- `created_at` TEXT

### `credentials`
One row per passkey. An admin may enroll multiple devices (phone, laptop, tablet).
- `id` INTEGER PK
- `admin_id` INTEGER FK → admins.id
- `credential_id` TEXT UNIQUE
- `public_key` TEXT
- `counter` INTEGER
- `device_type` TEXT                  — e.g. "iPhone (iOS 17)"
- `created_at` TEXT

### `recovery_codes`
Exactly one active recovery code per admin (enforced by UNIQUE on `admin_id` where `used_at IS NULL`). When used, a new code is generated and shown once.
- `id` INTEGER PK
- `admin_id` INTEGER FK → admins.id
- `code_hash` TEXT                    — hashed at rest
- `used_at` TEXT (nullable)
- `created_at` TEXT

### `uploads`
- `id` INTEGER PK
- `path` TEXT
- `mime` TEXT
- `caption` TEXT (optional)
- `created_at` TEXT

### `bookings`
- `id` INTEGER PK
- `token` TEXT UNIQUE    — random unguessable token used in `/bookings/<token>/ics` URL
- `customer_id` INTEGER FK → customers.id
- `address_id` INTEGER FK → customer_addresses.id
- `customer_name` TEXT   — historical snapshot of what was entered at booking time (denormalized, preserved even if the customer record is later edited)
- `customer_phone` TEXT  — historical snapshot
- `customer_email` TEXT  — historical snapshot
- `service_id` INTEGER FK → services.id
- `start_at` TEXT        — ISO timestamp of slot start
- `notes` TEXT (optional) — customer-provided notes at submission
- `status` TEXT          — one of: `pending` | `accepted` | `declined` | `completed` | `no_show` | `expired` | `canceled`
- `created_at` TEXT
- `decided_at` TEXT (nullable)

### `booking_attachments`
Customer-uploaded photos attached to a booking submission.
- `id` INTEGER PK
- `booking_id` INTEGER FK → bookings.id
- `file_path` TEXT        — relative to `/data/uploads/bookings/<booking_id>/`
- `original_filename` TEXT
- `mime_type` TEXT
- `size_bytes` INTEGER
- `created_at` TEXT

### `customers`
Master customer directory (the INDEX book). One row per unique person Sawyer has served.
- `id` INTEGER PK
- `name` TEXT
- `phone` TEXT            — normalized to E.164 (e.g. `+19133097340`)
- `email` TEXT (nullable)
- `notes` TEXT            — admin-editable freeform notes
- `created_at` TEXT
- `updated_at` TEXT
- `last_booking_at` TEXT (nullable)

### `customer_addresses`
Every address a customer has used. A customer can have many.
- `id` INTEGER PK
- `customer_id` INTEGER FK → customers.id
- `address` TEXT
- `created_at` TEXT
- `last_used_at` TEXT

### `reviews`
One review per customer, optionally tied to a specific booking.
- `id` INTEGER PK
- `customer_id` INTEGER FK → customers.id
- `booking_id` INTEGER FK → bookings.id **(nullable — standalone reviews are supported for customers Sawyer served before the app existed)**
- `token` TEXT UNIQUE     — used in `/review/<token>`
- `status` TEXT           — `pending` | `submitted`
- `rating` INTEGER (nullable, 1–5)
- `review_text` TEXT (nullable)
- `requested_at` TEXT
- `submitted_at` TEXT (nullable)

Constraint: `UNIQUE(booking_id)` when `booking_id IS NOT NULL` — at most one review per booking; multiple standalone (booking-less) reviews for the same customer are allowed.

### `review_photos`
Customer-uploaded photos attached to a review.
- `id` INTEGER PK
- `review_id` INTEGER FK → reviews.id
- `file_path` TEXT
- `mime_type` TEXT
- `size_bytes` INTEGER
- `created_at` TEXT

### `site_photos`
Landing-page photo gallery. Mix of admin-uploaded shots and photos auto-promoted from high-rated reviews.
- `id` INTEGER PK
- `file_path` TEXT
- `caption` TEXT (nullable)
- `sort_order` INTEGER
- `active` BOOLEAN (default true) — soft-archive instead of delete
- `source_review_id` INTEGER FK → reviews.id (nullable) — set when the photo was auto-promoted from a review; stays `NULL` for admin-uploaded shots
- `created_at` TEXT

### `notifications`
Sawyer's in-app inbox.
- `id` INTEGER PK
- `kind` TEXT            — e.g. `booking_submitted`
- `payload_json` TEXT    — arbitrary JSON blob (e.g. booking_id)
- `read` BOOLEAN         — default false
- `created_at` TEXT

### `push_subscriptions`
One row per device Sawyer has subscribed for Web Push.
- `id` INTEGER PK
- `endpoint` TEXT UNIQUE — push service endpoint URL
- `p256dh` TEXT — client's public ECDH key (base64url)
- `auth` TEXT — auth secret (base64url)
- `created_at` TEXT

## Deployment topology

The admin is served at `showalter.business/admin` (same-origin path, not a subdomain) — one Next.js app handles both public and admin routes behind a single Caddy upstream.

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
   │   Caddy (host)     │  TLS, reverse proxy
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

## Caddyfile snippet

Add to `Caddyfile` on the homelab:

```caddy
showalter.business, www.showalter.business {
    encode zstd gzip
    reverse_proxy localhost:5827
}
```

If Caddy runs in Docker on a shared bridge network, replace `localhost:5827` with the container name (e.g. `showalter:5827`).

## `docker-compose.yml` (stub)

```yaml
services:
  showalter:
    image: ghcr.io/lxrbckl-dev/project-showalter:latest
    container_name: showalter
    restart: unless-stopped
    ports:
      - "5827:5827"
    volumes:
      - /srv/showalter/data:/data
    environment:
      NODE_ENV: production
      PORT: 5827
      BASE_URL: https://showalter.business
      AUTH_SECRET: ${AUTH_SECRET}
      ADMIN_EMAILS: ${ADMIN_EMAILS}
      BOOTSTRAP_ENABLED: ${BOOTSTRAP_ENABLED:-false}
      SEED_FROM_BRIEF: ${SEED_FROM_BRIEF:-false}
      BOOKING_RATE_LIMIT_PER_HOUR: ${BOOKING_RATE_LIMIT_PER_HOUR:-30}
```

## Environment variables

| Var                   | Purpose                                          |
|-----------------------|--------------------------------------------------|
| `AUTH_SECRET`         | Auth.js session secret (generate with `openssl rand -base64 32`) |
| `ADMIN_EMAILS`        | Comma-separated list of admin emails (e.g. `sshowalterservices@gmail.com,alex@lxrbckl.com`). Slot count = list length. Boot reconciles DB with this list. |
| `BOOTSTRAP_ENABLED`   | `true` allows unenrolled admin slots to register a passkey at `/admin/login`; `false` (production default) rejects enrollment and only accepts logins from already-enrolled admins. |
| `BASE_URL`            | `https://showalter.business` — used for absolute URLs, OG tags |
| `PORT`                | `5827`                                           |
| `VAPID_PUBLIC_KEY`    | Web Push public key (exposed to the client)      |
| `VAPID_PRIVATE_KEY`   | Web Push private key (server only — signs pushes) |
| `VAPID_SUBJECT`       | Contact URI for push services, e.g. `mailto:sshowalterservices@gmail.com` |
| `SEED_FROM_BRIEF`     | Default `false`. When `true` AND target tables are empty, pre-seed `services`, `site_config`, and `weekly_template_windows` from Sawyer's brief data on first boot. Idempotent — only seeds when tables are empty, won't wipe data later. |
| `BOOKING_RATE_LIMIT_PER_HOUR` | Default `30`. Generous IP-based rate limit on the booking-form endpoint; easy to tighten if attacked. |

## Healthcheck

`GET /api/health` returns `200 OK` with `{ "ok": true }`.

## Availability model

Availability is resolved per-date using this precedence:

1. **Date override takes priority.** If a row exists in `availability_overrides` for the date:
   - `mode='closed'` → the date is fully unavailable (ignore the template)
   - `mode='open'` → use the `availability_override_windows` rows for that date (replaces the template for that date)
2. **Otherwise fall back to the weekly template.** Look up `weekly_template_windows` rows for the date's `day_of_week`.
3. **Empty = unavailable.** If no template windows exist for that weekday, the day is closed. This is intentional (opt-in default): Sawyer explicitly opens days he can work rather than explicitly closing days he can't.

### Start-time generation

For each resolved window on a given date, generate candidate start times at `start_time_increment_minutes` granularity, starting at the window's `start_time`. A candidate whose **start + 1 slot increment** would exceed the window's `end_time` is discarded.

Example: Saturday window 10:00–14:00 with 30-minute granularity → candidates `10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30`.

Additionally, candidates are filtered by **minimum advance notice**: any candidate with `start_time < now() + min_advance_notice_hours` is hidden. The default is 36 hours (a day and a half) and is admin-configurable. This prevents edge-case bookings like 2:47 PM trying to book 3:00 PM the same day.

### Spacing / hold

When a `bookings` row exists with `status IN (pending, accepted)` at start time `T`, suppress any candidate start time within `booking_spacing_minutes` on either side of `T`. The range `[T - booking_spacing_minutes, T + booking_spacing_minutes]` is considered "held."

Example: same window, one pending booking at 11:00, 60-minute spacing → visible start times: `10:00, 10:30, 12:00, 12:30, 13:00, 13:30`. (11:00 itself is taken; 10:30 is within the back-buffer of 11:00; 11:30 is within the forward-buffer.)

Wait — correction: with 60-minute spacing, the held range around 11:00 is `[10:00, 12:00]`. So 10:00 and 10:30 both fall in the back-buffer. Re-derived visible start times: `12:30, 13:00, 13:30`.

When a booking transitions to `declined`, `expired`, or `canceled`, its held range is released and those start times reappear for other customers.

## Booking flow

```
Customer                                        Sawyer (admin)
───────                                         ──────────────
1. Opens /
2. Taps "Request service"
3. Sees next N weeks (N = booking_horizon_weeks)
4. Taps a day → sees open **start times** for that day (30-minute granularity by default, constrained to Sawyer's open windows)
5. Taps a start time → form (name, phone, email [optional], address, service, notes [optional], photos [optional, up to 3 by default])
6. Submits ──────────────────────────────────▶  7. Start-time hold: the range [start_time - spacing, start_time + spacing] is held (row in `bookings` with status=pending; overlapping start times hidden from public view)
                                                8. Notification lands in Sawyer's inbox
                                                   (badge appears on admin)
                                                9. Sawyer opens admin on his phone,
                                                   reviews, taps Accept or Decline.

                                                Accept path:
                                                10. status=accepted; decided_at=now
                                                11. Admin shows two buttons:
                                                    - "Send email confirmation"  → mailto:
                                                    - "Send text confirmation"   → sms:
                                                    Both open the native app prefilled.
                                                    Sawyer taps Send in the native app.

                                                Decline path:
                                                10. status=declined; decided_at=now
                                                11. Start-time hold is released (held range
                                                    becomes visible on the public site again).
                                                12. Optional: Sawyer uses the same two
                                                    buttons with a decline-template body.

                                                Later (lifecycle):
                                                - status=completed — marked after the job
                                                - status=no_show   — marked if customer
                                                                     didn't respond / didn't
                                                                     show
                                                - status=canceled  — either side cancels
                                                                     after confirmation
```

### Booking state machine

```
    submitted
        │
        ▼
     pending ───▶ declined ───▶ (slot released)
        │
        ▼
     accepted ───▶ completed
        │
        └──────▶ no_show
        │
        └──────▶ canceled

     (pending for > X days with no decision) ──▶ expired
```

Auto-expiration: a booking in `pending` for more than **3 days** automatically transitions to `expired` via the nightly cron. The start-time hold releases at that moment.

## Calendar integration

Two links go in every confirmation email:

1. **Google Calendar** — a `calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...&location=...` URL generated server-side when rendering the prefilled email body. One tap → event added on any Google account.
2. **Apple / universal** — `https://showalter.business/bookings/<token>/ics`. A public Next.js route handler that returns `Content-Type: text/calendar`. The `token` is a random unguessable string stored on the `bookings` row — no login required, but also not enumerable.

Both links are baked into the email body; the SMS body uses a short link to the `.ics` endpoint for brevity.

## Confirmation delivery

All confirmations flow through Sawyer's own devices:

- **Email** — admin button builds a `mailto:sshowalterservices@gmail.com?to=<customer_email>&subject=...&body=<URL-encoded body>` and triggers navigation to it on tap. Sawyer's iOS/Android Mail app opens with the body prefilled; he taps send. The email comes from his Gmail, not from a no-reply address.
- **SMS** — admin button builds an `sms:<customer_phone>?body=<URL-encoded body>` and triggers navigation. His Messages app opens prefilled; he taps send. The text comes from his own number (913-309-7340).

This simplification eliminates the need for any server-side email provider (Resend / SES / Mailgun / etc.) and removes from-address / deliverability concerns entirely. The only server-side dependencies are the `.ics` endpoint and the Google render URL (which is client-safe).

Caveat: this requires Sawyer to actually tap **Send** in the native app — the server cannot guarantee the message went out. Acceptable tradeoff for a small single-operator business.

## Authentication

The admin uses **passkeys** (WebAuthn) — a web-standard biometric login. No passwords, no external email/SMS provider needed for login. Admin slots are env-configurable.

### Multi-admin via env

`ADMIN_EMAILS` is a comma-separated list of admin emails:

```
ADMIN_EMAILS=sshowalterservices@gmail.com,alex@lxrbckl.com
```

The number of emails = number of admin slots. On boot, the app reconciles the `admins` table with this list:

- Email in env, not in DB → **insert** as pending (`active=true`, `enrolled_at=NULL`)
- Email in DB, not in env → **soft-disable** (`active=false`) — rows are never deleted (consistent with the platform's no-destructive-actions principle; preserves their credentials if they return)
- Email in both → no change

### Bootstrap safety flag

`BOOTSTRAP_ENABLED` gates first-time passkey enrollment:

- **`true`** — unenrolled admin slots accept new passkey registrations at `/admin/login`
- **`false`** (production default) — `/admin/login` rejects enrollment; only already-enrolled admins can sign in

Suggested onboarding flow: deploy with `BOOTSTRAP_ENABLED=true`, have each admin visit `/admin/login` on their device and enroll while you're watching, then flip to `false` and restart to close the enrollment window. Prevents an unenrolled slot from being hijacked by someone who guesses the admin URL.

### Enrollment flow (first time, per admin)

1. Admin opens `/admin/login` on their device (the installed PWA works best)
2. Types their email, submits
3. Server checks: email active, not yet enrolled, `BOOTSTRAP_ENABLED=true` → enter enrollment mode
4. WebAuthn `navigator.credentials.create()` is called; the browser triggers the OS's native biometric prompt (Face ID / Touch ID / Windows Hello / Android fingerprint)
5. Credential is persisted to `credentials`
6. Server generates a single recovery code, hashes it, stores in `recovery_codes`, shows the plaintext **once**
7. `admins.enrolled_at` is set

### Login flow (thereafter)

1. Admin opens `/admin/login`
2. Types email, submits
3. WebAuthn `navigator.credentials.get()` → biometric prompt → signed assertion returned
4. Server verifies against `credentials` → issues a session cookie (sliding TTL, ~30 days)

### Recovery code

- One active code per admin at a time
- Stored hashed
- Shown in plaintext **once** at enrollment
- Single-use: on successful recovery, a new code is generated and shown once

### Multiple devices per admin

An admin can enroll multiple passkeys over time (phone + laptop + tablet). Each enrollment appends a new row to `credentials` tied to the same `admin_id`. There is no cap in MVP.

### Permissions

All admins have equal permissions in MVP: any admin can CRUD any content, accept/decline any booking, edit availability, etc.

Out of scope for MVP:
- Role hierarchy (owner / member)
- Admin-manages-admin via UI
- Per-admin audit log of actions

### CLI commands

Documented for operations:

```bash
docker exec showalter pnpm admin:list
# → prints each admin: email, active, enrolled_at, device_count

docker exec showalter pnpm admin:reset <email>
# → clears that admin's credentials and recovery_code rows; admin returns to pending-enrollment state

docker exec showalter pnpm admin:disable <email>
# → sets active=false (equivalent to removing the email from ADMIN_EMAILS)

docker exec showalter pnpm admin:enable <email>
# → re-enables a previously disabled admin (email must still be in ADMIN_EMAILS for login to succeed)

docker exec showalter pnpm admin:add <email>
# → onboards a new admin without a container restart (inserts a pending admin row so the email can enroll at /admin/login next time BOOTSTRAP_ENABLED=true)
```

### Stack dependencies

- `@simplewebauthn/server` — server-side credential verification
- `@simplewebauthn/browser` — small client-side helper that wraps the WebAuthn browser APIs
- Auth.js v5 handles sessions, CSRF, and middleware (passkey-specific logic sits alongside its adapter)

## Seeding

The `SEED_FROM_BRIEF` env var (default `false`) controls first-boot seeding from Sawyer's brief data.

**What gets seeded** when `SEED_FROM_BRIEF=true`:

- `services` — the price-sheet entries (Trash Can Cleaning, Mowing, Clean ups, Raking, Snow removal) with their default descriptions, prices, and suffixes
- `site_config` — the single row populated with Sawyer's phone, email, TikTok, bio, SMS template, sensible defaults for horizon/spacing/photos, and the six shipped message-template bodies (see "Message templates")
- `weekly_template_windows` — a baseline weekly availability pattern

**Idempotency rule.** Each target table is seeded only when it's empty at boot. If any of the above tables already has rows, that table is skipped entirely — `SEED_FROM_BRIEF=true` will never wipe or overwrite existing data. This means it's safe to leave set in any environment: it only does work on a blank database.

**When to flip it.** Typical usage is `SEED_FROM_BRIEF=true` on the very first deploy, then leave it on — there's no harm in it after the initial seed because the idempotency check makes subsequent boots a no-op.

## Rate limiting and anti-spam

The public booking endpoint (`POST /api/bookings`) sits behind a small middleware layer that protects against low-effort abuse.

- **IP-based rate limit.** The middleware tracks submissions per source IP over a rolling one-hour window. When the count exceeds `BOOKING_RATE_LIMIT_PER_HOUR` (default `30`), subsequent submissions from that IP are rejected until the window rolls forward. The default is generous — it's meant to stop pathological bots, not throttle real customers.
- **Hidden honeypot field.** The booking form includes an invisible, non-labeled input (hidden via CSS, off-screen, and `tabindex="-1"` / `aria-hidden="true"`). Real users never touch it; naive scrapers fill every field they see. If the honeypot arrives non-empty, the server returns a silent `200 OK` as if the submission succeeded — no row is created, no notification fires, and the bot gets no signal that it was detected. This "pretend success" response is deliberate: returning a `4xx` would tip bots off to refine their payload.
- **Tightening under attack.** If Sawyer ever gets hit, lowering `BOOKING_RATE_LIMIT_PER_HOUR` (e.g. to 5) and restarting the container is enough to clamp down without a code change.

## Admin-initiated bookings

Sawyer frequently books walk-in and phone-call customers himself. The admin supports creating a booking manually from the bookings inbox.

- **Status starts at `accepted`.** Admin-initiated bookings skip the `pending` state entirely — Sawyer is the authority, so there's nobody to accept or decline the request.
- **Soft warnings, not hard blocks.** The normal public-flow guardrails (`min_advance_notice_hours`, `booking_spacing_minutes`) are surfaced as warnings in the admin UI when Sawyer is the creator, but they do not prevent submission. Sawyer can double-book himself or book something an hour from now if he wants to.
- **"Pick existing or create new" customer selector.** The form starts with a search input: type a name, phone, or address and pick a match from the INDEX book, or fall back to "create new customer." Selecting an existing customer optionally lets Sawyer reuse a saved address from `customer_addresses`.
- **Full confirmation flow still applies.** Admin-initiated bookings still get a random `token` and a `/bookings/<token>` page — Sawyer can tap the standard "Send email confirmation" / "Send text confirmation" buttons to ping the customer exactly as he would for public-flow bookings.

## Reschedule flow

Rescheduling is implemented as **cancel-old + create-new** rather than in-place editing. This keeps the state machine simple and the audit trail intact.

- **Old booking** transitions to `canceled` (`decided_at` set to now). Its start-time hold is released.
- **New booking** is created with a fresh random `token` and the new `start_at`. If the reschedule originated from the admin UI, it's an admin-initiated booking and starts at `accepted`; if the public flow ever exposes a reschedule path, the new booking would start at `pending` and follow the normal accept/decline loop.
- **Old `/bookings/<old-token>` page** renders a friendly "This appointment was rescheduled to [new date/time]. See your updated confirmation." message linking to `/bookings/<new-token>`. The rescheduled-to pointer is recorded so the old page can look it up.
- **Confirmation to the customer.** Sawyer taps the standard "Send email confirmation" / "Send text confirmation" buttons on the new booking to notify the customer. No automated rebroadcast.

## Complete / no-show queue

The admin dashboard surfaces a **"Needs attention"** section listing every `accepted` booking whose `start_at` is in the past.

- Each row has two buttons: **Mark completed** and **Mark no-show**.
- **Mark completed** transitions `status` to `completed` and unlocks a **"Request review"** button on the same row (and on the booking detail view). Tapping it generates a `pending` `reviews` row tied to this booking + customer, allocates a token, and opens the same `mailto:` / `sms:` buttons with the review-request templates populating the body.
- **Mark no-show** transitions `status` to `no_show`. No review prompt.
- Both transitions are terminal; the booking drops out of the queue once set.

## Reviews

Reviews replace the old `testimonials` concept. They support both booking-tied and standalone ("pre-app") customers, and they can optionally promote photos to the landing-page gallery.

**Lifecycle.** A review row is created in `pending` state at the moment Sawyer requests it (from the "Needs attention" queue or from a customer's INDEX page — see below). When the customer submits the `/review/<token>` form, the row transitions to `submitted` with `rating`, `review_text`, and `submitted_at` populated.

**Public form (`/review/<token>`).** No login required. Star rating (1–5), freeform text (optional), and optional photo upload. Photo caps mirror the booking attachment caps — `max_booking_photos` default 3 (admin-settable), same accepted MIME types and size limit. EXIF is stripped on upload (see "Conventions and defaults").

**Standalone review requests.** For customers Sawyer served before the app existed, the INDEX book's customer detail page has a **"Request review"** button that creates a `reviews` row with `booking_id = NULL`. The rest of the flow is identical. A customer can therefore have multiple `booking_id=NULL` reviews, but at most one review per specific `booking_id` (see the UNIQUE constraint).

**Auto-publish rule.** When a review transitions to `submitted`:

- If `rating >= site_config.min_rating_for_auto_publish` (default 4) **AND** `site_config.auto_publish_top_review_photos = true`, every attached `review_photos` row is copied into `site_photos` with `source_review_id` set to the review's `id`. The photo is immediately visible in the landing-page gallery.
- Admin can always set `site_photos.active = false` to hide an auto-promoted photo without touching the underlying review. The review itself is never auto-published — only its photos — so there is no "review moderation" problem.

**Moderation.** Reviews are internal by default. The admin can browse reviews, edit the rating/text for typo fixes, soft-archive via an `active` toggle on the review (if needed post-MVP), and the public landing page does not render review text at all — only the aggregate stats band pulls from them.

## INDEX book (customers directory)

The INDEX book is the admin's master customer directory. It's backed by the `customers` and `customer_addresses` tables.

**Matching rule (on new booking).** When a booking is submitted, the system tries to match the customer in this order:

1. By normalized phone (E.164) — strongest signal
2. By email (if phone doesn't match)
3. Otherwise, create a new `customers` row

When a match is found, the existing `customers.id` is reused and `bookings.customer_id` points to it. The booking's `customer_name` / `customer_phone` / `customer_email` are still captured as historical snapshots (they reflect exactly what the customer typed at booking time, even if the master record is later edited).

**Address accumulation.** On every booking, the submitted `address` string is matched against `customer_addresses` for that customer — if it already exists, `last_used_at` is bumped; otherwise a new row is inserted. `bookings.address_id` points to the matched/created row.

**Admin search.** The INDEX book top-level view is a search input plus a list of customers sorted by `last_booking_at` desc. The MVP uses SQL `LIKE '%q%'` across name / phone / email / address fields. If the directory ever outgrows it, switch to SQLite FTS5 — the data model doesn't have to change.

**Customer detail view.** Tapping a customer opens a page showing:

- Master info block — name, phone, email, timestamps (editable in an inline edit mode)
- Admin-only notes field (freeform, editable)
- Address history — every row from `customer_addresses`, most-recently-used first
- Bookings list — chronological, showing status and service
- Reviews — every review this customer has given, rating + text
- Photos — thumbnails of every photo attached to any of this customer's completed bookings

## Landing-page gallery

The landing page's photo gallery is backed by the `site_photos` table. Two sources feed it:

- **Admin-uploaded** — Sawyer uploads photos directly through an admin gallery manager (drag to reorder `sort_order`; toggle `active` to soft-archive). `source_review_id` stays `NULL` for these.
- **Auto-promoted** — photos from high-rated reviews are copied in automatically per the rule in "Reviews." `source_review_id` tracks the origin so the admin can always see which gallery photos came from which review, and removing a review (soft-archiving its row) can be cross-referenced with its promoted `site_photos`.

The landing page renders the gallery as a simple grid of `active=true` photos in `sort_order`. Tapping a photo on mobile opens a lightbox / enlarged view. The gallery section is hidden entirely if no active photos exist.

## Landing-page stats widget

A small stats band sits just under the hero on the landing page. It shows aggregate trust signals — no per-review text, no per-customer info.

**Stats shown (three, plus optional fourth):**

1. Average rating + review count — `AVG(rating)` and `COUNT(*)` across `reviews` where `status = 'submitted'`
2. Total completed jobs — `COUNT(*)` where `bookings.status = 'completed'`
3. Distinct customers served — `COUNT(DISTINCT customer_id)` across bookings in `completed` status
4. Years in business (optional) — `current_year - site_config.business_founded_year`, rendered only if the founded year is set

**Visibility gating.** The band is shown only when `site_config.show_landing_stats = true` **AND** the submitted-review count is at least `site_config.min_reviews_for_landing_stats` (default 3). This prevents the band from displaying "1 review, 5 stars" on day one.

**Performance.** The stats are computed on demand with a short in-memory cache (a few minutes is plenty — writes are rare). No dedicated stats table in MVP.

## Message templates

Six editable message templates live in `site_config` as TEXT columns. Each is shipped with a sensible default body (verbatim below) and is editable from admin settings. Templates support variable interpolation — the server substitutes bracketed placeholders against the booking/customer context before populating the `mailto:` / `sms:` body.

**Shipped defaults (verbatim):**

### Confirmation email — `template_confirmation_email`

```
Hi [name],

Confirming your appointment:

• Service: [service]
• Date: [date]
• Time: [time]
• Address: [address]

Add to calendar:
• Google: [google_link]
• Apple:  [ics_link]

— Sawyer
913-309-7340
```

### Confirmation SMS — `template_confirmation_sms`

```
Hi [name], this is Sawyer — you're confirmed for [service] on [date] at [time]. Reply here if anything changes. Add to calendar: [shortlink]
```

### Decline email — `template_decline_email`

```
Hi [name],

Thanks for reaching out about [service] on [date]. Unfortunately I'm not able to take it on that day — if a different date works, feel free to submit another request!

— Sawyer
913-309-7340
```

### Decline SMS — `template_decline_sms`

```
Hi [name], Sawyer here — can't do [service] on [date], sorry! If another day works feel free to book again.
```

### Review request email — `template_review_request_email`

```
Hi [name],

Thanks for letting me work on your [service] today! If you have a quick moment, I'd really appreciate a review — it helps a lot:

[link]

— Sawyer
913-309-7340
```

### Review request SMS — `template_review_request_sms`

```
Hi [name], thanks for the job today! If you have a sec, a quick review would mean a lot: [link] — Sawyer
```

### Supported variables per template

| Variable        | Confirmation email | Confirmation SMS | Decline email | Decline SMS | Review req. email | Review req. SMS |
|-----------------|:------------------:|:----------------:|:-------------:|:-----------:|:-----------------:|:---------------:|
| `[name]`        | ✓                  | ✓                | ✓             | ✓           | ✓                 | ✓               |
| `[service]`     | ✓                  | ✓                | ✓             | ✓           | ✓                 |                 |
| `[date]`        | ✓                  | ✓                | ✓             | ✓           |                   |                 |
| `[time]`        | ✓                  | ✓                |               |             |                   |                 |
| `[address]`     | ✓                  |                  |               |             |                   |                 |
| `[link]`        |                    |                  |               |             | ✓                 | ✓               |
| `[google_link]` | ✓                  |                  |               |             |                   |                 |
| `[ics_link]`    | ✓                  |                  |               |             |                   |                 |
| `[shortlink]`   |                    | ✓                |               |             |                   |                 |

Unknown variables in a template body are left as literal text (no crash) — this keeps Sawyer's edits forgiving.

## Landing-page section order

The public landing page is a single long-scroll page. Top-to-bottom section order (mirrors BRIEF.md):

1. **Hero** — photo + "15-year-old entrepreneur" tagline + primary **Request service** CTA
2. **Landing stats band** — aggregate only; hidden unless `show_landing_stats = true` AND submitted-review count ≥ `min_reviews_for_landing_stats`
3. **About / bio**
4. **Photo gallery** — `site_photos` where `active = true`, ordered by `sort_order`
5. **Services + price table**
6. **Request service** — repeat CTA
7. **Contact** — phone (plain text), email, TikTok
8. **Footer** — includes the buried "Text Sawyer directly" fallback link

## Notifications for Sawyer

Two layers, both in MVP:

1. **In-app badge + inbox** — the `notifications` table stores every event (new booking submitted, etc.); the admin shell shows an unread count. Always works, even if push fails or is disabled.
2. **Web Push via PWA** — real push notifications on Sawyer's phone when the app isn't open. Implemented using:
   - A service worker (`public/sw.js`)
   - The W3C `Notification` API
   - VAPID keys (self-generated via `npx web-push generate-vapid-keys`, stored as env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
   - The `web-push` npm package to dispatch notifications from the Next.js server
   - The `push_subscriptions` table to persist each device's subscription

   **iOS note:** iOS 16.4+ supports Web Push but ONLY for PWAs — Sawyer must tap **Share → Add to Home Screen** once, open the admin from the home-screen icon, and accept the notification prompt. After that, his phone buzzes on every new booking.

### Pending-booking reminders

If a booking remains in `pending` state, Sawyer receives two reminder notifications before the auto-expire:

- At the **24-hour mark** after submission — in-app inbox entry + Web Push.
- At the **48-hour mark** — in-app inbox entry + Web Push.
- At the **72-hour mark** the nightly cron transitions the booking to `expired` (no reminder — it's terminal).

Reminder dispatch is handled by the same scheduling mechanism that runs auto-expire (the nightly cron, or a more frequent scheduler if needed — implementation detail).

No third-party service is required (Apple / Google / Mozilla provide the push gateways for free; VAPID is a free W3C standard). This is not equivalent to Twilio / FCM / Resend — no account, no cost, no signup.

## Booking photos

Customers may optionally attach photos of the service area when submitting a booking — useful for oddly shaped yards, damage photos, accessibility notes, etc.

### Constraints (all admin-configurable)

| Setting                              | Default   | Purpose |
|--------------------------------------|-----------|---------|
| `max_booking_photos`                 | 3         | Max files per submission |
| `booking_photo_max_bytes`            | 10485760  | Max file size per file (10 MB) |
| Accepted MIME types                  | —         | `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp` (covers iOS + Android cameras) |

Required: no. Optional on every submission.

### Storage

Files are written to `/data/uploads/bookings/<booking_id>/<random>.<ext>` on the mounted host volume. One row per file in `booking_attachments` with `booking_id`, `file_path`, `original_filename`, `mime_type`, `size_bytes`, and `created_at`.

### Retention

A photo is auto-purged `photo_retention_days_after_resolve` days (default 30) after its booking reaches a terminal state (`completed`, `no_show`, `declined`, `expired`, `canceled`). Cleanup runs in the same nightly in-container cron that handles SQLite backups — it deletes both the file on disk and the `booking_attachments` row.

Photos attached to `pending` or `accepted` bookings are never auto-purged; they live as long as the booking does.

### Access model

- **Customer:** can view the photos they submitted on their `/bookings/<token>` page (the same unguessable-token URL used for the calendar `.ics` download).
- **Admin (Sawyer):** can view all photos of all bookings in the admin panel.
- **Public:** photos are NOT exposed anywhere on the public landing page or any public listing. The only public-ish surface is the tokenized booking page, which requires possession of the token URL.

## Customer booking page (`/bookings/<token>`)

A single public route (no login required) keyed by an unguessable random `token` stored on the `bookings` row. The same URL is given to the customer in the confirmation email/SMS and used for:

1. **Viewing the appointment** — service name + description, the scheduled start time, address on file, any notes they submitted, any photos they attached.
2. **Downloading the `.ics`** — the existing `/bookings/<token>/ics` endpoint is served from the same token root.
3. **Cancelling** — a "Cancel appointment" button transitions the booking to `canceled` and releases the start-time hold, freeing that time for other customers.
4. **Customer self-cancel triggers a Sawyer notification** — when the customer taps Cancel, Sawyer receives an in-app inbox entry and a Web Push: *"Customer cancelled: [service] on [date]"*.
5. **Rescheduled bookings** — if the booking was canceled via the reschedule path (see "Reschedule flow"), this page renders a "rescheduled to [new date/time]. See your updated confirmation." link to the new `/bookings/<new-token>`.

### State-dependent rendering

The page renders differently based on the current booking `status`:

| Status       | What the customer sees |
|--------------|------------------------|
| `pending`    | "Your request has been received — waiting for Sawyer to confirm." Cancel button active; no calendar button yet. |
| `accepted`   | Full appointment details + calendar download + cancel button |
| `declined`   | "Sawyer couldn't take this one — feel free to submit another request." No calendar, no cancel. |
| `canceled`   | "This appointment was cancelled." No actions. |
| `expired`    | "This request expired without a response — feel free to submit a new one." No actions. |
| `completed`  | "Thanks — see you next time!" Cancel hidden; calendar download still available if they want it. |
| `no_show`    | Same as completed (terminal state, no actions). |

### Security

The token is generated with `crypto.randomUUID()` (or equivalent 128-bit random) at booking creation. No enumeration is possible; the URL is unguessable. Sharing the URL with another person effectively delegates cancel-power — acceptable for a low-stakes single-operator business, but worth noting.

## Landing-page fallback: text Sawyer directly

In addition to the booking flow, the public landing page has a small buried link — "Have a question? Text Sawyer directly →" — at the bottom. Tapping it opens `sms:913-309-7340?body=<URL-encoded template>` where the template is Sawyer's original pre-booking SMS body:

```
Hi, this is [name here]. I'm interested in your services.

• Address:
• Type of service:
• Yard size:
• Preferred date:

Thanks!
```

### Operational note

Messages sent via this fallback land in Sawyer's native Messages app, entirely outside the application. There is no slot hold, no status tracking, no calendar integration, and no admin inbox entry for these conversations.

This is intentional — the fallback exists for "quick question" traffic (e.g. "do you do mulch?", "rate for a big yard?") that doesn't fit the rigid shape of the booking form. Sawyer carries two inboxes (admin + Messages); the booking form is still THE action and is visually primary.

## Conventions and defaults

A catch-all for cross-cutting defaults that apply across the app.

- **Photo EXIF stripping on upload** — both booking attachments and review photos have their EXIF metadata stripped at upload time (location data, device info, timestamps) before being written to `/data`. Originals are not preserved.
- **SMS shortlink for `.ics`** — the confirmation SMS uses a short `/c/<token>` shortlink that 302s to `/bookings/<token>/ics`, so the SMS stays under typical carrier length limits.
- **Form validation rules** — `name` ≤ 100 chars; `phone` US format, normalized to E.164 before storage; `email` RFC 5321-compliant; `address` ≤ 500 chars; `notes` ≤ 2000 chars. Validation runs both client-side (UX) and server-side (source of truth).
- **Admin nav pattern** — bottom tab bar on mobile, sidebar on desktop. Same routes, different chrome.
- **Retroactive settings policy** — changes to `site_config` (horizon, spacing, photo caps, template bodies, etc.) apply to **new** bookings and new messages only. Existing bookings preserve the state they were created with; they're not retroactively mutated.
- **Migrations on boot** — DB schema migrations run automatically at container startup, before the HTTP server accepts traffic. A failed migration aborts the boot instead of serving a half-migrated DB.
- **Friendly error pages** — branded 404 / 500 / invalid-token pages instead of raw stack traces. The invalid-token page (for `/bookings/<bad-token>` and `/review/<bad-token>`) is intentionally vague to avoid leaking enumeration signal.
- **SEO basics** — `robots.txt`, `sitemap.xml`, meta title / description on every public page, OG + Twitter card tags on `/`. The admin is `noindex`.
- **Calendar `.ics` reminder** — the served `.ics` includes a `VALARM` set to 24 hours before `start_at`, so the customer gets a day-before reminder automatically.
- **Phone number normalization** — phone numbers are stripped to digits and prepended with `+1` before storage (E.164). The display layer re-formats to US style for humans.
- **Accessibility target** — WCAG 2.1 AA on a best-effort basis. Focus-visible rings, alt text on images, sufficient color contrast, keyboard-navigable flows.
- **Admin dashboard header strip** — a tiny stat strip at the top of the admin home view surfacing counts of pending bookings and confirmed bookings this week. At-a-glance signal without opening any tab.

## Out of scope for this document

Scaffolding, feature implementation, and CI wiring will follow in separate PRs. This doc is the source of truth for *what* we're building on; *how* is tracked in those PRs.
