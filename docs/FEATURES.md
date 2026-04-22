# Features — Showalter Services

A walkthrough of every major feature, organized around user journeys. For schema details, see [`STACK.md`](./STACK.md). For operational procedures, see [`RUNBOOK.md`](./RUNBOOK.md). For code organization, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Customer: book an appointment

The public booking flow lives at `/` (the landing page) → `/book` (the multi-step form). The customer:

1. Taps **Request service** on the landing page
2. Picks a date from the visible booking horizon (default: 4 weeks; admin-configurable)
3. Picks a start time from Sawyer's open windows for that day (30-min granularity by default)
4. Fills in name, phone, email (optional), address, service, notes (optional), and up to 3 photos (optional)
5. Submits — a `bookings` row is created with `status=pending` and the time slot is held

**Customer matching:** on submit, existing customers are matched by phone → email → new record. The address is added to `customer_addresses` and `address_text` is snapshotted on the booking for historical preservation.

**Security:** EXIF metadata is stripped from all uploaded photos (`exifr`). A honeypot hidden field silently accepts (and discards) bot submissions. An IP-based rate limit applies (`BOOKING_RATE_LIMIT_PER_HOUR`, default 30).

If no start times exist in the horizon, the UI shows a friendly "no openings right now, check back soon" message. See [`STACK.md`](./STACK.md#availability-model) for the availability resolver and spacing model.

---

## Customer: cancel an appointment

Each booking has a tokenized page at `/bookings/<token>` — the link embedded in Sawyer's confirmation message. From here, the customer can:

- View appointment details (service, time, address, photos)
- Download an `.ics` calendar file
- Cancel (only available for `pending` or `accepted` bookings)

Cancellation sets `status=canceled` and releases the held time slot. Once a booking is `completed`, the cancel button is hidden and the page reads "Thanks — see you next time!" The `completed` state is terminal for cancellation — see the full state machine in [`STACK.md`](./STACK.md#booking-flow).

---

## Sawyer: log in

Authentication uses **passkeys** (WebAuthn) via SimpleWebAuthn + Auth.js v5. No passwords.

**Founding admin (first person on a fresh deploy):**
1. Visit `/admin/login`. Because the admins table is empty, the page renders the founding-admin form.
2. Enter email, enroll a passkey (Face ID / Touch ID) — the ceremony opens the OS's native biometric prompt.
3. A recovery code is shown once — save it to a password manager.

**Invite another admin:** from `/admin/settings/admins`, fill in the invitee's email (and an optional label like "Mom" or "Saturday helper"), click **Create invite**, and copy the `/admin/signup?token=...` URL. Share however you want — invites are single-use, email-bound, and expire 24h after creation. If you need to undo one, click **Revoke** on that row.

**Accept an invite:** the invitee opens their URL. The page shows their pre-filled (read-only) email and an **Enroll passkey** button. After the ceremony they see their own recovery code and land on the admin dashboard.

**Multi-device support:** each device gets its own `credentials` row. An admin can enroll their phone, laptop, and tablet separately. Passkeys can be renamed or removed from `/admin/settings/devices`. A last-device guard prevents removing the only enrolled credential (which would lock out the account). See [`src/features/auth/`](../src/features/auth/).

**Recovery:** if all devices are lost, use the recovery code to reset credentials. A new code is issued on use. CLI: `pnpm admin:reset <email>`, then either the admin goes through the founding flow (if theirs was the only row AND you deleted it) or a co-admin issues a fresh invite.

---

## Sawyer: manage the inbox

The admin inbox at `/admin/bookings` shows bookings grouped by status:

```
Pending → [Accept] [Decline]
Accepted → [Mark Completed] [Mark No-Show] [Reschedule]
Needs Attention → accepted bookings whose start_at has passed
History → declined / expired / canceled / completed
```

**Accept/Decline:** sets `status` and `decided_at`. Accept shows two one-tap buttons:
- **Send email confirmation** — opens `mailto:` with the full confirmation body pre-filled (service, date, time, address, "Add to Google Calendar" link, "Add to Apple Calendar" link)
- **Send text confirmation** — opens `sms:` with a short pre-filled body + calendar shortlink

Both open Sawyer's native app. The email goes from his Gmail; the text goes from his phone. No server-side email provider.

**Reschedule:** implemented as cancel-old + create-new. The old `/bookings/<token>` page renders a "rescheduled to …" pointer.

**Admin-initiated bookings:** Sawyer can create a booking manually for walk-ins or phone calls. Status starts at `accepted`. Spacing/advance-notice rules show soft warnings only.

**Optimistic locking:** `bookings.updated_at` is checked on every write to prevent stale-state conflicts when Sawyer has two browser tabs open. See [`src/features/bookings/`](../src/features/bookings/).

**Six message templates** are editable from the admin CMS: confirmation email/SMS, decline email/SMS, review-request email/SMS. Variables are interpolated at send time; unknown variables render as literal text (no crash).

---

## Sawyer: mark completed + request reviews

From the **Needs Attention** queue (accepted bookings past their start time), Sawyer marks each booking `completed` or `no_show`.

**Request a review** from:
- A completed booking's detail page — creates a `reviews` row tied to that booking (`booking_id` set)
- The customer's INDEX page — creates a standalone review (`booking_id=NULL`), useful for customers Sawyer served before the app existed

The review-request button fires a `mailto:` or `sms:` with a link to `/review/<token>`. The customer submits their rating (1–5), optional text, and optional photos (EXIF stripped).

**Auto-publish pipeline:** if `auto_publish_top_review_photos=true` and the rating is ≥ `min_rating_for_auto_publish` (default 4), the review photos are automatically copied to `site_photos` with `source_review_id` set, and appear on the landing gallery. Review text is never auto-published — it stays internal. See [`src/features/reviews/`](../src/features/reviews/).

---

## Sawyer: manage content

The Content CMS at `/admin/content` covers:

- **Site config** — phone, email, TikTok URL, bio, timezone, all six message templates, stats band toggles, review auto-publish thresholds, photo caps, retention window
- **Services CRUD** — name, description, price, price suffix (`+` for variable), sort order, soft-archive toggle
- **Hero image** — upload a new hero photo; replaces the current one
- **Gallery** — upload photos, reorder via drag, soft-archive; shows source (`admin-uploaded` vs `auto-promoted from review`)

All content is live-rendered from the DB. Editing anything updates the public site on next page load with no rebuild. See [`src/features/site-config/`](../src/features/site-config/) and [`src/features/site-photos/`](../src/features/site-photos/).

---

## Sawyer: set availability

The Availability editor at `/admin/availability` has two layers:

**Weekly template** — which days of the week Sawyer is open, and the time windows for each day. Empty = unavailable (opt-in model — he explicitly opens days he can work).

**Per-date overrides** — override the template for a specific date: either open with custom windows, or force-close regardless of the template.

**Settings:**
- Booking horizon (weeks ahead customers can see)
- Start-time increment (15 / 20 / 30 / 60 min)
- Spacing (minutes held on either side of a booking)
- Minimum advance notice (hours; default 36)
- Timezone (validated against `Intl.supportedValuesOf('timeZone')`)

Precedence: date override → weekly template → closed. See [`STACK.md`](./STACK.md#availability-model) for the full resolver logic and start-time generation algorithm.

---

## Sawyer: look up a customer

The **INDEX book** at `/admin/customers` is a searchable customer directory. Search matches on name, phone, email, or address via SQL `LIKE`.

Each customer detail page shows:
- Master info: name, phone, email, normalized E.164 phone
- Address history (all addresses ever used, with `last_used_at`)
- Bookings chronological
- Reviews submitted
- Photos from completed jobs
- Editable notes field (freeform, saved in `customers.notes`)
- "Send review request" button — creates a standalone review link directly from the customer record

See [`src/features/customers/`](../src/features/customers/).

---

## Sawyer: push notifications

Web Push is implemented via VAPID + a service worker. When Sawyer installs the admin as a PWA ("Add to Home Screen" on iOS/Android), he can subscribe to push notifications from the admin Settings panel.

**Push dispatched on:**
- New booking submitted by a customer
- Customer cancels via their booking page
- Pending-booking reminder at 24h before start
- Pending-booking reminder at 48h before start
- Auto-expire of a pending booking past 72h

Each `push_subscriptions` row stores the endpoint, `p256dh` key, and auth secret. Multiple devices can be subscribed simultaneously. See [`src/features/push/`](../src/features/push/).

---

## Scheduled jobs

Two cron schedules run inside the container via `node-cron`. Every invocation is logged to the `cron_runs` table (task, started_at, ended_at, status, error_message) — visible in the admin's cron health widget.

```
*/15 * * * *   — Frequent sweep (time-sensitive)
  • 24h pending-booking reminder (in-app + push)
  • 48h pending-booking reminder (in-app + push)
  • 72h auto-expire (status → expired, hold released)

0 3 * * *      — Nightly batch (housekeeping)
  • SQLite .backup → /data/backups/YYYY-MM-DD.db (14-day retention)
  • Photo retention cleanup (booking + review photos for terminal bookings
    older than photo_retention_days_after_resolve)
```

All runs are idempotent — the sweep queries for due-but-unprocessed records; running twice has no side effects. See [`src/features/notifications/`](../src/features/notifications/) and [`STACK.md`](./STACK.md#scheduled-jobs).

---

## Security

Key security controls implemented across the app:

| Control | Where |
|---------|-------|
| **Rate limiting** | Booking form: `BOOKING_RATE_LIMIT_PER_HOUR` (default 30) IP-based rate limit |
| **Honeypot** | Booking form: hidden field; bot fills → silent 200, no booking created |
| **EXIF stripping** | All photo uploads (booking photos, review photos) — `exifr` strips metadata before storage |
| **Optimistic locking** | Booking accept/decline checks `updated_at` to prevent stale-state double-actions |
| **No enumeration** | Invalid token pages return a vague "not found" to avoid leaking valid token existence |
| **Session management** | Auth.js v5 sessions (30-day sliding TTL). New admins only land via founding flow (empty table) or a valid invite. |
| **Passkey security** | WebAuthn `counter` checked on each authentication to detect cloned credentials |
| **Last-device guard** | Cannot remove the only enrolled credential — prevents self-lockout |
| **No secrets in DB** | Recovery codes are hashed at rest (`code_hash`); raw code shown once, never stored |

See [`src/features/auth/`](../src/features/auth/) for auth implementation details.
