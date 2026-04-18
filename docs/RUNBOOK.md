# Operations Runbook — Project Showalter

Operational procedures for running, recovering, and debugging the Showalter Services deployment. Keep this document terse and procedure-focused — rationale lives in STACK.md; this is the "what do I type when X is on fire" reference.

Primary host: Alex's homelab. Single Docker container (`showalter`) fronted by Caddy, bind-mounting `/srv/showalter/data` → `/data` inside the container. SQLite is the only database.

---

## 1. Migration rollback

Drizzle migrations run automatically at container startup, before the HTTP server accepts traffic. A failed migration aborts the boot — the container exits non-zero and the previous image (if any) is left untouched.

**When a migration fails on boot:**

1. `docker logs showalter --tail 200` — find the migration error.
2. If the cause is environmental (disk full, permissions on `/data`), fix the environment and restart the container. The migration retries on next boot.
3. If the cause is a bad migration file, roll back:

   ```bash
   # On the dev machine or CI: revert the commit that introduced the migration
   git revert <bad-migration-commit>
   git push origin main
   # Wait for GH Actions to build + push the reverted image to GHCR
   # On the homelab:
   docker compose pull showalter
   docker compose up -d showalter
   ```

   The reverted image skips the bad migration entirely (Drizzle re-reads the migrations directory from the image).

**Emergency manual DB edit** (last resort — only when no prior image tag exists to fall back to):

```bash
docker exec -it showalter sqlite3 /data/sqlite.db
# inside sqlite3:
.tables
.schema bookings
-- hand-corrective SQL here
.quit
```

Always take a manual backup first:

```bash
docker exec showalter sqlite3 /data/sqlite.db ".backup /data/backups/pre-manual-edit-$(date +%Y%m%d-%H%M%S).db"
```

---

## 2. Backup restoration

Nightly backups land in `/srv/showalter/data/backups/YYYY-MM-DD.db` (host path) / `/data/backups/YYYY-MM-DD.db` (container path). 14-day retention — older files are rotated out by the nightly batch.

**Restore procedure:**

```bash
docker stop showalter
cp /srv/showalter/data/backups/2026-04-17.db /srv/showalter/data/sqlite.db
docker start showalter
```

Verify the container comes up clean (`docker logs showalter --tail 50`), then confirm admin login + a bookings-list render.

**Backup verification (quarterly, or after any backup-touching change):**

1. Pick a recent backup.
2. Copy it to a throwaway volume on a non-prod host (e.g. `/tmp/showalter-restore-test`).
3. Boot a test container with `volumes: /tmp/showalter-restore-test:/data`.
4. Confirm: container starts, `/api/health` returns `200`, admin login works (with a current passkey on the current device), bookings list renders.
5. Tear the test container down. No data moves to prod.

Treat any failure here as a P1 incident — the backup is not actually usable.

---

## 3. Cron health inspection

The `cron_runs` table is the source of truth for scheduled-job health.

**Quick SQL check:**

```bash
docker exec showalter sqlite3 /data/sqlite.db \
  "SELECT task, started_at, ended_at, status FROM cron_runs ORDER BY started_at DESC LIMIT 20;"
```

**Admin dashboard widget.** The admin home view surfaces last-run timestamp + status per task by reading the same table — no need to SSH for a glance.

**Expected cadence:**
- `reminders_sweep` — every 15 minutes
- `nightly_backup` — once at 03:00 local time
- `photo_cleanup` — once at 03:00 local time (runs alongside `nightly_backup`)

**If a job hasn't run in over 24 hours:**

1. `docker logs showalter --tail 200 | grep -i cron` — look for crashes or startup issues.
2. `df -h /srv/showalter` — check that the host volume isn't full (a full disk can stall SQLite writes and trip the cron).
3. `docker exec showalter ps aux | grep cron` — confirm the cron process is running inside the container.
4. If `cron_runs` has a `status='error'` row, read the `error_message` column for context.

If the cron process is dead but the app is otherwise healthy, a `docker restart showalter` revives it.

---

## 4. Passkey recovery

Passkeys are the only login mechanism. Loss-of-device scenarios must be recoverable.

### Happy path: admin still has their recovery code

Admin enters their email at `/admin/login`, taps "use recovery code instead," pastes the one-time code. On success, a new code is generated and displayed once; the old passkey remains until they re-enroll from the new device.

### Admin lost device AND recovery code

This is the escape hatch. The `admin:reset` CLI is the **single recovery path** — do not bolt additional recovery mechanisms onto the system.

```bash
docker exec showalter pnpm admin:reset sshowalterservices@gmail.com
```

