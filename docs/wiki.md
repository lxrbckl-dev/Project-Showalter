# Project-Showalter — Wiki

> User guide for operating the Sawyer Showalter Services site.
> Written for Alex and Sawyer — non-technical audience where possible,
> with exact paths and CLI commands where useful.

## Overview

Project-Showalter is a self-hosted lawn-care business website built for Sawyer Showalter. It has two distinct surfaces: the **public-facing site** (what customers see) and the **admin panel** (where Sawyer runs the business). The public site lives at the root domain — customers scan a QR code on a door hanger, pick a day and time, fill out a short form, and submit a booking in under a minute. Everything on the public site — services, pricing, availability, gallery photos, and bio — is live-rendered from the database, so any change Sawyer makes in the admin panel is visible to customers on the very next page load, with no redeploy required.

The admin panel is secured by passkeys (Face ID / Touch ID on iPhone, fingerprint on Android — no passwords). Sawyer reviews incoming booking requests, accepts or declines them, marks jobs completed, requests reviews, and manages all site content from his phone. The admin panel can be installed as a **PWA** on iOS or Android: visit the site in Safari or Chrome, use "Add to Home Screen," and it will behave like a native app with push notifications when a new booking comes in.

---

## Quickstart — Local Development

**Prerequisites:** Node 22, pnpm 10

1. Clone the repo.
2. Install dependencies:
   ```
   pnpm install
   ```
3. Copy the env file (it has sane dev defaults with inline comments):
   ```
   cp .env.example .env.local
   ```
4. Run migrations to create `./dev.db`:
   ```
   pnpm db:migrate
   ```
5. Start the dev server with Sawyer's brief data pre-seeded:
   ```
   SEED_FROM_BRIEF=true pnpm dev
   ```
6. Open `http://localhost:5827`

**Admin quick entry:** Visit `/admin/login`. On a fresh database the founding-admin enrollment form appears automatically. Enroll your passkey, save the recovery code (shown once), and you land in the admin shell. Invite additional admins from `/admin/settings/admins`.

---

## First-Time Admin Setup

On a brand-new database (fresh deploy or local dev), there are no admins yet. Here is the full sequence to go from zero to a working admin account:

1. Visit `/admin/login` — the server detects the empty admins table and shows the **Claim founding admin** form instead of the normal sign-in form.
2. Enter your email and click **Claim founding admin**. Your device performs a passkey registration ceremony (Face ID, Touch ID, or security key).
3. A full-screen modal appears showing your **recovery code** — copy it somewhere safe. This code is shown exactly once. If you close the tab before copying it, use `pnpm admin:reset <email>` to start over.
4. Check "I've saved this code somewhere safe" and click **Continue**. Your session is finalized and you land in the admin shell at `/admin`.
5. To add Sawyer (or any other admin): go to `/admin/settings/admins`, enter their email, click **Create invite**, and share the generated link. The link is single-use, email-bound, and expires after 24 hours.

For full details on recovery, CLI commands, device management, and invite revocation, see **Part 2: Admin — Authentication & Accounts** below.

---

# Part 1: Public-Facing Site (for Customers)

The public surface of Project-Showalter is a single Next.js site at the root domain. All pages share a common header (the primary logo, linked to `/`) and a footer (the secondary diamond logo). No login is required for any customer-facing page.

---

### Landing Page

**URL:** `/`

The landing page is assembled server-side on every request — it reads live from the database so schedule changes, new services, and content edits are immediately visible without a redeploy.

Section order, top to bottom:

- **Header chrome** — Full-width bar containing the Showalter Lawn Care primary logo. Present on every public route (`/`, `/book`, `/bookings/*`, `/review/*`). Clicking the logo returns to `/`.
- **Hero** (`src/components/public/Hero.tsx`) — Full-viewport-width background image. Renders only if the admin has set a hero image in the Content settings. If no hero image is configured, this section is absent and the About section is the first thing visible.
- **Stats Band** (`src/components/public/StatsBand.tsx`) — A 4-card strip showing: average star rating (with review count), jobs completed, customers served, and years in business. Hidden until two conditions are both true: (1) `show_landing_stats` is enabled in admin settings and (2) at least `min_reviews_for_landing_stats` reviews exist (default: 3). Below the threshold the band is not rendered at all.
- **About** (`src/components/public/About.tsx`) — Sawyer's bio text, pulled from the admin Content settings. An "About Sawyer" heading with a "Trusted Lawn Care." eyebrow label. The bio supports a `[age]` placeholder that auto-updates from the admin-configured date of birth — so the age shown on the site stays current without editing copy. If no bio is set, this section is absent.
- **Services** (`src/components/public/Services.tsx`) — A styled table of all active services showing service name, description, and price. Prices are stored in cents and displayed as dollars (e.g. `$40`). A null price displays as "Contact for pricing." A caveat line reads "Prices are subject to change."
- **Request Service** (inline in `src/app/(public)/page.tsx`, anchor `#request`) — A centered call-to-action with a "Start booking" button linking to `/book`. This is the primary conversion point on the landing page.
- **Contact** (`src/components/public/Contact.tsx`) — Three icon buttons (phone, email, TikTok) for direct contact. See Contact Methods below.
- **Reviews / Gallery** (`src/components/public/Gallery.tsx`, section id `#reviews`) — A horizontally scrolling marquee of photos. Renders only if at least one active `site_photos` row exists. Photos auto-advance right-to-left; hovering pauses the animation. Captions, when present, appear as a semi-transparent overlay at the bottom of each card.
- **Footer chrome** (`src/components/public/Footer.tsx`) — Footer bar with the secondary diamond logo. No nav links, no text.

**Edge cases:**
- If the database has not been migrated yet, the landing page shows a "Site is being set up — check back soon." message instead of any content.
- The Gallery section is absent (graceful no-op) if no site photos are active — this is also the state before Phase 3 photos are seeded.

---

### Booking Flow

**URL:** `/book`
**Key file:** `src/components/public/booking/BookingFlow.tsx`

Customers request a service appointment through a 3-step wizard. The page is loaded fresh on every visit so availability is always current. JavaScript is required — there is no non-JS fallback.

**Entry states:**
- If no services are configured: a "No services listed yet" message is shown.
- If no time slots are open within the booking horizon: a "No openings right now" message is shown with a suggestion to text Sawyer directly from the home page.
- Otherwise, the booking wizard launches.

**Step 1 — Pick a day:**
- A grid of date buttons covering the configured booking horizon (default: 4 weeks from today).
- Each button shows the day label and slot count (e.g. "3 open") or "closed" if no slots are available.
- Only days with open slots are clickable. Closed days are shown but visually disabled.
- Days are presented in the site timezone (default: America/Chicago) so a customer opening the page late at night sees the correct local date.

**Step 2 — Pick a start time:**
- Shows available time slots for the chosen day as a vertical button list (e.g. "10:00 AM", "1:30 PM").
- A back link returns to the day picker.

**Step 3 — Fill the form:**
- Fields:
  - **Service** (required) — dropdown of active services
  - **Your name** (required, max 100 characters)
  - **Phone** (required, US format — normalized to E.164 on submission)
  - **Email** (optional)
  - **Service address** (required, max 500 characters)
  - **Notes** (optional, max 2000 characters — placeholder suggests gate code, yard size, etc.)
  - **Photos** (optional, multiple — accepted formats: JPEG, PNG, HEIC/HEIF, WebP)
- A honeypot field (invisible to real users) silently absorbs bot submissions.

**Step 4 — Submit and redirect:**
- On success, the browser navigates to `/bookings/<token>` — the customer's unique booking status page.
- If the chosen slot was taken by someone else while the form was open: the wizard resets to the day picker with an error banner ("That slot was just taken — please pick another time.").
- If rate-limited (more than 30 submissions per hour from the same IP by default): an error is shown and the form stays open.
- An Umami analytics event (`booking_submitted`) fires on successful submission.

**Key limits (from `site_config`, admin-editable):**

