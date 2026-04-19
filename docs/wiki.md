# Sawyer Showalter Services — Wiki

> Plain-English guide to using the website and admin panel.
> Written for Sawyer and Alex — everything you need to run the business
> day-to-day, no programming knowledge required.

## Overview

The site has two halves: the **public site** (what customers see) and the **admin panel** (where you run the business). Customers visit the home page, scan a QR code, or follow a direct link, and can book a service in under a minute. Everything customers see — services, prices, availability, photos, bio — comes from settings you control in the admin panel. Any change you make is live on the public site on the next page load.

The admin panel signs in with a passkey (Face ID, Touch ID, or fingerprint — no passwords). You can install it as an app on your phone: in Safari on iPhone or Chrome on Android, tap "Add to Home Screen". After that it behaves like a native app, including push notifications when a new booking comes in.

---

## First-Time Admin Setup

The very first time anyone visits `/admin/login` on a new install, the system has no admins yet and shows a special "claim founding admin" form. Walk through it once to take ownership.

1. Open `/admin/login`. Because the admins list is empty, you'll see **Create the first admin** instead of the normal sign-in.
2. Enter your email and tap **Claim founding admin**. Your phone or laptop will prompt you for Face ID, Touch ID, or fingerprint to register a passkey.
3. A full-screen modal shows your **recovery code** — a 12-character string. **Save this somewhere safe** (password manager). It is shown exactly once.
4. Tick "I've saved this code somewhere safe" and tap **Continue**. You're signed in and land on the admin dashboard.
5. To add Sawyer (or any second admin): go to `/admin/settings/admins`, type their email, tap **Create invite**, and share the generated link with them. The link works once and expires in 24 hours.

If you close the tab before saving the recovery code, ask Alex to reset your account — see the **Recovery** section in Part 2.

---

# Part 1: Public-Facing Site (for Customers)

The public site lives at the root of the domain. Every page shows the Showalter primary logo header and the diamond secondary-logo footer. Customers don't need to log in to do anything on the public side.

---

### Landing Page

**URL:** `/`

This is the front door. Everything visible here is rendered live from your admin settings, so a tweak in the admin panel shows up immediately.

Sections from top to bottom:

- **Header** — Showalter primary logo. Clicking the logo always returns to `/`.
- **About Sawyer** — a short scrolling marquee of host facts (admin-managed) sits above the heading where "Trusted Lawn Care" used to be. Below it: "About Sawyer" headline, then the bio. The bio supports an `[age]` placeholder that auto-updates from your date-of-birth setting, so the age stays current year over year without editing copy.
- **Services** — a styled table of every active service with its name, description, and price. Prices show as dollars (e.g. `$40`); a service with no price shows "Contact for pricing." A reminder line reads "Prices are subject to change."
- **Request Service** — a centered "Start Booking" button that links to the booking flow at `/book`.
- **Contact** — three round icon buttons: phone, email, TikTok.
- **Reviews** — a horizontally scrolling band of customer photos with the **Avg Rating, Jobs Completed, Customers Served, Years in Business** stats just below the "Reviews" heading. Numbers count up from zero when scrolled into view. The band only renders if at least one active gallery photo exists.
- **Footer** — diamond secondary logo. No links.

If the database is fresh and not yet populated, customers see "Site is being set up — check back soon." instead of the full page.

---

### Booking Flow

**URL:** `/book`

A 3-step wizard. Customers must have JavaScript enabled. The page loads fresh on every visit so availability is always current.

If you have no services configured, customers see "No services listed yet." If your schedule has no open slots in the booking horizon, they see "No openings right now" with a hint to text you directly.

**Step 1 — Pick a day:** A grid of date buttons covering the booking horizon (default: 4 weeks out). Each button shows the day label and slot count (e.g. "3 open" or "closed"). Closed days are dimmed and unclickable. Days are shown in your business timezone (default America/Chicago) so a late-night visitor sees the right local date.

**Step 2 — Pick a start time:** A list of available time slots for the chosen day (e.g. "10:00 AM", "1:30 PM"). A back link returns to the day picker.

**Step 3 — Fill the form:** Service (required), Name (required), Phone (required), Email (optional), Service address (required), Notes (optional, up to 2000 characters), Photos (optional, JPEG/PNG/HEIC/WebP).