This clears the admin's `credentials` and `recovery_codes` rows and leaves the `admins` row with `enrolled_at=NULL` (pending enrollment).

**Then:**

1. Temporarily flip `BOOTSTRAP_ENABLED=true` in the Compose env and `docker compose up -d showalter` to apply.
2. The admin visits `/admin/login` on their new device, types their email, and enrolls a fresh passkey.
3. The server generates a new recovery code and shows it once — the admin saves it somewhere safe (password manager).
4. Flip `BOOTSTRAP_ENABLED=false` and restart to close the enrollment window.

### All admins locked out

Alex still has SSH access to the homelab. He runs the same `admin:reset` for himself (or for Sawyer), then follows the steps above. The homelab's SSH key is the ultimate recovery root — protect it accordingly.

### What NOT to do

- Don't add a password-reset-via-email path. Email is not an authentication factor in this app.
- Don't let `BOOTSTRAP_ENABLED=true` linger in production — always flip it back after enrollment.
- Don't share recovery codes over chat / email — read them once, save them to a password manager, move on.

---

## 5. Local dev setup

```bash
git clone git@github.com:lxrbckl-dev/Project-Showalter.git
cd Project-Showalter
pnpm install
cp .env.example .env.local
# edit .env.local — fill in:
#   - AUTH_SECRET (openssl rand -base64 32)
#   - ADMIN_EMAILS (your dev email)
#   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (npx web-push generate-vapid-keys)
#   - BOOTSTRAP_ENABLED=true (dev)
#   - SEED_FROM_BRIEF=true (first run)

pnpm db:migrate    # runs drizzle migrations against the local SQLite file
pnpm dev:seed      # seeds fake bookings, customers, reviews + pre-enrolled dev admin
pnpm dev           # http://localhost:3000
```

**Passkey enrollment on localhost.** WebAuthn spec explicitly allows `http://localhost` without TLS, so enrollment and login work out of the box on `http://localhost:3000`. No self-signed certs needed.

**Web Push on localhost.** Service workers register on `http://localhost` (spec exception for localhost). You can exercise the full push flow end-to-end in dev — subscribe a browser, fire a test push, see the notification.

**Testing mailto: / sms: templates.** Native mail / messages apps don't open reliably from a dev browser. Use:

```bash
pnpm dev:preview-templates
```

Prints the fully-interpolated `mailto:` / `sms:` URI to stdout for every shipped template. Copy/paste into a browser to verify the prefilled body end-to-end.

---

## 6. Deployment

Zero manual build step — merges to `main` trigger a GitHub Actions build that pushes `ghcr.io/lxrbckl-dev/project-showalter:latest` and `:<sha>`.

**On the homelab (per release):**

```bash
cd /srv/showalter
docker compose pull showalter
docker compose up -d showalter
```

Caddy is a separate process and keeps the prior `showalter` container serving until the new one is healthy. `docker compose up -d` swaps in-flight; the in-flight-request drain window (30 seconds via SIGTERM handling) ensures open form submissions complete cleanly.

**Rollback to a previous image.** Every CI build pushes an immutable `:<sha>` tag. To roll back:

```bash
# Edit /srv/showalter/docker-compose.yml → pin image to the known-good SHA:
# image: ghcr.io/lxrbckl-dev/project-showalter:<sha>
docker compose pull showalter
docker compose up -d showalter
```

Do the same for Umami (`ghcr.io/umami-software/umami:postgresql-latest`) — its `docker compose pull umami && docker compose up -d umami` is independent of the main app.

---

## 7. Setting up Umami (one-time)

Umami runs as two containers (`umami` and `umami-db`) alongside the main `showalter` container. Perform this setup once on a fresh homelab deploy.

**Prerequisites.** Fill in the three Umami secrets in `/srv/showalter/.env` before bringing the containers up:

```bash
# Generate strong secrets — one per command, paste each into .env
openssl rand -base64 32   # → UMAMI_APP_SECRET
openssl rand -base64 32   # → UMAMI_DB_PASSWORD

# UMAMI_DATABASE_URL format (use the same password as UMAMI_DB_PASSWORD):
# postgresql://umami:<UMAMI_DB_PASSWORD>@umami-db:5432/umami
```

**Steps:**

1. Bring up the Umami containers:

   ```bash
   cd /srv/showalter
   docker compose up -d umami-db umami
   ```

   Wait ~10 seconds for the DB to initialise, then verify:

   ```bash
   docker logs umami --tail 50
   # should show "server started on port 3000" (or similar)
   ```

2. Visit `https://analytics.showalter.business` in your browser.
   - Log in with the default credentials: **username** `admin`, **password** `umami`.
   - **Change the password immediately** (Settings → Profile → Change password).