| Setting | Default | Effect |
|---|---|---|
| `booking_horizon_weeks` | 4 | How many weeks ahead customers can book |
| `min_advance_notice_hours` | 36 | Earliest bookable slot relative to now |
| `booking_spacing_minutes` | 60 | Minimum gap between any two bookings |
| `start_time_increment_minutes` | 30 | Granularity of slot times shown |
| `max_booking_photos` | 3 | Maximum photos per booking request |
| `booking_photo_max_bytes` | 10 MB | Maximum size per photo |

---

### Booking Status & Cancellation

**URL:** `/bookings/[token]`
**Key files:** `src/app/(public)/bookings/[token]/page.tsx`, `src/components/public/booking/CancelButton.tsx`

After submitting a booking, customers land on a personal status page identified by a secret token (a random UUID). Sharing the URL gives access — there is no login. An unknown token returns a standard 404 with no information to prevent enumeration.

The page shows different banners based on the current booking status:

| Status | Heading | Customer can cancel? |
|---|---|---|
| `pending` | "Request received" | Yes |
| `accepted` | "Appointment confirmed" | Yes |
| `declined` | "Sawyer couldn't take this one" | No |
| `canceled` | "Appointment canceled" | No |
| `expired` | "Request expired" | No |
| `completed` | "Job completed" | No |
| `no_show` | "Marked no-show" | No |

Below the status banner, a summary table shows: service name, date/time (displayed in the site timezone), customer name, phone, email (if provided), address, and notes.

If photos were submitted with the booking, they are displayed as a thumbnail grid below the summary. Clicking a thumbnail opens the full image.

**Rescheduling:** If Sawyer reschedules the booking through the admin panel, a yellow banner appears at the top of the page saying "This appointment was rescheduled" with a link to the new `/bookings/<new-token>` page.

**Cancellation (`CancelButton`):**
- Shown only when status is `pending` or `accepted`.
- Two-step confirmation: clicking "Cancel appointment" reveals a confirmation prompt. The customer must click "Yes, cancel" to proceed or "Keep it" to back out.
- On success the page reloads with a `canceled` status banner.
- If the booking is already in a terminal state when the cancel is submitted (e.g., Sawyer declined it moments earlier), an error message is shown.

**Calendar download:**
- A `.ics` (iCalendar) file is available at `/bookings/[token]/ics`.
- This endpoint is referenced in the confirmation email Sawyer sends — it is not linked directly from the booking status page itself.
- Downloading the file adds the appointment to any standard calendar app (Apple Calendar, Google Calendar, Outlook, etc.).
- The file includes the service name, start time, address, and any notes the customer provided.

---

### Review Submission

**URL:** `/review/[token]`
**Key files:** `src/app/(public)/review/[token]/page.tsx`, `src/app/(public)/review/[token]/_components/ReviewForm.tsx`

After a job is completed, Sawyer can send a customer a review link. The link contains a unique token — clicking it opens a review form with no login required. Unknown tokens return a 404.

**Flow:**
1. Customer opens their review link. The page greets them by name: "Hi [name] — thanks for letting Sawyer work on your service! How did it go?"
2. Customer picks a star rating (1–5, required). Stars are interactive — hovering highlights them; clicking locks in the selection.
3. Customer writes an optional text review (max 2000 characters).
4. Customer can attach photos (optional, same formats as booking photos: JPEG, PNG, HEIC/HEIF, WebP). The photo limit and per-photo size limit are pulled from the same `site_config` settings as the booking form.
5. Customer clicks "Submit review."
6. On success, the page switches to a "Thanks for your review!" terminal view. The submitted star rating is displayed (e.g., ★★★★☆). The form is gone — a second submission attempt is silently rejected.

**Auto-publish rule:**
- If the review rating is at or above `min_rating_for_auto_publish` (default: 4 stars) AND `auto_publish_top_review_photos` is enabled (default: on), any photos submitted with the review are automatically added to the public site gallery. The review text, if any, becomes the gallery caption.
- This happens immediately on submission — there is no approval step for auto-published photos.

**Edge cases:**
- The review token is single-use: once submitted, the form is replaced by the "Thanks!" page for anyone who opens the link again.
- The photo count limit shown in the form label is the admin-configured `max_booking_photos` value (same knob, different label on this form).

---

### Contact Methods

**URL:** `/` (Contact section, anchor `#contact`)
**Key file:** `src/components/public/Contact.tsx`

Three circular icon buttons appear in the Contact section. Any or all may be absent if not configured in the admin Content settings.

- **Phone** — a `tel:` link that dials the configured phone number directly. On mobile this launches the phone app. On desktop it depends on the OS.
- **Email** — a `mailto:` link. If `email_template_subject` and/or `email_template_body` are configured in the admin settings, the link pre-fills the email subject and body automatically when the customer's email client opens. This lets Sawyer guide the customer's message without them needing to type anything.
- **TikTok** — an external link to the configured TikTok profile URL, opening in a new tab.

All three are icon-only (no text labels) — each has an accessible `aria-label` ("Call Sawyer", "Email Sawyer", "Sawyer on TikTok") for screen readers.

---

### How Customers Receive Notifications

The site does **not** send SMS or email automatically. After Sawyer accepts or declines a booking in the admin panel, the admin inbox displays pre-composed message buttons. Sawyer taps a button to open his phone's SMS app or email client with the message body and customer contact pre-filled. He sends it manually.

The templates for these messages (confirmation, decline, review request) have admin-editable defaults and support placeholders like `[name]`, `[service]`, `[date]`, `[time]`, and `[address]`. The confirmation email template includes a calendar link (`[ics_link]`) pointing to `/bookings/[token]/ics` and a Google Calendar link (`[google_link]`).

When a customer submits a booking request, a Web Push notification is sent to Sawyer's device (if he has subscribed in the admin panel). This is a server-side background notification — not visible to the customer.

---

# Part 2: Admin — Authentication & Accounts

Project-Showalter uses **WebAuthn (passkeys)** for all admin authentication. There are no passwords. A session cookie (`swt-session`) is issued after a successful passkey ceremony and lasts 30 days with a sliding expiry.

---

### First-Time Setup

**What it is:** On a fresh deploy the `admins` table is empty. The first person to visit `/admin/login` is offered the "claim founding admin" form instead of the normal sign-in form.

**URL:** `/admin/login`

**Flow:**
- The server checks whether the `admins` table is empty. If empty, it renders `FoundingAdminForm`; if not, it renders `LoginForm`.
- The founding admin enters their email and clicks **Claim founding admin**.
- The browser performs a WebAuthn registration ceremony (device biometric or security key).
- The server verifies the attestation and — inside a single SQLite transaction — atomically inserts the admin row, the credential row, and a hashed recovery code. If two visitors race, the transaction's re-check plus the `admins.email` UNIQUE constraint guarantee exactly one winner; the loser receives a generic failure with no information leak.
- **The session is NOT minted yet.** Minting the session here would trigger a Next.js RSC refresh that would unmount the form before the recovery code modal could be shown, permanently destroying the one-time code.
- A full-screen modal appears displaying the plaintext recovery code. The user must check "I've saved this code somewhere safe" before the Continue button becomes active.
- On Continue, the session is finalized (cookie set) and the user is redirected to `/admin`.

**Security caveats:**
- The recovery code is shown **exactly once**. If the browser tab closes before the user copies it, the code is gone — use `pnpm admin:reset <email>` to wipe and re-enroll.
- The finalize step (session mint) only succeeds within 10 minutes of enrollment to cap the replay window on a stolen `{adminId, credentialId}` pair.
- The founding ceremony is rate-limited to 10 attempts per 10 minutes per IP.

---

### Normal Sign-In

**What it is:** A returning admin authenticates with the passkey registered to their account. No password is ever entered.

**URL:** `/admin/login`

**Flow:**
- Admin enters their email and clicks **Sign in**.
- The server validates the email matches an active, enrolled admin and issues a WebAuthn authentication challenge.
- The browser presents the passkey (biometric prompt or hardware key).
- The server verifies the assertion, bumps the credential counter (guards against cloned-authenticator replay), and creates a DB-backed session row.
- A session cookie (`swt-session`, HttpOnly, SameSite=Lax, Secure in production, Path=/) is set with a 30-day expiry.
- The user is redirected to `/admin`.

