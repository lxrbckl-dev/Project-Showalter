# Tech Stack — Project Showalter

This document captures the tech-stack decision for the Showalter Services site. Everything here is the current agreed-on direction; revise via PR if anything changes.

## Overview

| Layer              | Choice                                    | Why |
|--------------------|-------------------------------------------|-----|
| Framework          | **Next.js 15** (App Router)               | One codebase for public site + admin + API. Server actions simplify the CMS surface. React UI pairs well with the admin calendar. |
| Database           | **SQLite** via **Drizzle ORM**            | Single file, zero ops. Fits a one-user admin + low-write workload. Mounted via a host volume, easy to back up. |
| Auth               | **Auth.js** (credentials provider)        | Single admin account — no social-login surface area. Minimal dependencies. |
| UI                 | **Tailwind + shadcn/ui**                  | Fast to style. Pre-built calendar/date-picker, table, dialog components. Dark-green / black / white theme is trivially configurable via CSS variables. |
| Images             | **Next.js `Image`** (plain, no `sharp`)   | Good enough for one hero photo + a small gallery. Skipping `sharp` keeps the image pipeline simple. |
| Analytics          | **Umami** (self-hosted)                   | Privacy-friendly, lightweight, Dockerable. Tracks QR-scan → site-visit conversion without tracking individual visitors. |
| Email / SMS delivery | **Client-side `mailto:` and `sms:` URIs** | Sawyer sends confirmations from his own Gmail / phone. No server-side email provider, no from-address setup. |
| Container          | **Single Docker image**                   | Multi-stage build, runs on internal port **5827**. |
| Calendar integration | **Public `.ics` endpoint + Google render URL** | `.ics` served from `/bookings/<token>/ics`; Google via `calendar.google.com/calendar/render?...`. Both links embedded in the prefilled email body. |
| Data persistence   | **Host bind-mount** at `/data`            | SQLite DB file, uploaded images, and nightly backups all persist outside the container. |
| Backups            | **In-container cron**                     | Nightly `sqlite3 .backup` dump into `/data/backups/YYYY-MM-DD.db`, 14-day retention. |
| CI/CD              | **GitHub Actions → GHCR**                 | On merge to `main`, build and push `ghcr.io/lxrbckl-dev/project-showalter:{latest,<sha>}`. Alex pulls on the homelab. |
| Reverse proxy      | **Caddy** (on host)                       | TLS auto-provisioned via Let's Encrypt. Fronts `showalter.business`. |

## Data model (sketch)

SQLite, one schema. All admin-editable unless noted.

### `site_config`
Single-row table.
- `phone` TEXT
- `email` TEXT
- `tiktok_url` TEXT
- `bio` TEXT
- `sms_template` TEXT — so Sawyer can tweak wording without a deploy
- `hero_image_path` TEXT
- `booking_horizon_weeks` INTEGER — how many weeks ahead customers can book (default 4)
- `slot_duration_minutes` INTEGER — slot size in minutes (default 60)

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

### `admin_user`
Single-row table.
- `username` TEXT
- `password_hash` TEXT

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
- `end_at` TEXT          — ISO timestamp of slot end (start_at + slot_duration_minutes)
- `notes` TEXT (optional) — customer-provided notes at submission
- `status` TEXT          — one of: `pending` | `accepted` | `declined` | `completed` | `no_show` | `expired` | `canceled`
- `created_at` TEXT
- `decided_at` TEXT (nullable)

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
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_PASSWORD_HASH: ${ADMIN_PASSWORD_HASH}
```

## Environment variables

| Var                   | Purpose                                          |
|-----------------------|--------------------------------------------------|
| `AUTH_SECRET`         | Auth.js session secret (generate with `openssl rand -base64 32`) |
| `ADMIN_USERNAME`      | Sawyer's admin login username                    |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password                |
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

Slot generation from a window: each window is chopped into consecutive `slot_duration_minutes`-long slots starting at `start_time`. Leftover minutes that don't fit a full slot are discarded.

Example: Saturday template `[(10:00, 13:30)]` with 60-minute slots → slots at `10:00–11:00`, `11:00–12:00`, `12:00–13:00`. The final 30 minutes are discarded.

## Booking flow

```
Customer                                        Sawyer (admin)
───────                                         ──────────────
1. Opens /
2. Taps "Request service"
3. Sees next N weeks (N = booking_horizon_weeks)
4. Taps a day → sees open slots for that day
5. Taps a slot → form (name, phone, email,
   address, service, notes)
6. Submits ──────────────────────────────────▶  7. Slot becomes "held" (row in `bookings`
                                                   with status=pending; slot hidden from
                                                   public view)
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
                                                11. Slot is released (becomes visible
                                                    on the public site again).
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

`X` (expiration window) is TBD. Not implemented for MVP unless needed.

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

No third-party service is required (Apple / Google / Mozilla provide the push gateways for free; VAPID is a free W3C standard). This is not equivalent to Twilio / FCM / Resend — no account, no cost, no signup.

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