3. Add a website entry in Umami:
   - Settings → Websites → Add website.
   - Name: `Showalter Services`, domain: `showalter.business`.
   - Copy the generated **Website ID**.

4. Set the tracking vars in `/srv/showalter/.env`:

   ```bash
   NEXT_PUBLIC_UMAMI_SRC=https://analytics.showalter.business/script.js
   NEXT_PUBLIC_UMAMI_WEBSITE_ID=<paste website ID here>
   ```

5. Rebuild and redeploy the main app so it picks up the new env vars:

   ```bash
   docker compose pull showalter
   docker compose up -d showalter
   ```

6. Verify tracking is working:
   - Open `https://showalter.business` in a private/incognito window.
   - Return to `https://analytics.showalter.business` → the dashboard should record the page view within a few seconds.

**Caddyfile block for `analytics.showalter.business`.** Add this block to the homelab Caddyfile alongside the existing `showalter.business` block:

```caddy
analytics.showalter.business {
    encode zstd gzip
    reverse_proxy localhost:3001
}
```

Reload Caddy after saving: `caddy reload --config /etc/caddy/Caddyfile` (or `systemctl reload caddy`).

**Umami is non-critical.** If Umami or `umami-db` goes down, the main site is unaffected. See section 9 (Incident response) for restart steps.

---

## 9. Accessibility test checklist

Target: WCAG 2.1 AA on a best-effort basis. Every PR that touches public or admin UI runs the automated pass; manual passes happen on release candidates.

### Automated

- **axe-core via Playwright** runs in CI on every PR. Any axe violation fails the build.
- Coverage: landing page, booking form, booking-page-by-token, review submission form, admin login, admin inbox, admin calendar.

### Manual (release candidate checklist)

- **Keyboard-only navigation.** Every interactive element reachable via `Tab`; focus ring visible on every focusable element; no keyboard traps.
- **Screen reader pass.**
  - **NVDA** (Windows Firefox) — booking form end-to-end; admin inbox → accept flow.
  - **VoiceOver** (iOS Safari) — booking form on mobile; customer booking page; admin login with passkey.
- **Color contrast.** Chrome DevTools → Rendering tab → emulate color vision deficiencies (protanopia, deuteranopia). No content becomes unreadable. Primary text + background clears 4.5:1; large text clears 3:1.
- **Image alt text.** Every hero / gallery image has meaningful alt text; decorative images have `alt=""`.
- **Form error states** are programmatically associated (`aria-describedby`) with the offending field, not just visually highlighted.

Ship blockers: any Level-A failure, or any Level-AA failure on the booking form or admin login flow.

---

## 9. Incident response

A short decision tree for the most-likely failure modes.

### Container crashed / won't start

```bash
docker logs showalter --tail 200
```

Common causes:
- **Migration failure** → see section 1.
- **Bad env var** (e.g. malformed `ADMIN_EMAILS`, missing `AUTH_SECRET`) — fix and restart.
- **Disk full** — `df -h /srv/showalter`; prune old backups or extend the volume.

If the container is crashlooping but the prior image ran clean, roll back per section 6.

### SQLite locked

Shouldn't happen in single-process deployment. If you see `SQLITE_BUSY` in the logs:

```bash
docker stop showalter
ls -la /srv/showalter/data/sqlite.db*
# if stale *-shm / *-wal files exist and mtime is old, they're safe to remove:
rm /srv/showalter/data/sqlite.db-shm /srv/showalter/data/sqlite.db-wal
docker start showalter
```

Never `rm` the `.db` file itself — that's the entire database.

### All admins locked out

See section 4 — SSH to the homelab, run `admin:reset` for whichever admin can most easily re-enroll (usually the one with physical device access first).

### Booking flood / bot abuse

The `BOOKING_RATE_LIMIT_PER_HOUR` env var gates the public booking endpoint. Default is 30. If you see submission spam:

```bash
# In /srv/showalter/docker-compose.yml, tighten:
#   BOOKING_RATE_LIMIT_PER_HOUR: 3
docker compose up -d showalter
```

The container restarts cleanly; the rate limit takes effect immediately. Dial back up once the abuse subsides.

If the honeypot field is being filled (check `cron_runs` / app logs for spam patterns), it's already silently rejecting — no action needed.

### Umami / analytics down

Umami is independent of the main app. If `analytics.showalter.business` stops responding but the main site is fine:

```bash
docker logs umami --tail 200
docker logs umami-db --tail 200
docker compose restart umami umami-db
```

Never prioritize Umami over the main app — analytics outages are cosmetic.

---

*Last updated alongside STACK.md. If a procedure here disagrees with STACK.md, STACK.md wins; update this file to match.*