**Security caveats:**
- The middleware (`src/middleware.ts`) only checks for the cookie's presence; the real validation (`auth()`) runs server-side on every authenticated page, so a forged cookie value simply fails the DB lookup.
- Session expiry is sliding: each authenticated request that occurs with fewer than 29 days remaining resets the window back to 30 days.
- Login is rate-limited to 5 attempts per 10 minutes per IP.
- All failure paths return a single canonical error message regardless of the actual reason (no-enumeration principle).

---

### Recovery

**What it is:** If an admin loses access to their passkey device and cannot sign in, they use the 12-character recovery code that was shown at enrollment. There is no email or SMS reset path — `pnpm admin:reset` is the **only** other recovery option.

**Recovery code flow:**

_Note: `recovery.ts` implements `useRecoveryCode()` (marks the old code used, issues a new plaintext code), but no admin-facing UI form that calls this action was found in the current source tree. The in-browser recovery-code path may be planned or incomplete. Flagged for TPM._

**CLI reset (break-glass):**

```
pnpm admin:reset <email>
```

- Deletes all credentials and recovery codes for the admin.
- Sets `enrolled_at = NULL` (puts the admin back into pending/unenrolled state).
- The admin record and active flag are preserved.
- After the reset, the admin must be re-invited (or, if this is the founding admin, a server operator may need to clear the admin row manually so the founding form re-appears — `admin:reset` preserves the row).

**Security caveats:**
- `admin:reset` must be run on the server host with access to the database. It cannot be triggered via the web UI.
- There is no email/SMS fallback by design.
- Recovery codes are 12 characters from a Crockford-safe alphabet (A–Z excluding O/I, digits 2–9). They are bcrypt-hashed at rest (10 rounds); the plaintext is never stored.
- Each admin has exactly one active (unused) recovery code at any time. Using a code immediately rotates it: the old code is marked `used_at`, a new code is generated, and the new plaintext is returned once for display.

---

### Inviting New Admins

**What it is:** Any active enrolled admin can generate a single-use invite link tied to a specific email address. The recipient clicks the link and enrolls a passkey to claim their admin slot.

**URL (management UI):** `/admin/settings/admins`
**Acceptance URL:** `/admin/signup?token=<uuid>`

**Flow:**
- On `/admin/settings/admins`, fill in the **Invitee email** field (required) and an optional **Label** (up to 60 characters).
- Click **Create invite**. The server generates a UUID token, inserts an invite row with a 24-hour expiry, and returns the full invite URL.
- Copy the URL (one-click button) and send it to the invitee via your preferred channel.
- The invitee opens the URL. The server validates the token (must be pending, not expired/used/revoked). If invalid, a generic "couldn't sign in" error is shown — no reason is leaked.
- The invitee's email is pre-filled from the invite and is **read-only**. The server re-validates the email binding inside the acceptance transaction.
- The invitee clicks **Enroll passkey** and completes the WebAuthn registration ceremony.
- A recovery code modal appears (same flow as founding-admin enrollment — session minting is deferred until the modal is dismissed).
- On Continue, the session is minted and the invitee lands on `/admin`.

**Security caveats:**
- Invites expire in **24 hours** — non-configurable.
- Invites are **email-bound**: the token only works for the email address it was created for. The server enforces this inside the acceptance transaction.
- Invites are **single-use**: accepting marks the row `used_at` and `used_by_admin_id`.
- You cannot invite an email that already belongs to an active admin.
- The invite URL contains the full UUID token. Treat it like a one-time password — send it over a secure channel and revoke it if you suspect it was intercepted.

---

### Revoking Invites

**What it is:** An admin can cancel a pending invite before it is accepted.

**URL (UI):** `/admin/settings/admins` — each pending invite in the Outstanding Invites table has a Revoke button.

**CLI (break-glass):**

```
pnpm admin:revoke-invite <token-prefix>
```

- Pass at least 6 characters of the token prefix (visible via `pnpm admin:list-invites`, which shows the first 8 characters).
- The CLI errors out if the prefix is ambiguous (matches more than one invite).
- Idempotent: revoking an already-revoked invite returns success.
- Cannot revoke an invite that has already been used (status `used`) — returns an error.

**Security caveats:**
- The full token is never printed to the terminal (scrollback/history leak). Use the UI to re-send the full link.
- Revocation applies to pending and expired invites. A used invite cannot be revoked — the admin account that accepted it must be disabled separately.

---

### Device Management

**What it is:** Each admin can register multiple passkeys (one per device). The `/admin/settings/devices` page lets you view, rename, add, and remove passkeys for your own account only.

**URL:** `/admin/settings/devices`

**Features:**
- **Current device** is highlighted with a "This device" badge.
- **Add another device:** Click **Add another device**, complete the WebAuthn registration ceremony on the new device, then optionally name it via a browser prompt. The server passes existing credential IDs in `excludeCredentials` so the browser refuses to re-register the same authenticator.
- **Rename:** Inline input on any device row. Labels can be up to the configured `LABEL_MAX_LEN`.
- **Remove:** Available on non-current device rows when more than one device is registered. Requires a browser confirm dialog.

**Security caveats:**
- You **cannot remove the device you are currently signed in with** — the UI hides the Remove button on the current-device row, and the server action enforces this independently.
- You **cannot remove your last passkey** — doing so would permanently lock the account out of web sign-in. The UI disables the Remove button when only one device remains, and the server re-checks.
- Removing a device also invalidates any session that was established with that credential (the session row stores `credential_id`; the next auth read for that session will fail).
- Only your own devices are accessible — `listMyDevices()` enforces the session boundary server-side.

---

### Admin Account Management

**What it is:** Any active enrolled admin can view all admins and soft-disable or re-enable other admins. Hard-delete is never exposed.

**URL:** `/admin/settings/admins`

**Columns shown:** email, status (Active / Disabled / Pending), date added, device count.

**Disable an admin:**
- Click **Disable** on any row that is not your own. The server refuses to disable the last active enrolled admin (lockout guard). You cannot disable your own account via the UI (the button is hidden; the server action also rejects it).
- A disabled admin's row is preserved for audit purposes. Their existing sessions remain in the DB but will fail `requireAdmin()` checks on the next request.

**Enable an admin:**
- Click **Enable** on a disabled row. Takes effect immediately.

**Security caveats:**
- You cannot disable yourself. The UI hides the button and the server enforces it independently (defense in depth).
- The system will not allow disabling the last active enrolled admin — the error message reads "Can't disable the only enabled admin — the team would be locked out."

---

### Session Lifecycle

- **Cookie name:** `swt-session`
- **Cookie flags:** HttpOnly, SameSite=Lax, Secure (production), Path=/
- **Initial TTL:** 30 days
- **Sliding expiry:** Extended back to 30 days on any authenticated read where fewer than 29 days remain (effectively refreshed at most once per day).
- **Sign-out:** Deletes the session row from the DB and clears the cookie. Available via the **Sign out** link in the admin shell header.
- **Expired sessions:** Cleaned up lazily — the session row is deleted the first time an expired token is seen by `auth()`.
- **Middleware:** `src/middleware.ts` gates all `/admin/*` routes except `/admin/login` and `/admin/signup` (which must remain accessible to unauthenticated users). Presence of the cookie is checked at the edge; validity is enforced by `auth()` on the server.

---

### CLI Reference (Auth)

All commands run directly against the SQLite database on the server host. Must be executed in the project root with the app's environment loaded.

```
pnpm admin:list
  # Print a table of all admins with columns:
  # email, active (yes/no), enrolled_at (ISO or "(not enrolled)"), device_count

pnpm admin:reset <email>
  # Reset an admin to pending-enrollment state.
  # Deletes all credentials and recovery codes; sets enrolled_at = NULL.
  # The admin row and active flag are preserved.
  # THE ONLY recovery path if a passkey is lost and no recovery code was saved.

pnpm admin:disable <email>
  # Soft-disable an admin (sets active = 0).
  # Admin cannot sign in while disabled. Record preserved for audit.
  # Skips the last-enabled-admin guard — use with care from the CLI.

pnpm admin:enable <email>
  # Re-enable a soft-disabled admin (sets active = 1).
  # Takes effect immediately.

pnpm admin:list-invites
  # Print all invite rows with columns:
  # token_prefix (first 8 chars), email, status, label, expires_at, invited_by.
  # Full token is deliberately truncated to avoid scrollback leaks.

pnpm admin:revoke-invite <prefix>
  # Revoke an outstanding invite by token prefix (minimum 6 characters).
  # Errors if prefix is ambiguous (matches > 1 invite).
  # Idempotent for already-revoked invites.
  # Cannot revoke an invite that has already been accepted (status: used).
```

