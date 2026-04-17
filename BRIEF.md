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
- [ ] Receive 2–3 repeat-client testimonials from Sawyer
- [ ] Confirm snow-removal pricing

## Scope and Approach

The site is a self-hosted full-stack web app at `showalter.business`. It has two surfaces — the public site and the admin.

### Public site
- Landing page with a prominent **Request service** CTA
- Bio, price table, TikTok link, email link, hero photo, (later) testimonials
- Booking flow when "Request service" is tapped:
  1. Customer picks a day from the visible booking horizon (configurable, e.g. next 4 weeks)
  2. Customer sees Sawyer's open **1-hour slots** for that day
  3. Customer picks a slot and fills the form (name, phone, email, address, service, optional notes)
  4. On submit, the slot is **held** so no one else can pick it while Sawyer reviews
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
Single-admin login for Sawyer. Phone is a first-class form factor — he'll use the admin primarily from his phone's browser.

Admin-editable areas:
- **Contact info** (phone, email, TikTok, bio, SMS template)
- **Services** (name, description, price, price suffix, sort order, active flag)
- **Weekly availability template** (default pattern: which days of week are open, and the time windows for each)
- **Per-date overrides** (override the template for specific dates — open with custom windows, or close entirely)
- **Booking horizon** (how many weeks ahead customers can book, e.g. 4)
- **Bookings inbox** — review submitted requests, accept or decline, send confirmations via `mailto:` / `sms:` buttons
- **Testimonials** — moderate / add / hide
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