**Step 4 — Submit:** On success the customer is redirected to their personal booking-status page. If the slot was taken in the seconds while their form was open, the wizard resets to the day picker with a "That slot was just taken — please pick another time." banner. If they've submitted too many times in an hour, they see a rate-limit message.

Booking-flow knobs you can tune in admin Settings:

| Setting | Default | What it controls |
|---|---|---|
| Booking horizon (weeks) | 4 | How far in advance customers can book |
| Min advance notice (hours) | 36 | The earliest bookable slot relative to "now" |
| Booking spacing (minutes) | 60 | Buffer between any two bookings |
| Start time increment (minutes) | 30 | Granularity of the time-slot list |
| Max photos per booking | 3 | Cap on attached photos |
| Max photo size | 10 MB | Per-file size cap |

---

### Booking Status & Cancellation

**URL:** `/bookings/[token]`

After submitting, customers land on their own status page identified by a secret token in the URL. Anyone with the link sees the booking; there's no login. An unknown token returns a generic 404.

The page shows a banner depending on the booking's current status:

| Status | Heading | Customer can cancel? |
|---|---|---|
| Pending | "Request received" | Yes |
| Accepted | "Appointment confirmed" | Yes |
| Declined | "Sawyer couldn't take this one" | No |
| Canceled | "Appointment canceled" | No |
| Expired | "Request expired" | No |
| Completed | "Job completed" | No |
| No show | "Marked no-show" | No |

Below the banner: a summary of the booking (service, date/time in your timezone, name, phone, email, address, notes) plus any attached photos as a thumbnail grid (clickable for full size).

**Reschedule notice:** If you reschedule a booking through the admin panel, the customer's old status page shows a yellow banner "This appointment was rescheduled" with a link to the new booking page.

**Cancellation:** A "Cancel appointment" button appears only when the status is Pending or Accepted. It's two-step: tap it once to reveal a confirmation prompt, then tap "Yes, cancel" or "Keep it." If the booking moved to a terminal state (e.g., you declined it moments earlier), the cancel attempt errors gracefully.

**Calendar download:** A `.ics` calendar file is available at `/bookings/[token]/ics`. The link is intended to be sent via the confirmation email template (`[ics_link]` placeholder) — it isn't surfaced directly on the status page. Customers can drop the file into Apple Calendar, Google Calendar, Outlook, etc.

---

### Review Submission

**URL:** `/review/[token]`

After completing a job, you generate a review link from the admin panel (see **Booking Decisions → Review Request**) and send it to the customer. The link contains a unique token; clicking it opens a no-login review form. Unknown tokens return a 404.

Customer flow:

1. They open the link. The page greets them by name: "Hi [name] — thanks for letting Sawyer work on your service! How did it go?"
2. They pick a star rating, 1 to 5 (required). Stars highlight on hover; clicking locks one in.
3. They type an optional written review (up to 2000 characters).
4. They can attach photos (optional, same formats as booking photos).
5. They tap **Submit review.**
6. On success the page switches to a "Thanks for your review!" view showing their stars (e.g., ★★★★☆). The form is gone, and re-opening the link just shows the thank-you page.

**Auto-publish rule:** If the review's star rating is at or above your "Min rating for auto-publish" setting (default 4 stars) and the "Auto-publish top review photos" toggle is on (default on), any photos attached to the review are immediately added to your public gallery. The review text becomes the gallery caption. There is no manual approval step — qualifying photos go live the moment the customer submits.

---

### Contact Methods

The Contact section on the landing page shows three round icon buttons. Any or all can be hidden by leaving the corresponding setting blank in admin Content.

- **Phone** — taps open the customer's phone app to dial your number.
- **Email** — opens the customer's email app. If you've filled in the email-template subject and body in Content, those pre-fill so the customer just hits send.
- **TikTok** — opens your TikTok profile in a new tab.

All three are icon-only with screen-reader labels ("Call Sawyer", "Email Sawyer", "Sawyer on TikTok").

---

### How Customers Hear Back

**The site does not send SMS or email automatically.** When you accept or decline a booking in the admin panel, the booking detail page shows pre-composed message buttons. Tapping a button opens your phone's messages or email app with the body and the customer's contact pre-filled. You hit send manually.