---

# Part 3: Admin — Site Content Management

All admin panels require an active session (passkey authentication). Every mutation goes through a Next.js server action, calls `revalidatePath('/')` (and the relevant admin path) on success, and takes effect on the public site at the next page load — no deploy required. The public site pages are declared `force-dynamic`, so there is no stale cached version to worry about.

The single source of truth for non-service site content is the `site_config` table, which always contains exactly one row (seeded at migration time). Services live in the `services` table; gallery images live in `site_photos`.

---

### Content Tab (`/admin/content`)

**URL:** `/admin/content`

A four-tab editor covering all non-service, non-schedule public-facing content. The page is a server component that fetches the current `site_config` row and passes it to four client-side form components. If the row is missing (un-migrated or un-seeded DB), the page shows an error prompt instead of the forms.

#### Contact sub-tab

**Component:** `src/components/admin/content/ContactForm.tsx`
**Server action:** `updateContact` in `src/features/site-config/actions.ts`

| Field | Type | Validation | What it drives on the public site |
|---|---|---|---|
| **Owner first name** | Text | Optional; 1–40 chars; letters/spaces/hyphens/apostrophes only | "About {name}" heading in the About section; falls back to generic "About" when unset |
| **Phone** | Tel | Optional; E.164 format (`+` followed by 8–15 digits, e.g. `+19133097340`) | Phone link in Contact section; SMS fallback "text Sawyer" link |
| **Email** | Email | Optional; RFC 5321, max 254 chars | `mailto:` link in Contact section |
| **TikTok URL** | URL | Optional; must parse as a valid URL | TikTok social link in Contact section |
| **Email template subject** | Text | Optional; 1–200 chars; no control characters | Pre-fills the `mailto:` subject when a visitor clicks Email |
| **Email template body** | Textarea | Optional; 1–2000 chars; multiline; no control characters | Pre-fills the `mailto:` body when a visitor clicks Email |
| **Date of birth** | Date (`YYYY-MM-DD`) | Optional; must be a valid calendar date (rejects impossible dates like `2010-02-30`); cannot be in the future; compared at UTC midnight | Feeds the `[age]` placeholder in the bio — see below |
| **Bio** | Textarea | Optional; max 2000 chars | About section body text |

**The `[age]` placeholder:** Insert the literal string `[age]` anywhere in the bio text. On each public page render, the server replaces it with Sawyer's current age calculated from the stored DOB (`src/lib/age.ts`). This means the rendered age stays current automatically year-over-year without any admin action. If DOB is not set, the placeholder is left in place (unclear behavior — the placeholder text will appear verbatim on the public site, so DOB should be set before using `[age]`).

All fields are optional. Saving with an empty value for a nullable field stores `NULL`. Phone and email stored as `NULL` suppress the corresponding contact links on the public site.

#### Hero Image sub-section (within Contact tab)

**Component:** `src/components/admin/content/HeroImageForm.tsx`
**Server actions:** `uploadHeroImage`, `removeHeroImage` in `src/features/site-config/actions.ts`

Renders below the contact form fields on the Contact tab. Displays the current hero image as a thumbnail preview (if set) with a Remove button, plus a file picker for uploading a new image.

- **Accepted formats:** JPEG, PNG, WebP, HEIC, HEIF (`image/jpeg,image/png,image/webp,image/heic,image/heif`)
- **Size limit:** 10 MB hard cap (enforced server-side before any disk write)
- **MIME validation:** Magic-byte sniffing — the file extension and browser-reported Content-Type are ignored. A renamed file will be detected by its actual bytes.
- **EXIF stripping:** Applied automatically to JPEG, HEIC, and HEIF files before saving. Strips APP1–APP15 (EXIF, XMP) and COM segments from the JPEG stream while preserving APP0 (JFIF) for compatibility. PNG and WebP are written as-is (no EXIF in those formats). If stripping fails, the upload is rejected rather than saving a potentially GPS-tagged original.
- **Storage path:** `/data/uploads/site/hero/<uuid>.<ext>` — `<ext>` is derived from the sniffed MIME, never from the original filename.
- **No hard deletes:** The previous hero file remains on disk when a new one is uploaded or the image is removed. `removeHeroImage` only sets `hero_image_path = NULL` in `site_config`. If no hero image is set, the landing page shows a gradient placeholder.

#### SMS Fallback sub-tab

**Component:** `src/components/admin/content/SmsForm.tsx`
**Server action:** `updateSmsTemplate`

Single textarea for the `sms_template` field. This text pre-fills the body when a visitor taps the "Text Sawyer directly" fallback link in the landing page footer. The field is required (min 1 character) — blank values are rejected. The placeholder hint shown in the form is `"Hi, this is [name here]. I'm interested in your services..."` but this is only UI guidance; no automatic substitution occurs for this field (unlike the six booking notification templates).

#### Templates sub-tab

**Component:** `src/components/admin/content/TemplatesForm.tsx`
**Server action:** `updateTemplates`

Edits all six booking-notification message templates in a single form. Each template is a freeform textarea with a badge list showing which substitution placeholders are valid for that template type. All six are required (min 1 character).

| Template | Valid placeholders |
|---|---|
| **Confirmation — Email** | `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[google_link]`, `[ics_link]` |
| **Confirmation — SMS** | `[name]`, `[service]`, `[date]`, `[time]`, `[shortlink]` |
| **Decline — Email** | `[name]`, `[service]`, `[date]` |
| **Decline — SMS** | `[name]`, `[service]`, `[date]` |
| **Review Request — Email** | `[name]`, `[service]`, `[link]` |
| **Review Request — SMS** | `[name]`, `[link]` |

Placeholder substitution (replacing `[name]` with the actual customer name at send time) is implemented in `src/features/templates/render.ts` and `vars.ts` — not in the admin tab itself. The admin tab only provides the catalog/hints via `src/features/templates/variables.ts`.

#### Settings sub-tab (within Content page)

**Component:** `src/components/admin/content/SettingsForm.tsx`
**Server action:** `updateSettings`

