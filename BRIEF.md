# Showalter Services — Project Brief

## Client
- **Name:** Sawyer Showalter
- **Age:** 15
- **Business:** Showalter Services (lawn care / yard work)
- **Domain:** `showalter.business` (already owned)
- **Socials:** TikTok, email (address TBD from current Linktree)

## Background / Context
- Sawyer printed 250 door hangers with a QR code pointing to a Linktree.
- The Linktree turned out to be a 7-day trial on an unsigned-in account, so the QR is now dead.
- Linktree Pro is $150/yr — he wants to avoid that by rolling his own on `showalter.business`.
- Plan: put a label sticker over the dead QR and reprint with a new one pointing to the new site.

## Bio / Tagline (his exact words)
> "My name is Sawyer Showalter, and I am a 15 year old entrepreneur. I take pride in providing affordable, high quality services you can trust every time."

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
When "Click Here To Message Now" is tapped, it should open a new SMS to Sawyer's number pre-filled with:

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

## Open Questions / TODO
- [ ] Get Sawyer's phone number for the SMS link
- [ ] Confirm email address to display publicly
- [ ] Confirm TikTok handle / URL
- [ ] Confirm service area (useful for SEO + filtering out-of-area inquiries)
- [ ] Decide: contact form in addition to SMS, or SMS only?
- [ ] Confirm `showalter.business` DNS/hosting — where is it pointed today?
- [ ] Sawyer to send a good photo for the site (mower / work-in-progress shot)
- [ ] New QR code to be generated once final URL is locked in (he plans to use goqr.me)

## Proposed Approach (my recommendation)
Collapse both asks into **one site** at `showalter.business`:
- Root `/` = the Linktree-style landing page (what the QR points to)
- Optional `/services` or scroll sections for the fuller services page
- Static site (Next.js on Vercel, or plain HTML/CSS/JS) — no backend needed
- SMS link is a plain `sms:` URI with URL-encoded body
- Price sheet rendered as a real HTML table, not a screenshot

This avoids the $150/yr Linktree cost, gives him full control, and keeps hosting free or near-free on Vercel/Cloudflare Pages.