The wording of those messages comes from the admin Templates tab — eight templates (confirmation email, confirmation SMS, decline email, decline SMS, review-request email, review-request SMS, reschedule email, reschedule SMS), all editable, all using placeholders like `[name]`, `[service]`, `[date]`, `[time]`, `[address]` that get filled in per booking when you tap the message button.

When a new booking is submitted, a push notification arrives on whichever devices you've turned push on for. That part is automatic; the customer never sees it.

---

# Part 2: Admin — Sign-In & Accounts

The admin panel uses passkeys exclusively — Face ID, Touch ID, fingerprint, or a hardware security key. There are no passwords. Once signed in, your session lasts 30 days and refreshes itself as you keep using it.

---

### Normal Sign-In

**URL:** `/admin/login`

1. Type your email and tap **Sign in**.
2. Your device prompts for biometrics (Face ID / Touch ID / fingerprint) or a security key.
3. On success you're taken to the admin dashboard.

**Important:** passkeys do not cross browsers on the same device. A passkey registered in Safari only works in Safari (plus other Apple devices via iCloud Keychain). A passkey registered in Chrome only works in Chrome on this machine. If you switch browsers and try to sign in, you'll see "no passkeys for this site" and the same email won't work — that's expected. The fix is to add a second device/passkey from Settings → Devices the first time you use a new browser.

For security, login attempts are rate-limited. All failure messages look the same regardless of cause (wrong email, no admin, wrong device) — this is by design so an attacker can't probe which emails are valid.

---

### Recovery

If you lose your phone, your laptop, or both — the recovery path is to ask Alex to reset your account from the server. There is no email or SMS reset link by design.

The recovery code that was shown at enrollment is currently future-proofing only — there is no in-app form to type it into yet.

What `admin:reset` does:

- Wipes your registered passkeys.
- Wipes your saved recovery code.
- Sets your account back to "pending enrollment" (your row is preserved).

After the reset, the next steps depend on whether other admins are enrolled:

- **If at least one other admin is still signed in:** they create an invite for your email from `/admin/settings/admins`. You open the invite link on your new device and re-enroll a passkey.
- **If you are the only admin (last-one-locked-out):** the reset alone isn't enough — Alex must also delete your row from the admins table directly so the founding-admin form re-appears. Then visit `/admin/login` and enroll fresh from scratch.

This last-admin recovery procedure is fully documented in the operational runbook.

---

### Inviting New Admins

**URL:** `/admin/settings/admins`

1. In the **Create invite** section, fill in **Invitee email** (required) and an optional **Label** (up to 60 characters, e.g. "Sawyer iPhone" — useful for keeping track of who you sent which link to).
2. Tap **Create invite.** The page shows the full invite URL with a one-click copy button.
3. Send the URL to the invitee through your normal channel (text, email, in person).
4. The invitee opens the URL on their device. Their email is pre-filled and locked. They tap **Enroll passkey** and complete biometrics.
5. They see a recovery code modal (same one-time disclosure as the founding admin), save the code, and tap **Continue.** They land on the admin dashboard.

Invites:

- Expire in **24 hours** (not configurable).
- Are **email-bound** — the URL only works for the email address you created it for.
- Are **single-use** — accepting consumes the link.
- Cannot be created for an email that's already an active admin.

Treat the invite URL like a one-time password — it grants admin access if combined with the right email, so don't share it any wider than necessary.

---

### Revoking Invites

The **Outstanding Invites** table on `/admin/settings/admins` lists every pending invite with a **Revoke** button per row. Use it if you sent a link to the wrong email or want to cancel one before it's accepted.

- Revoking is allowed for pending and expired invites.
- A used invite cannot be revoked — at that point the admin already has an account; disable that account instead.
- Revoking is idempotent (revoking an already-revoked invite is a no-op).

---

### Device Management

**URL:** `/admin/settings/devices`

Each admin can have multiple passkeys, one per browser-on-device. This is the page where you add and remove them for **your own** account.

- The device you're currently signed in with shows a **"This device"** badge.
- **Add another device:** Tap **Add another device**, complete biometrics on the new device, then optionally name it ("Sawyer iPhone Safari", "Alex MacBook Chrome", etc.).
- **Rename:** Tap the device label to edit it inline.
- **Remove:** Available on devices that aren't your current one, when you have more than one device registered.

Two safety rails:

- You can't remove the device you're currently using — the **Remove** button is hidden on that row.
- You can't remove your only remaining passkey — it would lock you out. The button is disabled when only one device remains.

