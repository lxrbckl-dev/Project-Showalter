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

### 1. Linktree-style landing page
Replaces the current Linktree. Needs these buttons/links:
- **Click Here To Message Now** (opens SMS, see template below)
- **Price estimations** (currently a Google Sheets screenshot — should be rebuilt as styled HTML)
- **Email**
- **TikTok**

### 2. Services website
Displays his services, bio, and links. Same color scheme and branding. Pictures section TBD — he's working on finding a good one (currently just has a grass background with his mower on the door hanger).

## SMS Message Template
When "Click Here To Message Now" is tapped, it should open a new SMS to Sawyer's number (913-309-7340), pre-filled with:

```
Hi, this is [name here]. I'm interested in your services.

• Address:
• Type of service:
• Yard size:
• Preferred date:

Thanks!
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
- [ ] Generate a new QR code once the final URL is locked in (Sawyer to use goqr.me)

## Scope and Approach

The site is a self-hosted full-stack web app — no longer a static Linktree clone. One site at `showalter.business` that:

- Serves a public landing page (Linktree-style buttons, bio, services, price sheet, TikTok / email links, hero photo)
- Includes an **admin login** for Sawyer. Anything amorphic — prices, contact info, services, bio, hero photo, availability, testimonials — is editable through the admin.
- Exposes an **availability calendar**. Sawyer marks days he's busy; the public site shows availability and, on tap of an available day, opens an SMS to his number with the template prefilled and the selected date dropped into the "Preferred date" line.
- Supports **testimonials with admin moderation** — Sawyer sees submissions / entries he's added, approves or hides them.
- Ships as a Docker container, deployed to Alex's homelab, fronted by Caddy, with DNS via Porkbun.

See [STACK.md](STACK.md) for the full tech-stack decision and rationale.

### Soft-signal context
- Sawyer is non-technical and is deferring architectural calls to Alex. Default to simplicity over cleverness.
- Lawn-stripe photos are a craft signal in the lawn-care world — they should drive the hero imagery and ideally become a subtle brand motif (e.g., diagonal dark-green stripes as background accents).
- Cash-only payment — no Stripe / Venmo / processor integrations.
