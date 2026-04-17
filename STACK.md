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
- `customer_name` TEXT
- `customer_phone` TEXT
- `customer_email` TEXT
- `customer_address` TEXT
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

### `testimonials`
- `id` INTEGER PK
- `author` TEXT
- `quote` TEXT
- `approved` BOOLEAN — default false
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
```

### Stack dependencies

- `@simplewebauthn/server` — server-side credential verification
- `@simplewebauthn/browser` — small client-side helper that wraps the WebAuthn browser APIs
- Auth.js v5 handles sessions, CSRF, and middleware (passkey-specific logic sits alongside its adapter)

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

## Out of scope for this document

Scaffolding, feature implementation, and CI wiring will follow in separate PRs. This doc is the source of truth for *what* we're building on; *how* is tracked in those PRs.