Removing a device also kills any sessions established with that passkey, so the next request from that browser/device will require a fresh sign-in.

You can only see and manage your own devices. You cannot view another admin's devices.

---

### Admin Account Management

Same page: `/admin/settings/admins`.

The **Current admins** table lists everyone with: email, status (Active / Disabled / Pending), date added, device count.

- **Disable** an admin: tap **Disable** on their row. Their existing sessions stop working on the next request, and they can't sign in again.
- **Enable** a disabled admin: tap **Enable** on their row. Effective immediately.

Two safety rails:

- You can't disable yourself. The button is hidden on your row.
- You can't disable the last active admin — the system shows "Can't disable the only enabled admin — the team would be locked out."

There is no hard delete. Disabling preserves the row for audit purposes.

---

### Sessions

When you sign in, you get a 30-day session. Every authenticated action you take with fewer than 29 days remaining bumps your session back to a full 30 days, so as long as you keep using the panel you'll stay signed in.

Tap **Sign out** in the header to end your session immediately. Expired sessions are cleaned up automatically the next time you visit any admin page.

---

# Part 3: Admin — Site Content Management

All settings here go live on the public site immediately on save — no rebuild or redeploy. There's only one row of site config; gallery photos and services live in their own tables.

---

### Content Tab

**URL:** `/admin/content`

A four-tab editor covering all non-service, non-schedule public-facing content.

#### Contact sub-tab

| Field | What it does |
|---|---|
| Owner first name | "About {name}" heading on the public About section. Falls back to "About" if blank. |
| Phone | Public phone-icon button (E.164 format, e.g. `+19133097340`). Hidden if blank. |
| Email | Public email-icon button (`mailto:` link). Hidden if blank. |
| TikTok URL | Public TikTok-icon button. Hidden if blank. |
| Email template subject | Pre-fills the subject line when a customer taps the email icon. |
| Email template body | Pre-fills the body when a customer taps the email icon. |
| Date of birth | Drives the `[age]` placeholder in the bio. If unset, `[age]` shows as literal text — fill this in before using the placeholder. |
| Bio | Free-form bio shown on the public About section. Supports `[age]`. |

All Contact fields are optional. Saving a blank value clears that field.

#### SMS Fallback sub-tab

Single textarea. This text pre-fills the SMS body when a visitor taps the "Text Sawyer directly" link in the landing-page footer. Required (must not be blank).

#### Templates sub-tab

Eight message templates in one form. Each has a list of valid placeholders shown as badges above the text area. All eight are required.