Controls business identity, booking-flow knobs, photo limits, and public-stats display. See the dedicated [Booking/Settings Knobs](#bookingsettings-knobs) section below for the full field table.

---

### Services (`/admin/services`)

**URLs:** `/admin/services` (list), `/admin/services/new` (create), `/admin/services/[id]/edit` (edit)

Manages the price-list entries displayed in the Services section of the public landing page.

#### List page (`/admin/services`)

Server component. Fetches all services ordered by `active DESC, sort_order ASC` (active services first, then by sort position). Renders two sections:

1. **All services table** (`ServicesTable`) — shows every service with View/Edit links and Archive/Restore toggles.
2. **Reorder active services** (`SortableServicesList`) — drag-and-drop panel for adjusting display order. Only active services (`active = 1`) appear in the drag list. Inactive services are excluded. On drop, calls `reorderServices(orderedIds[])` which bulk-updates `sort_order` in a single SQLite transaction (assigns `sort_order = index + 1` per position). The optimistic UI updates immediately; a failure shows an error prompting the user to refresh.

#### Create / Edit forms (`ServiceForm`)

Fields available on both create and edit:

| Field | Validation | Notes |
|---|---|---|
| **Name** | Required; 1–100 chars | Displayed as the service title on the public site |
| **Description** | Required; 1–500 chars | Displayed below the name |
| **Price (cents)** | Optional integer ≥ 0, or `null` | `null` renders as "Contact for pricing" on the public site. Stored as integer cents to avoid floating-point rounding. |
| **Price suffix** | Optional; max 4 chars | Appended after the price, e.g. `+` for variable-price jobs or left blank for fixed-price |
| **Sort order** | Integer (default 0) | Lower values appear first; overridden by drag-to-reorder |

New services are created with `active = 1` (immediately visible). The edit form does not expose the `active` flag — toggling is done via the Archive/Restore buttons in the list table.

**Soft-archive only:** `archiveService` sets `active = 0`; `restoreService` sets `active = 1`. No hard deletion is ever performed. Archived services remain in the DB and reappear on the admin list with a Restore button but do not appear on the public site.

Both create and edit redirect to `/admin/services` on success, calling `revalidatePath('/')` and `revalidatePath('/admin/services')`.

---

### Gallery & Photos (`/admin/gallery`)

**URL:** `/admin/gallery`

Manages the gallery of site-visible photos displayed on the public landing page. Photos can be manually uploaded here, and may also be auto-promoted from customer reviews (see auto-publish path below).

The page is a server component. It fetches all `site_photos` rows and splits them into `active` (shown on public site) and `archived` (hidden) sets.

#### Uploading Photos

**Component:** `src/components/admin/gallery/GalleryUploadForm.tsx`
**Server action:** `uploadPhoto`

- **Accepted formats:** JPEG, PNG, WebP, HEIC, HEIF — same file-type constraints and EXIF-stripping pipeline as hero images (see above).
- **Size limit:** 10 MB per file.
- **Caption:** Optional free-text field, max 200 chars, trimmed — empty strings stored as `NULL`.
- **Storage path:** `/data/uploads/site/gallery/<uuid>.<ext>`
- **Sort order:** New uploads are appended to the end. The server computes `MAX(sort_order) + 1` at insert time. If the table is empty, `sort_order = 0`.
- **Active by default:** Uploaded photos are immediately visible on the public site (`active = 1`).
- On success the form resets itself (`formRef.current.reset()`).

#### Managing Existing Photos

**Component:** `src/components/admin/gallery/GalleryPhotoCard.tsx`

Each photo card in the active or archived grid provides:

- **Thumbnail** — served from `/uploads/<filePath>`.
- **Caption editor** — inline input (max 200 chars) with a Save button. Calls `updatePhotoCaption` which trims the input and stores `NULL` for blank. Revalidates both `/` and `/admin/gallery`.
- **Archive / Restore button** — `archivePhoto` sets `active = 0`; `restorePhoto` sets `active = 1`. No hard deletion. Archived photos appear in a separate grid at the bottom of the page with dashed borders and an "Archived" overlay badge. The file remains on disk indefinitely.

#### Drag-to-Reorder

**Component:** `src/components/admin/gallery/SortableGalleryList.tsx`

Grid-based drag-and-drop (using `@dnd-kit/sortable` with `rectSortingStrategy`). Only active photos participate. On drop, calls `reorderPhotos(orderedIds[])` which runs all `sort_order` updates inside a single SQLite transaction (assigns `sort_order = index` per position, 0-indexed). Optimistic update with error fallback.

#### Review Auto-Publish Path

Photos submitted with customer reviews can be automatically promoted into the gallery. The `site_photos` schema includes a `source_review_id` column (nullable integer; a real FK constraint against `reviews(id)` is planned for Phase 9). The auto-publish threshold is controlled by `min_rating_for_auto_publish` and the `auto_publish_top_review_photos` flag, both configurable in the Settings sub-tab of the Content page. When auto-publish is enabled, reviews at or above the threshold rating have their attached photos inserted into `site_photos` with `active = 1` — they immediately appear in the public gallery and in the admin grid alongside manually uploaded photos.

---

### Schedule (`/admin/schedule`)

**URL:** `/admin/schedule`

Controls Sawyer's availability — which days and hours he is open for bookings. The page is a server component declared `force-dynamic`. It reads from three tables (`weekly_template_windows`, `availability_overrides`, `availability_override_windows`) and passes serialized data to a single client component, `ScheduleEditor`.

**Component:** `src/app/(admin)/admin/(shell)/schedule/ScheduleEditor.tsx`

The editor has two side-by-side panels:

#### Weekly Template (left panel)

Sets recurring availability for each day of the week (Sunday–Saturday). Each day shows its current open windows. A day with no windows is treated as "Closed" on that weekday.

- **Add window:** Inserts a draft row defaulting to `09:00–17:00`. Times are entered via `<input type="time">` (24-hour HH:MM format).
- **Remove window:** Removes a draft row before saving.
- **Save:** Calls `setTemplateDay(dayOfWeek, windows[])`. The server action replaces all windows for that weekday atomically in a single transaction (delete-then-insert). An empty array closes the day.
- **Cancel:** Reverts the local draft to the last saved state.

**Validation (server-side):**
- `day_of_week` must be integer 0–6.
- Each time string must match `HH:MM` 24-hour format.
- End time must be strictly after start time.
- No two windows on the same day may overlap (pairwise check; adjacent windows like `10:00–12:00` + `12:00–14:00` are allowed — half-open interval semantics).

#### Date Overrides (right panel)

Overrides the weekly template for specific calendar dates — useful for vacations, holidays, or one-off extended hours.

- **Date picker:** Selects the target date (defaults to today).
- **Note:** Optional free-text field (e.g. "out of town").
- **Mark closed:** Calls `closeDate(date, note)`. Upserts an `availability_overrides` row with `mode = 'closed'` and clears any existing override windows for that date.
- **Mark open with custom windows:** Calls `openDateWithWindows(date, windows[], note)`. Upserts an `availability_overrides` row with `mode = 'open'` and replaces all override windows for that date. Uses the same window editor as the template panel.
- **Clear (on existing override):** Calls `clearOverride(date)`. Deletes the override row and its child windows, restoring the template's effect for that date. This is the only delete operation in the schedule feature; it is safe because it only removes an override, not the underlying template.

Existing overrides are listed below the date picker with color badges (red for closed, green for open) and their associated windows. Each has a Clear button.

All schedule mutations call `revalidatePath('/admin/schedule')`. The public booking slot generator (`src/features/availability/resolver.ts`) reads from the same tables and is re-evaluated on each request.

---

### Booking / Settings Knobs

**URL (within Content page):** `/admin/content` → Settings tab
**Component:** `src/components/admin/content/SettingsForm.tsx`
**Server action:** `updateSettings`

The Settings sub-tab of the Content page controls all numeric and toggle knobs for the booking flow and public-stats display. All fields are required (non-nullable with defaults).

| Field | Default | Validation | What it does |
|---|---|---|---|
| **Site title** | `Sawyer Showalter Service` | 1–60 chars, required | Displayed in the Hero eyebrow, page `<title>`, OG/Twitter card metadata, and the dynamic Open Graph image. Stored in mixed-case; the Hero component uppercases via Tailwind CSS. |
| **Year founded** | `2023` | Integer; ≤ current year | "X years in business" or similar stat on the public landing page |
| **Timezone** | `America/Chicago` | Must be a valid IANA timezone (validated against `Intl.supportedValuesOf('timeZone')` at runtime on Node 18+) | Controls how appointment times are interpreted and displayed throughout the booking flow |
| **Booking horizon (weeks)** | `4` | Integer ≥ 1 | How far in advance customers can book. The booking calendar will not show slots beyond today + N weeks. |
| **Start time increment (minutes)** | `30` | One of: 15, 20, 30, 60 | The granularity of time slots offered in the booking flow. A 30-minute increment with a 9:00–17:00 window yields slots at 9:00, 9:30, 10:00, etc. |
| **Booking spacing (minutes)** | `60` | Integer 0–240 | Buffer time after each booking before the next slot is offered. Prevents back-to-back appointments. Set to 0 for no buffer. |
| **Min advance notice (hours)** | `36` | Integer ≥ 0 | How far ahead of the current time a slot must be before it is offered. Prevents same-day or very-short-notice bookings. Set to 0 to allow immediate bookings. |
| **Max photos per booking** | `3` | Integer ≥ 0 | Maximum number of photos a customer can attach to a booking request. Set to 0 to disable photo uploads. |
| **Max photo size (bytes)** | `10485760` (10 MB) | Integer ≥ 1 | Per-file size cap for booking photo uploads. The helper text in the form displays "Default 10485760 = 10 MB". |
| **Photo retention after resolve (days)** | `30` | Integer ≥ 0 | How many days booking-attachment photos are retained after the booking is resolved (completed/cancelled). After this period they are eligible for cleanup. |
| **Show landing stats band** | `1` (on) | Toggle (boolean stored as INTEGER 0/1) | Whether the stats band ("X bookings completed", "Y 5-star reviews", etc.) is visible on the landing page |
| **Min reviews to show stats band** | `3` | Integer ≥ 0 | The stats band is suppressed even if the toggle is on if fewer than this many reviews exist. Prevents showing "1 review" on a new site. |
| **Min rating for auto-publish (1–5)** | `4` | Integer 1–5 | Reviews at or above this star rating are eligible for having their photos auto-promoted to the gallery (when `auto_publish_top_review_photos` is also on) |
| **Auto-publish top review photos** | `1` (on) | Toggle (boolean stored as INTEGER 0/1) | When enabled, photos attached to qualifying reviews (rating ≥ threshold) are automatically inserted into `site_photos` with `active = 1` |

**Boolean switch behavior:** HTML `<input type="checkbox">` / Shadcn `<Switch>` components send `"on"` when checked and are absent from the `FormData` when unchecked. The server action normalizes this to `'1'` or `'0'` before Zod validation, which then coerces to integer.

**Seeding defaults:** The `site_config` migration (`drizzle/0000_initial.sql`) inserts one row with all non-personal defaults pre-populated (booking knobs, timezone, site title, etc.). Personal fields (`phone`, `email`, `tiktok_url`, `bio`, `hero_image_path`) are left `NULL` until populated via the Content tab. The settings knobs are therefore functional from the moment the DB is migrated, even on a fresh installation.

---

### General Patterns

- **No hard deletes anywhere.** Services are archived (`active = 0`). Gallery photos are archived (`active = 0`). Hero image files stay on disk when replaced or removed. Schedule overrides can be cleared (which is the intended undo operation, not a destructive action).
- **All mutations use server actions** (`'use server'`) and call `revalidatePath` on both the admin page and `/` so both the admin list and the public page reflect the change on next load.
- **Optimistic UI on drag-to-reorder** — both services and gallery reorder panels update their local state immediately on drag end and persist via a `useTransition`-wrapped server action call in the background. An error message is shown (and the user is told to refresh) if the server call fails.
- **Validation is always server-side.** Client-side HTML constraints (`maxLength`, `min`, `max`, `type="email"`, etc.) provide UX feedback, but Zod schemas in server actions are the authoritative validators. Field-level errors are returned as `{ ok: false, errors: Record<string, string[]> }` and rendered inline beneath each input.
- **The `/admin/(shell)/settings` page** is a separate route (`/admin/settings`) that links to device/passkey management and admin-roster management — it is an account-security hub, not a site-content editor. It should not be confused with the "Settings" sub-tab inside `/admin/content`.

---

# Part 4: Admin — Daily Operations

This section describes the day-to-day admin workflows after a customer books or leaves a review. All admin surfaces live under `/admin` and require an authenticated session.

---

### Admin Dashboard

**URL:** `/admin`

The first screen after login. It is intentionally minimal — a quick-look at what needs attention right now.

**What it shows:**

- **Welcome banner** — displays the logged-in admin's email address.
- **Push notification control** — the `PushSubscribeButton` component appears prominently. If the browser supports Web Push (service worker + Notification + PushManager APIs), the admin can enable or disable push notifications for this device from here.
- **Pending bookings card** — a large count of bookings in `pending` status with a link to the full Inbox. Count is pulled from `getHeaderStats()`.
- **Confirmed this week card** — count of `accepted` bookings whose start time falls within the next 7 days.
- **Needs attention list** — confirmed bookings whose start time has already passed. These need to be closed out (marked completed or no-show). Each row links directly to the booking detail page. The list is pulled from `getInboxQueue()`.

The dashboard does not duplicate the header-level stats shown in the shell layout.

---

### Inbox

**URL:** `/admin/inbox`

The primary triage surface. Two views toggled via query string:

- **Queue** (`/admin/inbox` or `?view=queue`) — live bookings needing action, split into three labeled sections:
  - **Pending** — awaiting an Accept or Decline decision.
  - **Confirmed upcoming** — accepted and in the future; no urgent action required.
  - **Needs attention** — confirmed bookings whose start time has passed; must be closed out.
- **History** (`?view=history`) — terminal bookings (completed, no-show, declined, canceled, expired), paginated 25 per page. Navigate older/newer with `&page=N`. Each row shows customer name + phone, service, formatted appointment time, and status badge.

The Queue view also renders the **Standalone Review Widget** at the top (see below). Clicking any row in either view navigates to `/admin/inbox/[bookingId]`.

#### Standalone Review Widget

Embedded at the top of the Queue view. Purpose: send a review request to a customer who was served before the app existed — no associated booking.

**Flow:**
1. Admin types a name, phone, or email in the search box and clicks **Search** (or presses Enter).
2. The widget calls `searchCustomersAction` and shows matching customers from the Index Book.
3. Admin clicks a customer. The widget calls `requestStandaloneReview(customerId)`, which inserts a `reviews` row with `booking_id=NULL` and a fresh UUID token, then calls `composeStandaloneReview(reviewId)` to produce mailto/sms hrefs.
4. The widget shows **Send email request** (blue) and **Send text request** (green) buttons. Clicking either opens the native mail or messages app with the body pre-filled.
5. The review link (`/review/<token>`) is shown for manual sharing if neither channel is available.

A "Send another" link resets the widget to idle.

---

### Booking Decisions

**URL:** `/admin/inbox/[bookingId]`

The booking detail page. Shows full booking data (service, start time, phone, email, address, notes, status, created/decided timestamps, customer token URL), any customer-uploaded photos, and the set of available actions determined by the state machine.

#### State Machine

Transitions are enforced by `availableAdminActions()` in `src/features/bookings/state.ts`:

| Status | Available actions |
|--------|-------------------|
| `pending` | Accept, Decline, Reschedule |
| `accepted` (future) | Reschedule, Cancel |
| `accepted` (past start time) | Mark completed, Mark no-show |
| Any terminal status | None |

Terminal statuses: `completed`, `no_show`, `declined`, `canceled`, `expired`.

#### Actions and Their Effects

**Accept** (`pending → accepted`)
- DB: sets `status='accepted'`, `decided_at=now`, `updated_at=now`.
- Revalidates inbox + detail paths + landing stats cache.
- After accepting, the page shows **Send confirmation** buttons (email + SMS) that open the native mail/messages app with the `confirmation_email` / `confirmation_sms` template pre-filled.

**Decline** (`pending → declined`)
- Requires browser confirmation dialog ("Decline this request? This cannot be undone.").
- DB: sets `status='declined'`, `decided_at=now`, `updated_at=now`. The partial UNIQUE index releases the time slot.
- After declining, the page shows **Send decline** buttons using the `decline_email` / `decline_sms` templates.

**Reschedule** (available on `pending` and `accepted`-future)
- Opens an inline form with a `datetime-local` input.
- The server action (`rescheduleBooking`) cancels the original booking (sets it to `canceled`) and creates a new one at the new time with `status='accepted'`.
- On success, the UI navigates to the new booking's detail page. The original booking shows a "Rescheduled to…" banner; the new booking shows a "This booking replaces…" banner.
- Fails with `slot_taken` if another booking occupies the target slot.

**Cancel** (`accepted` → `canceled`)
- Admin-initiated cancellation of an accepted future booking.
- No in-app notification is inserted (the admin is the initiator). Slot released.

**Mark completed** (`accepted` → `completed`, terminal)
- Requires browser confirmation. Sets `status='completed'`, makes the booking terminal.
- After marking completed, the **Request review** section appears (see below).

**Mark no-show** (`accepted` → `no_show`, terminal)
- Requires browser confirmation. Sets `status='no_show'`, terminal.

All action buttons use an **optimistic lock** (`expectedUpdatedAt`). If a concurrent write has changed the booking since the page loaded, the action returns a conflict error and prompts the admin to refresh.

#### Confirmation / Decline Buttons

After a decision, mailto and sms buttons appear on the detail page. Each button opens the native OS mail or messages client with the subject and body pre-filled from the corresponding template (rendered against booking data). If the customer has no email on file, the email button is shown disabled with a reason label. SMS buttons are always shown when a phone number is on file.

#### Review Request (on completed bookings)

Once a booking is `completed`, a **Request review** panel appears.

- If no pending review exists: a **Generate review request** button calls `requestReviewForBooking(bookingId)`, which inserts a `reviews` row (status `pending`, fresh UUID token). On success, the page refreshes into the next branch.
- If a pending review exists: **Send email review request** and **Send text review request** buttons appear, opening the mail/messages app with the `review_request_email` / `review_request_sms` template body pre-filled and the tokenized link (`/review/<token>`) embedded.

The tokenized link is also shown inline for manual sharing.

---

### Reviews

**URL:** `/admin/reviews` and `/admin/reviews/[id]`

#### Reviews List (`/admin/reviews`)

Tabular list of all submitted reviews, paginated 25 per page. Columns: submitted date, customer (name + phone), star rating, review text excerpt, photo count.

**Filters** (applied via GET form parameters, all combinable):
- `q` — customer name, phone, or email (SQL LIKE search via `listReviews()`).
- `rating` — exact star rating (1–5).
- `from` / `to` — ISO date range on `submitted_at`.

A **Clear** link appears when any filter is active. Pagination uses `?page=N`.

#### Individual Review (`/admin/reviews/[id]`)

Read-only detail view (Phase 9). Shows:
- Star rating (rendered as `★` glyphs).
- Full review text.
- Photo grid — each photo links to the original file in `/uploads/`. Photos served at `/uploads/<filePath>`.
- Metadata: status (`pending` or `submitted`), requested date, submitted date, type (booking-tied vs standalone), link to the associated booking if one exists, and the customer's tokenized review URL.

**Note on moderation and auto-publish:** There is no manual approve/reject action on the admin review detail page in the current codebase. The auto-publish rule runs automatically at submission time (customer-side): if `rating >= site_config.min_rating_for_auto_publish` (default 4) AND `site_config.auto_publish_top_review_photos = 1` AND the customer uploaded photos, those photos are copied into `site_photos` (the public gallery) automatically. The Phase 9 note in the source code states that soft-archive toggle and inline text edit are planned for a future phase. Flag for TPM: manual moderation controls (approve/reject toggle) are not yet implemented.

---

### Index Book

**URL:** `/admin/index-book` and `/admin/index-book/[customerId]`

The customer directory ("INDEX book"). Stores a record for every customer who has ever booked.

#### List View (`/admin/index-book`)

Search box queries name, phone, email, or address (SQL LIKE). Table columns: name, phone, email, total booking count, last booking date. Paginated 25 per page. Clicking a row navigates to the customer detail page.

#### Customer Detail (`/admin/index-book/[customerId]`)

Comprehensive single-customer view, organized in sections:

- **Master info** — name, phone, email, customer since date. Display only.
- **Admin notes** — free-text textarea (max 2,000 characters), saved via `updateCustomerNotes` server action. Inline save button with live character count and saved/error feedback. Changes persist to `customers.notes` in the DB.
- **Review request** — a **ReviewRequestButton** that calls `requestStandaloneReview(customerId)` to create a standalone review row, then redirects to the resulting mailto/sms interface. Used for pre-app customers who need a review link without an associated booking.
- **Address history** — all addresses used across bookings, sorted by `last_used_at` descending.
- **Bookings** — chronological table of every booking for this customer (date, address, status badge, link to inbox detail).
- **Reviews** — list of all reviews (pending and submitted) with star rating, text excerpt, status badge, and link to the review detail page.
- **Photos** — gallery of all review photos attached to this customer's reviews.

---

### Walk-In Bookings

**URL:** `/admin/bookings/new`

Creates a booking on behalf of a customer who called or walked in — bypassing the public booking flow. Status is always set to `accepted` on creation (no pending state).

**Form modes:**

- **Existing customer** — dropdown pre-populated with recent customers (up to 6). Selecting one shows their name, phone, email, and last known address. Admin can override or provide a fresh address.
- **New customer** — inline fields for name, phone (required), email (optional), and address.

In both modes, the admin picks a service (from the active service list), a start time (`datetime-local`, displayed in the site timezone), and optional notes.

**Soft warnings:** The server action (`adminCreateBooking`) checks advance-notice (`too_soon` — start time is inside the minimum advance-notice window) and slot spacing (another booking is within the configured buffer). These are warnings, not hard blocks. When warnings fire, the form shows a yellow banner describing each warning and swaps the submit button to **Submit anyway** (`force=true`). The admin can also click **Edit and retry** to adjust the time.

On success, the admin is redirected to the new booking's detail page.

---

### Notifications & Push

#### Notifications Inbox (`/admin/notifications`)

**URL:** `/admin/notifications`

An in-app feed of system events, paginated 25 per page, sorted newest first. Unread rows are highlighted with an accent background.

**Current notification kinds:**
- `booking_canceled_by_customer` — fired when a customer cancels an accepted booking from their tracking link. Rendered as: "Customer canceled: [service] on [date] — [name]".
- `pending_reminder_24h` — fired by the reminders cron job when a booking has been pending for 24 hours without a decision.
- `pending_reminder_48h` — fired at 48 hours pending.
- `booking_expired` — fired by the auto-expire cron when a pending booking is automatically expired after 72 hours.

**Actions:**
- **Mark read** (per-row) — marks a single notification as read via `markAsRead([id])`.
- **Mark all read** (page header) — marks all notifications as read via `markAllAsRead()`. Idempotent.

For booking-scoped notifications, an **Open booking** button links directly to the relevant booking detail page.

The header badge in the admin shell shows the unread count and updates on navigation.

#### Push Notifications (`PushSubscribeButton`)

Rendered on the dashboard (`/admin`). Uses the Web Push API (requires HTTPS, service worker, and `VAPID_PUBLIC_KEY` environment variable).

**Setup flow:**
1. The component checks browser capability (service worker + Notification + PushManager). Shows "unsupported" if missing.
2. On **Enable**: requests notification permission from the browser. If granted, subscribes via `pushManager.subscribe()` using the VAPID public key, then posts the subscription (endpoint + p256dh + auth keys) to the server via `subscribeToPush()`.
3. Server stores the subscription in `push_subscriptions` table, linked to the admin's account. If the same endpoint already exists, keys are refreshed (upsert).
4. Device shows "Push: enabled on this device". An **Unsubscribe** button removes the subscription from both the browser and the server.

If permission is denied by the browser, the component shows a "Notifications are blocked" message instructing the admin to enable them in browser settings.

**Service worker (`/public/sw.js`):** Handles three events:
- `install` — calls `skipWaiting()` to activate immediately.
- `activate` — calls `clients.claim()` to take control of all open tabs.
- `push` — parses JSON payload `{title, body, url}` and shows an OS-level notification. Uses `tag: 'showalter-admin'` with `renotify: true` to collapse rapid duplicates.
- `notificationclick` — focuses an existing `/admin` tab if open; otherwise opens a new window at the payload `url` (typically `/admin/notifications`).

---

### Message Templates

Templates are stored in `site_config` and edited through the admin settings UI (not documented in this section). Six template slots exist:

| Slot key | When it fires | Channel | Audience | Available placeholders |
|---|---|---|---|---|
| `confirmation_email` | Admin accepts a booking | Email (mailto:) | Customer | `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[google_link]`, `[ics_link]`, `[shortlink]` |
| `confirmation_sms` | Admin accepts a booking | SMS (sms:) | Customer | Same as above |
| `decline_email` | Admin declines a booking | Email (mailto:) | Customer | Same as above |
| `decline_sms` | Admin declines a booking | SMS (sms:) | Customer | Same as above |
| `review_request_email` | Admin clicks "Request review" on a completed booking or standalone | Email (mailto:) | Customer | `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[link]`, `[google_link]`, `[ics_link]`, `[shortlink]` |
| `review_request_sms` | Admin clicks "Request review" on a completed booking or standalone | SMS (sms:) | Customer | Same as above |

**Placeholder conventions:** Placeholders are bracketed lowercase tokens: `[name]`, `[service]`, `[date]`, `[time]`, `[address]`, `[link]`, `[google_link]`, `[ics_link]`, `[shortlink]`. The renderer (`renderTemplate` in `src/features/templates/render.ts`) is permissive about internal whitespace (`[ name ]` matches `name`) and case-insensitive. Unknown placeholders are left as literal text — no crash, no empty substitution. This means typos in template bodies produce visible garbage rather than silent data loss.

**Placeholder values (resolved per booking):**
- `[name]` — customer's full name.
- `[service]` — service name (e.g. "Mowing"); falls back to "Service" if null.
- `[date]` — booking start date formatted as "Fri, May 1" in the site timezone.
- `[time]` — booking start time formatted as "9:30 AM" in the site timezone.
- `[address]` — the snapshotted address from the booking.
- `[link]` — the tokenized review URL (`<baseUrl>/review/<token>`); empty string in confirmation/decline templates.
- `[google_link]` — Google Calendar "add event" URL pre-filled with service, location, and notes.
- `[ics_link]` — `.ics` calendar download URL (`/bookings/<token>/ics`).
- `[shortlink]` — short customer status URL (`<baseUrl>/c/<token>`).

Templates are rendered as the body of `mailto:` and `sms:` href links. The admin's device opens the native email or messages client; the admin hits send manually. The server never sends email or SMS directly.

---

### Cron / Scheduled Jobs

Four jobs are registered at server boot via `node-cron` (`src/server/cron/index.ts`). All jobs use `noOverlap: true` (node-cron) and an additional idempotency guard via the `cron_runs` table (`withCronRun`). Each execution logs a JSON line at start and on completion or error.

Run history is stored in the `cron_runs` table (columns: task name, started_at, ended_at, status `running`/`ok`/`error`, error_message).

| Job name | Schedule | What it does |
|---|---|---|
| `nightly_backup` | `0 3 * * *` (03:00 daily) | Uses better-sqlite3's `.backup()` to write a point-in-time copy of the database to `/data/backups/YYYY-MM-DD.db`, then prunes backups older than 14 days from that directory. |
| `photo_cleanup` | `0 3 * * *` (03:00 daily) | Reads `site_config.photo_retention_days_after_resolve` (default 30 days). Deletes `booking_attachments` rows and their files on disk for any terminal booking whose `decided_at` is older than the retention window. Also cleans `review_photos` linked to those bookings if the `review_photos` table exists. |
| `reminders_sweep` | `*/15 * * * *` (every 15 min) | For each `pending` booking, checks if 24 or 48 hours have elapsed since `created_at`. If a reminder for that milestone has not yet been sent (checked against the `notifications` table), inserts an in-app notification (`pending_reminder_24h` or `pending_reminder_48h`) and fires a Web Push to all subscribed admin devices. Idempotent: re-runs within the same window are safe. |
| `auto_expire_sweep` | `*/15 * * * *` (every 15 min) | For each `pending` booking older than 72 hours, transitions status to `expired` (`decided_at=now`), inserts a `booking_expired` in-app notification, and fires a Web Push. Only applies to bookings still in `pending` state — already-expired rows are excluded by the query. |

**Idempotency detail:** `withCronRun` calls `startRun()` before executing. If a `cron_runs` row for the same task already has `status='running'`, `startRun()` returns null and the current invocation is skipped entirely. This prevents two concurrent fires of the same job from racing each other.

**Observing cron history:** Query the `cron_runs` table directly in the SQLite database. There is no admin UI panel for cron history in the current codebase — a cron-runs viewer page does not yet exist.

---

## Known Gaps / Flags

- ICS download link is not surfaced directly on the booking status page — it only reaches the customer if Sawyer includes `[ics_link]` in the confirmation email template.
- The `#reviews` section on the public landing page renders photos from auto-published reviews, not the written review text — there is no dedicated public reviews display showing star ratings or text.
- `max_booking_photos` controls both booking AND review photo upload limits (same config knob, different label context on the review form).
- The browser-based recovery-code flow is wired server-side (`useRecoveryCode()` in `recovery.ts`) but no UI page calls it — `pnpm admin:reset <email>` is the current recovery path for lost passkeys.
- Review moderation is read-only in the admin UI (Phase 9 scope) — the auto-publish rule fires at submit time with no manual approve/reject toggle.
- No cron-runs viewer exists in the admin UI — observing job history requires direct DB inspection of the `cron_runs` table.
- The `[age]` placeholder renders verbatim when DOB is unset in the bio — set DOB before using `[age]` in the bio text.
- `reorderServices` uses 1-indexed sort order; `reorderPhotos` uses 0-indexed sort order — minor inconsistency in the two drag-to-reorder implementations.

---

## CLI Reference Summary

All CLI commands run from the project root against the local SQLite database.

```
pnpm admin:list                        # List all admins — email, active flag, enrollment date, device count
pnpm admin:reset <email>               # Wipe credentials/recovery code; puts admin back to unenrolled state
pnpm admin:disable <email>             # Soft-disable an admin (cannot sign in; record preserved)
pnpm admin:enable <email>              # Re-enable a disabled admin
pnpm admin:list-invites                # List all invite rows (token prefix, email, status, expiry)
pnpm admin:revoke-invite <prefix>      # Revoke an outstanding invite by token prefix (min 6 chars)
pnpm db:migrate                        # Apply pending Drizzle migrations (creates dev.db on first run)
pnpm db:generate                       # Generate a new migration file from Drizzle schema changes
SEED_FROM_BRIEF=true pnpm dev          # Start dev server and seed from Sawyer's brief on first boot
DATABASE_URL=file:./database/dev.db SEED_FROM_BRIEF=true npx tsx scripts/seed-gallery-dev.ts
                                       # Run seed script standalone (useful for re-seeding gallery only)
```

---

## Environment Variables

Key variables from `.env.example` — the file ships with inline comments for every variable. Non-obvious ones documented below.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file path with `file:` prefix (e.g. `file:/data/sqlite.db`). The app strips the prefix before passing to better-sqlite3. |
| `AUTH_SECRET` | Random secret for Auth.js session signing. Generate with `openssl rand -base64 32`. Required in production. |
| `BASE_URL` | The public URL of the site (e.g. `https://showalter.business`). Used to build absolute links in templates and review tokens. |
| `SEED_FROM_BRIEF` | When `true` and target tables are empty, seeds `site_config`, `services`, and `weekly_template_windows` from Sawyer's brief data on first boot. Idempotent — safe to leave on. |
| `UPLOADS_ROOT` | Directory where uploaded files are stored. Defaults to `/data/uploads` in production (bind-mounted Docker volume). |
| `BOOKING_RATE_LIMIT_PER_HOUR` | Max booking submissions per IP per rolling hour (default: 30). Adjust downward if you see abuse. |
| `VAPID_PUBLIC_KEY` | VAPID public key for Web Push. Generate all three VAPID vars with `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | VAPID private key. Keep secret — do not commit to source. |
| `VAPID_SUBJECT` | Contact URI for push services (e.g. `mailto:sshowalterservices@gmail.com`). Used by Apple/Google if a push fails. |

---

## Where to Get Help

This wiki is the **operating manual** — it covers how to use the site and admin panel day-to-day. For deeper technical context:

| Document | What it covers |
|---|---|
| `docs/STACK.md` | Canonical technical reference — full data model, env vars, availability model, booking flow internals, deployment topology, scheduled jobs |
| `docs/RUNBOOK.md` | Operational procedures — Docker deploy, backups, passkey recovery, incident response |
| `docs/ARCHITECTURE.md` | Code organization, file-structure conventions, per-directory intent |
| `docs/FEATURES.md` | Detailed feature walkthrough organized around user journeys |
| `docs/BRIEF.md` | Original product brief — the business context, client, and design direction |
| `docs/PHASES.md` | Phase-by-phase implementation record (all 12 phases complete) |

For anything not covered here, the source is the code — the project is well-commented and each feature lives in `src/features/<feature-name>/`.
