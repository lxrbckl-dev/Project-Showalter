# Showalter Services — Project Brief

## Client
- **Name:** Sawyer Showalter
- **Age:** 15
- **Business:** Showalter Services (lawn care / yard work)
- **Domain:** `showalter.business` (already owned, registered via Porkbun)
- **Phone:** 913-309-7340 (used for SMS CTA)
- **Email:** sshowalterservices@gmail.com
- **TikTok:** [@showalterservices](https://www.tiktok.com/@showalterservices)

## Background / Context
- Sawyer printed 250 door hangers with a QR code pointing to a Linktree.
- The Linktree turned out to be a 7-day trial on an unsigned-in account, so the QR is now dead.
- Linktree Pro is $150/yr — he wants to avoid that by rolling his own on `showalter.business`.
- Plan: put a label sticker over the dead QR and reprint with a new one pointing to the new site.

## Bio / Tagline (his exact words)
> "My name is Sawyer Showalter, and I am a 15 year old entrepreneur. I take pride in providing affordable, high quality services you can trust every time."

## Ethos
Sawyer has been mowing lawns for clients for **three years**. That's not flashy, but it's the honest truth and it matters — at 15, a three-year track record is a legitimate trust signal, not a marketing line.

## Design Direction
- **Color scheme:** black, darkish green, white
- **Vibe:** simple but professional
- **Existing branding:** Showalter Services logo (house + sun illustration)

## What He Wants Built

### 1. Landing page
Replaces the current Linktree. The page is centered on a primary **Request service** CTA that opens the booking flow. Also includes:
- **Request service** — primary CTA, opens the booking flow (pick a day, pick a 1-hour slot, fill the form, submit)
- **Price estimations** — styled HTML price table
- **Email** — `mailto:` link
- **TikTok** — link out

### 2. Services website
Displays his services, bio, and links. Same color scheme and branding. Pictures section TBD — he's working on finding a good one (currently just has a grass background with his mower on the door hanger).

## Confirmation Delivery

After a customer submits a booking request, Sawyer reviews it in the admin and either **accepts** or **declines**. On accept, the admin surfaces two one-tap buttons:

- **Send email confirmation** — opens `mailto:` with the full confirmation body (service, date, time, address, "Add to Google Calendar" link, "Add to Apple Calendar" link) pre-filled.
- **Send text confirmation** — opens `sms:` on his phone with a short prefilled body plus a calendar shortlink.

The email goes from Sawyer's Gmail; the text goes from his phone. No server-side email provider is required.

### Prefilled email body (example)

```
Hi [name],

Confirming your appointment:

• Service: [service name]
• Date: [formatted date]
• Time: [start time] – [end time]
• Address: [address on file]

Add to calendar:
• Google: [google render URL]
• Apple:  https://showalter.business/bookings/[token]/ics

— Sawyer
913-309-7340
```

### Prefilled SMS body (example)

```
Hi [name], this is Sawyer — you're confirmed for [service] on [date] at [time]. Reply here if anything changes. Add to calendar: [shortlink]
```

## Price Sheet (from his Google Sheet)

> *This is just an estimate, every job is different.*

| Job | Description | Price |
|---|---|---|
| Trash Can Cleaning | Trash cans deep cleaned and set out to dry. | $20 for both bins |
| Mowing | Mow, weedeat, and edge. | $40 for basic cut |
| Clean ups | Clean up all debris, leaves, and includes a mowing. | $75+ |
| Raking | Rake and bag leaves. | $70+ (hauling is an extra $10) |
| Snow removal | Driveway + walkway clearing during winter storms. | $TBD (Sawyer to confirm pricing) |

*The `+` on Clean-ups and Raking depends on yard size, hauling vs. not, and overall job complexity. Snow-removal pricing TBD — Sawyer handles snow work in the winter.*

## Open Questions / TODO
- [ ] Receive hi-res logo file from Sawyer (vector preferred: SVG / AI / PDF — otherwise highest-res PNG possible)
- [ ] Sample exact dark-green hex from the logo once received
- [ ] Receive lawn-stripe photos from Sawyer for the hero / site imagery
- [ ] Confirm snow-removal pricing

## Scope and Approach

The site is a self-hosted full-stack web app at `showalter.business`. It has two surfaces — the public site and the admin.

### Public site
- Single long-scroll landing page (no separate `/services` route — all content is on `/`)
- Landing page with a prominent **Request service** CTA
- Bio, price table, TikTok link, email link, hero photo, photo gallery, landing stats band
- Sawyer's phone number (913-309-7340), email, and TikTok are displayed openly in a Contact section on the page — the buried "Text Sawyer directly" fallback link remains separately at the very bottom

#### Landing-page section order (top → bottom)

1. **Hero** — photo + "15-year-old entrepreneur" tagline + primary **Request service** CTA
2. **Landing stats band** — aggregate only (avg rating + review count, total completed jobs, distinct customers served, years in business); hidden until `min_reviews_for_landing_stats` is met — see STACK.md
3. **About / bio**
4. **Photo gallery** — admin-uploaded photos plus photos auto-promoted from top reviews
5. **Services + price table**
6. **Request service** — repeat CTA
7. **Contact** — phone (plain text), email, TikTok
8. **Footer** — includes the buried "Text Sawyer directly" fallback link
- Booking flow when "Request service" is tapped:
  1. Customer picks a day from the visible booking horizon (admin-configurable, default 4 weeks)
  2. Customer sees Sawyer's **open windows** for that day and picks an **ideal start time** within one of them (30-minute granularity by default, admin-configurable)
  3. Customer fills the form: name, phone, email (optional), address, service, notes (optional), optional photos (up to 3 by default; admin-configurable)
  4. On submit, the chosen start time — plus a buffer (default 60 min, admin-configurable) — is **held** so no one else can pick an overlapping start time
- **Customer booking page** at `/bookings/<token>` — the unique link delivered to the customer in the confirmation. Shows appointment summary (service, start time, address on file), any notes/photos they submitted, an "Add to calendar" download, and a **Cancel appointment** button. The cancel button transitions the booking to `canceled` and releases the start-time hold. Once a booking is marked `completed`, it is **locked from cancellation** — the page renders "Thanks — see you next time!" with no cancel button.
- **Zero-availability state** — if the booking horizon yields no available start times, the booking UI shows a friendly "no openings right now, check back soon" message instead of an empty picker
- Public `/bookings/<token>/ics` endpoint serves an `.ics` file for "Add to Apple Calendar" on confirmation emails
- **Buried fallback — "Text Sawyer directly"** — a small link at the bottom of the landing page for customers who have a quick question rather than a booking. Tap opens `sms:913-309-7340?body=<prefilled template>` with Sawyer's original message template:

    ```
    Hi, this is [name here]. I'm interested in your services.

    • Address:
    • Type of service:
    • Yard size:
    • Preferred date:

    Thanks!
    ```

  Texts arrive in Sawyer's native Messages app and are NOT tracked by the application (no slot hold, no calendar, no status).

### Admin (mobile-web-friendly)
Admin login uses **passkeys** (Face ID / Touch ID / platform biometric) — no passwords. The number of admin accounts is controlled via the `ADMIN_EMAILS` Docker env var (comma-separated list). All admins have equal permissions in MVP.

Multi-admin support for Sawyer and collaborators. Phone is a first-class form factor — he'll use the admin primarily from his phone's browser.

Admin-editable areas:
- **Contact info** (phone, email, TikTok, bio, SMS template)
- **Services** (name, description, price, price suffix, sort order, active flag)
- **Weekly availability template** (default pattern: which days of week are open, and the time windows for each)
- **Per-date overrides** (override the template for specific dates — open with custom windows, or close entirely)
- **Booking horizon** (how many weeks ahead customers can book, e.g. 4)
- **Bookings inbox** — review submitted requests, accept or decline, send confirmations via `mailto:` / `sms:` buttons
- **Needs attention queue** — dashboard surface listing accepted bookings whose `start_at` has passed; Sawyer marks each `completed` or `no_show`
- **Admin-initiated bookings** — Sawyer creates a booking manually for walk-in or phone-call requests; status starts at `accepted`; advance-notice and spacing rules are soft warnings only
- **Reschedule** — cancel-old + create-new; old booking page renders a "rescheduled to …" message
- **INDEX book** — master customer directory (customers + customer_addresses) with address history, bookings, reviews, photos; admin notes per customer
- **Reviews moderation + generation** — moderate reviews, generate review-request links from a completed booking OR standalone from a customer's INDEX page
- **Photo gallery** — landing-page photos: upload, reorder, soft-archive, source tracking (admin-uploaded vs auto-promoted from top reviews)
- **Message templates** — six editable templates (confirmation email/SMS, decline email/SMS, review-request email/SMS) with variable interpolation
- **Settings** — timezone, business-founded year, landing stats toggle + threshold, review auto-publish rules, photo caps, retention, horizon
- **Hero image upload**

### Notifications
- Sawyer gets an in-app badge + inbox entry whenever a new booking is submitted. Provisional: Web Push via PWA is a candidate follow-up so bookings ping his phone like a real app.
- Customers do NOT receive any automated server-sent notifications. All outbound confirmations come from Sawyer's own Gmail / phone number through the prefilled `mailto:` and `sms:` buttons.

### Deployment
- Docker container on Alex's homelab, fronted by Caddy, DNS via Porkbun — unchanged.

### Soft-signal context (unchanged)
- Sawyer is non-technical and is deferring architectural calls to Alex. Default to simplicity over cleverness.
- Lawn-stripe photos are a craft signal in the lawn-care world — they should drive the hero imagery and ideally become a subtle brand motif.
- Cash-only payment — no Stripe / Venmo / processor integrations.