| Template | When it fires | Valid placeholders |
|---|---|---|
| Confirmation — Email | You accept a booking | `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[google_link]`, `[ics_link]` |
| Confirmation — SMS | You accept a booking | `[name]`, `[service]`, `[date]`, `[time]`, `[shortlink]` |
| Decline — Email | You decline a booking | `[name]`, `[service]`, `[date]` |
| Decline — SMS | You decline a booking | `[name]`, `[service]`, `[date]` |
| Review request — Email | You request a review on a completed booking | `[name]`, `[service]`, `[link]` |
| Review request — SMS | You request a review on a completed booking | `[name]`, `[link]` |
| Reschedule — Email | You reschedule a booking (sent from the new booking's detail page) | `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[google_link]`, `[ics_link]` |
| Reschedule — SMS | You reschedule a booking (sent from the new booking's detail page) | `[name]`, `[service]`, `[date]`, `[time]`, `[shortlink]` |

Placeholders are bracketed lowercase tokens. Spaces and case inside the brackets are tolerated (`[ name ]` matches). Typos in placeholder names are left as literal text rather than crashing — visible garbage tells you to fix the template.

#### Settings sub-tab

Numeric and toggle knobs for the booking flow and public-stats display. See the **Settings Knobs** section below for the full list.

---

### Services

**URLs:** `/admin/services` (list), `/admin/services/new` (create), `/admin/services/[id]/edit` (edit)

Manages the price-list shown on the public landing page.

- **List page:** Two sections — All services (with View/Edit links and Archive/Restore toggles) and Reorder active services (drag-and-drop). Inactive services are excluded from the drag panel.
- **Create / Edit form fields:**
  - **Name** (required, 1–100 chars) — service title on the public site.
  - **Description** (required, 1–500 chars) — line below the name.
  - **Price (cents)** (optional integer ≥ 0, or blank) — blank renders as "Contact for pricing." Stored in cents to avoid rounding errors; entered as cents so $40 is `4000`.
  - **Price suffix** (optional, up to 4 chars) — appended after the price (e.g. `+` for "$40+").
  - **Sort order** (integer, default 0) — lower comes first; overridden by drag-to-reorder.
- New services are created active and immediately visible on the public site.
- **Archive** sets a service inactive — it disappears from the public site but stays in the admin list with a Restore button. There is no hard delete.

---

### Gallery & Photos

**URL:** `/admin/gallery`

Manages the photo gallery shown in the Reviews section of the landing page. Photos can be uploaded directly here, and qualifying review photos are auto-promoted (see auto-publish below).

#### Uploading Photos

- Same format and size rules as the hero image (JPEG/PNG/WebP/HEIC/HEIF, 10 MB cap, EXIF stripped).
- **Caption** is optional, up to 200 characters. Blank captions are stored as nothing.
- New uploads go to the end of the list, and are active by default.

#### Managing Existing Photos

Each photo card has:

- A thumbnail.
- An inline caption editor with a Save button.
- An **Archive** / **Restore** button. Archived photos move to a separate "Archived" grid at the bottom with dashed borders. The file stays on disk (no hard deletes).

#### Drag-to-Reorder

The active photo grid supports drag-and-drop reordering. Only active photos participate. The new order saves automatically as soon as you drop.

#### Review Auto-Publish

Photos attached to customer reviews can be auto-promoted into your gallery. The threshold is set in admin Settings (`Min rating for auto-publish`, default 4 stars) and the toggle (`Auto-publish top review photos`, default on). When both conditions are met, the photo lands in your gallery — and on the public site — the moment the customer submits.

---

### Schedule

**URL:** `/admin/schedule`

Controls Sawyer's availability — which days and hours are open for bookings.

#### Weekly Template (left panel)

Sets the recurring weekly schedule, day by day. Each day shows its current open windows. A day with zero windows is "Closed" on that weekday.

- **Add window:** drops in a draft `09:00–17:00` row. Times use 24-hour format.
- **Remove window:** drops a draft row before saving.
- **Save:** replaces all windows for that weekday at once. Saving an empty list closes that day.
- **Cancel:** discards your edits since the last save.

Validation enforced server-side: end time must be after start, and windows on the same day cannot overlap (adjacent windows like 10:00–12:00 + 12:00–14:00 are fine).

#### Date Overrides (right panel)

Replaces the weekly template for specific calendar dates — vacations, holidays, special hours.

- **Date picker:** the date you're overriding. Defaults to today.
- **Note:** optional free-text reason ("out of town").
- **Mark closed:** closes that date entirely.
- **Mark open with custom windows:** opens the date with whatever windows you set, overriding the template.
- **Clear (on existing override):** removes the override and lets the template govern that date again.

Existing overrides appear below the date picker as color-coded badges (red = closed, green = open) with their windows and a Clear button.

---

### Settings Knobs

**URL:** `/admin/content` → Settings tab

Controls all numeric and toggle settings for the booking flow and public-stats display.

| Setting | Default | What it does |
|---|---|---|
| Site title | `Sawyer Showalter Service` | Shown in the Hero eyebrow, browser tab title, and social-share preview cards. |
| Year founded | `2023` | Drives the "Years in Business" stat. Use **Business start date** below for a more precise calculation. |
| Business start date | (blank) | Optional ISO date — when set, "Years in Business" comes from this (month/day-precise). Falls back to Year founded. |
| Timezone | `America/Chicago` | Used everywhere appointments are displayed and interpreted. |
| Booking horizon (weeks) | `4` | Furthest ahead a customer can book. |
| Start time increment | `30` minutes | Granularity of slot times shown to customers. Choose 15 / 20 / 30 / 60. |
| Booking spacing | `60` minutes | Buffer after each booking before the next slot is offered. |
| Min advance notice | `36` hours | Earliest bookable slot relative to "now". Set to 0 for immediate bookings. |
| Max photos per booking | `3` | Cap on attached photos per booking request. Also caps photos on the review form. |
| Max photo size | `10 MB` | Per-file size cap for uploads. |
| Photo retention after resolve | `30` days | How long booking-attachment photos are kept after the booking is closed out. |
| Show landing stats band | On | Whether the Avg Rating / Jobs Completed / Customers Served / Years in Business band shows on the public landing page. |
| Min reviews to show stats band | `3` | Stats band stays hidden until you have at least this many reviews — prevents a "1 review" look on a brand-new site. |
| Jobs completed (override) | (blank) | Manually overrides the auto-counted "Jobs Completed" stat. Leave blank to auto-compute. |
| Customers served (override) | (blank) | Manually overrides the auto-counted "Customers Served" stat. Leave blank to auto-compute. |
| Min rating for auto-publish | `4` | Reviews at or above this star rating are eligible to auto-promote their photos to the gallery. |
| Auto-publish top review photos | On | Master switch for auto-publish. When off, no review photos auto-promote regardless of rating. |
| Host facts marquee | (blank) | One short fact per line — they scroll horizontally above "About Sawyer" in random order on every page load. Up to 50 lines, 200 characters each. |

---

### General Patterns Across All Settings

- **No hard deletes.** Services and gallery photos archive (hide), they don't delete. Hero image files stay on disk when replaced. Schedule overrides can be cleared (the intended undo).
- **Saves take effect on the next public page load.** The public site is always live, never cached.
- **Drag-to-reorder updates instantly.** If the save fails, you'll see an error asking you to refresh.
- **Validation runs server-side.** The form may show inline errors below each field if you save invalid input.
- The page at `/admin/settings` is a **separate** account-security hub (devices and admin roster). It is not the Settings sub-tab inside `/admin/content`.

---

# Part 4: Admin — Daily Operations

Day-to-day workflows once customers start booking and reviewing.

---

### Admin Dashboard

**URL:** `/admin`

The first screen after sign-in. Intentionally minimal — what needs your attention right now.

- **Welcome banner** with your email.
- **Push notification button** — turn push on for this device.
- **Pending bookings card** — count of bookings awaiting your decision, links to the Inbox.
- **Confirmed this week card** — count of accepted bookings whose start time falls within the next 7 days.
- **Needs attention list** — accepted bookings whose start time has passed and need to be closed out (marked completed or no-show). Each row links to the booking detail.

---

### Inbox

**URL:** `/admin/inbox`

Two views, toggled via the URL:

- **Queue** (`/admin/inbox`) — live bookings needing action, split into:
  - **Pending** — awaiting Accept or Decline.
  - **Confirmed upcoming** — accepted, in the future, no urgent action.
  - **Needs attention** — accepted but past their start time; close them out.
- **History** (`?view=history`) — terminal bookings (completed, no-show, declined, canceled, expired), 25 per page.

Each row shows the customer name + phone, service, formatted appointment time, and status badge. Tap a row to open the booking detail.

#### Standalone Review Widget

At the top of the Queue view. Use this to send a review request to a customer who was served before this app existed (no associated booking record).

1. Type a name, phone, or email and tap **Search.**
2. The widget shows matching customers from your Index Book.
3. Tap a customer. The widget creates a fresh review link tied to them.
4. Tap **Send email request** or **Send text request** to open your phone's mail/messages app with the body pre-filled.

The review link is also shown so you can copy and share it manually if the email/SMS buttons don't fit your situation.

---

### Booking Decisions

**URL:** `/admin/inbox/[bookingId]`

The booking detail page. Shows the full booking (service, time, contact, address, notes, status, timestamps), any customer photos, and the actions available right now.

#### What You Can Do, Based on Status

| Current status | Actions available |
|---|---|
| Pending | Accept, Decline, Reschedule |
| Accepted (future) | Reschedule, Cancel |
| Accepted (past start time) | Mark completed, Mark no-show |
| Any terminal status | None |

Terminal statuses: Completed, No show, Declined, Canceled, Expired.

#### What Each Action Does

**Accept** — flips the booking to Accepted. The page then shows **Send confirmation** buttons (email + SMS) that open your phone's mail/messages app pre-filled with the confirmation template.

**Decline** — requires a confirmation prompt ("Decline this request? This cannot be undone."). The page then shows **Send decline** buttons using the decline templates.

**Reschedule** — opens an inline form with a date/time picker. The original booking is canceled and a new one is created at the new time, automatically Accepted. You're taken to the new booking's detail page; the old one shows "Rescheduled to…" and the new one shows "This booking replaces…". Errors out if another booking already occupies the new slot.

The customer is **not** notified automatically. Because the new booking is the result of a reschedule, the usual "Send confirmation" buttons are swapped for **Send email reschedule notice** / **Send text reschedule notice**, both pre-filled from the Reschedule templates and ready to send with one tap. The customer can also self-rescue: their old `/bookings/[token]` URL keeps working and shows a yellow "rescheduled" banner that links to the new booking. Note that customers can't reschedule themselves — only you can, from the admin panel.

**Cancel** — admin-initiated cancellation of an accepted booking. Frees the time slot. No automatic notification to the customer.

**Mark completed** — confirms with a prompt, sets the booking terminal. The **Request review** panel then appears (see below).

**Mark no-show** — confirms with a prompt, sets the booking terminal. No further follow-up shown.

If two admins act on the same booking simultaneously, the second action errors out and prompts you to refresh.

#### Confirmation / Decline Buttons

After Accept or Decline, mailto and SMS buttons appear with the body pre-filled from your templates. If the customer left no email, the email button is shown disabled. The SMS button is always shown if a phone number is on file.

#### Review Request (after Mark completed)

A **Request review** panel appears once a booking is Completed.

- If no review link has been generated yet: tap **Generate Review Request.** This creates a fresh review link for the customer.
- Once generated: **Send email review request** and **Send text review request** buttons appear, opening your mail/messages app with the review-request template pre-filled and the link embedded.

The link is also shown inline so you can share it manually if needed.

---

### Reviews

**URL:** `/admin/reviews` and `/admin/reviews/[id]`

#### Reviews List

Tabular list of all submitted reviews, 25 per page. Columns: submitted date, customer (name + phone), star rating, review text excerpt, photo count.

Filters (all combinable, applied via the URL):

- **Search** — name, phone, or email.
- **Rating** — exact star rating, 1–5.
- **Date range** — submitted between two dates.

A **Clear** link appears when any filter is active. Pagination uses `?page=N`.

#### Individual Review

Read-only detail view. Shows:

- Star rating (`★` characters).
- Full review text.
- Photo grid — each links to the original.
- Metadata: status (Pending or Submitted), requested date, submitted date, type (booking-tied or standalone), link to the associated booking if one exists, and the customer's review URL.

There is currently no manual approve/reject toggle on individual reviews. Auto-publish runs at submit time based on the rating threshold and the auto-publish toggle in Settings.

---

### Index Book

**URL:** `/admin/index-book` and `/admin/index-book/[customerId]`

The customer directory. One record for every customer who has ever booked.

#### List View

Search by name, phone, email, or address. Table columns: name, phone, email, total booking count, last booking date. Paginated 25 per page. Tap a row to see the detail.

#### Customer Detail

Single-customer view organized in sections:

- **Master info** — name, phone, email, customer-since date.
- **Admin notes** — free-text textarea (up to 2000 characters) with inline save button and live character counter. Goes to that customer's notes in the database.
- **Review request** — a button to create a standalone review link for this customer. Useful for pre-app customers who don't have a linked booking.
- **Address history** — every address used across bookings, sorted by most-recently used.
- **Bookings** — chronological table of every booking for this customer (date, address, status badge, link to inbox detail).
- **Reviews** — pending and submitted reviews with star rating, text excerpt, status badge, and link to the review detail.
- **Photos** — gallery of every review photo this customer has attached.

---

### Walk-In Bookings

**URL:** `/admin/bookings/new`

For customers who called or walked in — bypassing the public booking flow. The booking is always created as Accepted (skips the pending state).

Form modes:

- **Existing customer** — dropdown of recent customers (up to 6). Selecting one shows their details and last known address. You can override the address.
- **New customer** — inline fields for name, phone (required), email (optional), and address.

In both modes, pick a service, a start time (defaults to right now to save you typing), and optional notes.

**Soft warnings:** if the start time is inside your minimum-advance-notice window or another booking is within the spacing buffer, the form shows a yellow warning banner and swaps the submit button to **Submit anyway**. You can also tap **Edit and retry** to adjust the time. These are warnings, not hard blocks.

On success you're taken to the new booking's detail page.

---

### Notifications & Push

#### Notifications Inbox

**URL:** `/admin/notifications`

In-app feed of system events, 25 per page, newest first. Unread rows are highlighted.

Notification kinds you'll see:

- **Customer cancellation** — fired when a customer cancels an Accepted booking from their tracking link.
- **Pending reminder (24h)** — a booking has been pending for 24 hours without a decision.
- **Pending reminder (48h)** — same, at 48 hours.
- **Booking expired** — an automatic expiration after 72 hours pending without action.

Per-row **Mark read** and a header **Mark all read** button. Booking-related notifications include an **Open booking** link to the relevant detail page.

The header badge in the admin shell shows the unread count and updates as you navigate.

#### Push Notifications

**Where:** the **Push** button on the Dashboard.

1. Tap **Enable.** Your browser prompts to allow notifications.
2. If you allow it, this device starts receiving push notifications when new bookings come in.
3. The button text switches to "Push: enabled on this device" with an **Unsubscribe** option.

If your browser blocked the prompt, you'll see "Notifications are blocked" — fix it in your browser settings, then come back and Enable again.

Push notifications work on most modern desktop and mobile browsers, but specifically require:

- HTTPS (works locally too).
- A modern browser with service worker + push support.
- The site to be installed as a PWA on iOS for it to work on iPhone (Safari → Share → Add to Home Screen).

---

### Message Templates

Eight template slots, edited in the Templates sub-tab of `/admin/content`. The system sends nothing automatically — these populate the body of a `mailto:` or `sms:` link that opens your phone's email or messages app, where you hit send manually.

| Slot | When it fires | Channel | Audience | Available placeholders |
|---|---|---|---|---|
| Confirmation — Email | You accept a booking | Email | Customer | `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[google_link]`, `[ics_link]`, `[shortlink]` |
| Confirmation — SMS | You accept a booking | SMS | Customer | Same as above |
| Decline — Email | You decline a booking | Email | Customer | Same as above |
| Decline — SMS | You decline a booking | SMS | Customer | Same as above |
| Review request — Email | You request a review on a completed booking or standalone | Email | Customer | `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[link]`, `[google_link]`, `[ics_link]`, `[shortlink]` |
| Review request — SMS | Same | SMS | Customer | Same as above |
| Reschedule — Email | You reschedule an existing booking; sent from the new booking's detail page | Email | Customer | `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[google_link]`, `[ics_link]`, `[shortlink]` |
| Reschedule — SMS | Same | SMS | Customer | Same as above |

What each placeholder fills in:

- `[name]` — customer's full name.
- `[service]` — service name (e.g. "Mowing"); falls back to "Service" if missing.
- `[date]` — booking date formatted as "Fri, May 1" in your business timezone.
- `[time]` — booking time formatted as "9:30 AM" in your business timezone.
- `[address]` — service address from the booking.
- `[link]` — the customer's review URL (only relevant in review-request templates).
- `[google_link]` — Google Calendar "add event" link pre-filled with the appointment.
- `[ics_link]` — calendar download link the customer can drop into Apple/Google/Outlook calendar.
- `[shortlink]` — short URL to the customer's status page.

Placeholder names are case-insensitive and tolerate whitespace inside the brackets (`[ name ]` works). Typos in placeholder names are left as literal text rather than crashing — visible garbage in the rendered message tells you to fix the template.

---

## A Few Things to Know

- The customer's status page (`/bookings/[token]`) does not surface the calendar download directly — it only reaches the customer if your confirmation email template includes the `[ics_link]` placeholder.
- The Reviews section on the public landing page shows photos from auto-published reviews, not the written review text or star ratings. The dedicated public-reviews display with star ratings is on the future road-map.
- The same "Max photos per booking" setting controls both the booking form and the review submission form. Different label, same knob.
- The browser-based recovery-code flow exists in the database but no in-app form consumes it yet. The CLI reset is the working recovery path today.
- There is no manual approve/reject toggle on individual reviews — auto-publish runs at submit time based on the rating threshold.
- When the bio contains `[age]` but no date-of-birth is set, `[age]` shows as literal text on the public site. Set DOB before using the placeholder.

---

## Where to Get Help

This wiki is the **operating manual** — how to use the site and admin panel day-to-day.

For anything stranger or more technical (deployment, backups, CLI recovery, system internals, infrastructure changes), ask Alex. He maintains the technical operations runbook separately and will know what to do.
