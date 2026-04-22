# Operations Runbook — Project Showalter

Operational procedures for running, recovering, and debugging the Showalter Services deployment. Keep this document terse and procedure-focused — rationale lives in STACK.md; this is the "what do I type when X is on fire" reference.

Primary host: Alex's homelab. Single Docker container (`showalter`) fronted by Caddy, bind-mounting `./data` (relative to the repo / compose file) → `/data` inside the container. SQLite is the only database.

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

Nightly backups land in `./data/backups/YYYY-MM-DD.db` (host path, relative to the repo root) / `/data/backups/YYYY-MM-DD.db` (container path). 14-day retention — older files are rotated out by the nightly batch.

**Restore procedure:**

```bash
docker stop showalter
cp ~/Project-Showalter/data/backups/2026-04-17.db ~/Project-Showalter/data/sqlite.db
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
- `reminders_sweep` — every 15 minutes (24h/48h pending-booking reminders)
- `auto_expire_sweep` — every 15 minutes (72h auto-expire of pending bookings)
- `nightly_backup` — once at 03:00 local time
- `photo_cleanup` — once at 03:00 local time (runs alongside `nightly_backup`)

**If a job hasn't run in over 24 hours:**

1. `docker logs showalter --tail 200 | grep -i cron` — look for crashes or startup issues.
2. `df -h ~/Project-Showalter` — check that the host volume isn't full (a full disk can stall SQLite writes and trip the cron).
3. `docker exec showalter ps aux | grep cron` — confirm the cron process is running inside the container.
4. If `cron_runs` has a `status='error'` row, read the `error_message` column for context.

If the cron process is dead but the app is otherwise healthy, a `docker restart showalter` revives it.

---

## 4. Passkey recovery

Passkeys are the only login mechanism. Loss-of-device scenarios must be recoverable.

### Important: recovery-code login is NOT implemented

Recovery codes are generated and shown once during enrollment (good — keep them somewhere safe), but there is **no login UI today that consumes one**. `useRecoveryCode()` exists server-side as a primitive, but no form on `/admin/login` calls it. Treat the recovery code as future-proofing only; for any actual recovery, use the CLI paths below.

### Admin lost device (or recovery code)

The `admin:reset` CLI is the **single recovery path** — do not bolt additional recovery mechanisms (email reset links, SMS codes, etc.) onto the system.

```bash
# Production (inside Docker container):
docker exec showalter pnpm admin:reset <email>

# Local dev (the migrate script and CLIs default to ./dev.db; the app reads
# ./database/dev.db from .env.local — the two are different files. Always
# pass DATABASE_URL when invoking dev CLIs, or you'll mutate the wrong DB):
DATABASE_URL=file:./database/dev.db pnpm admin:reset <email>
```

This clears the admin's `credentials` and `recovery_codes` rows and leaves the `admins` row with `enrolled_at=NULL`.

**If at least one OTHER admin is still enrolled** — they invite the reset admin back:

1. The other enrolled admin visits `/admin/settings/admins`, creates an invite for the reset admin's email, and copies the URL.
2. The reset admin opens the invite URL on their new device, confirms the pre-filled email, and enrolls a fresh passkey.
3. The server generates a new recovery code and shows it once — save it to a password manager.
4. The invite is single-use and auto-consumes; no further cleanup required.

### Last admin locked out (no one can issue an invite)

`admin:reset` alone is **not sufficient** in this case. The admins table is non-empty, so `/admin/login` still renders the standard `LoginForm` (which refuses you because `enrolled_at IS NULL`). The founding-admin flow only triggers when the table is fully empty.

**Recipe:**

```bash
# 1. (Optional but tidy) clear credentials + recovery codes first.
DATABASE_URL=file:./database/dev.db pnpm admin:reset <email>

# 2. Delete the admin row so the table is empty.
#    Production: sqlite3 /data/sqlite.db "DELETE FROM admins WHERE email='<email>';"
#    Local dev:
sqlite3 ./database/dev.db "DELETE FROM admins WHERE email='<email>';"

# 3. Verify zero admins remain.
DATABASE_URL=file:./database/dev.db pnpm admin:list
# → "No admins found."
```

Then refresh `/admin/login` — you'll see "Create the first admin", Touch ID will fire, and you'll get a fresh passkey + a one-time recovery code. **Save the new recovery code immediately** — there is no UI to retrieve it later.

The page is `force-dynamic`, so a normal refresh works; if it sticks, hard-refresh (Cmd+Shift+R).

### Why no DELETE CLI

There's no `admin:delete` script by design — agent rules forbid destructive operations, and the row preservation in `admin:reset` matches that posture. Deleting the row is a manual SQL escape hatch reserved for the genuine last-admin-locked-out case; it requires explicit operator action (running `sqlite3` directly), not a memorable command.

### All admins locked out (production)

Alex still has SSH access to the homelab. He uses the recipe above, substituting `docker exec showalter sqlite3 /data/sqlite.db ...` for the local sqlite3 invocation. The homelab's SSH key is the ultimate recovery root — protect it accordingly.

### What NOT to do

- Don't add a password-reset-via-email path. Email is not an authentication factor in this app.
- Don't share recovery codes over chat / email — read them once, save them to a password manager, move on.
- Don't share invite URLs any more widely than you have to. Even though invites are email-bound, the URL itself is the proof-of-invitation; anyone who can read the URL AND knows the invitee's email can complete signup.
- Don't migrate or seed the project-root `dev.db` thinking it's the dev DB — Next.js reads `./database/dev.db` per `.env.local`. Always pass `DATABASE_URL=file:./database/dev.db` to dev CLIs.

---

## 5. Local dev setup

```bash
git clone git@github.com:lxrbckl-dev/Project-Showalter.git
cd Project-Showalter
pnpm install
cp .env.example .env.local
# edit .env.local — fill in:
#   - AUTH_SECRET (openssl rand -base64 32)
#   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (npx web-push generate-vapid-keys)
#   - SEED_FROM_BRIEF=true (first run)
# (No admin env vars — visit /admin/login on first boot to claim the founding admin.)

pnpm db:migrate    # runs drizzle migrations against the local SQLite file
pnpm dev:seed      # seeds fake bookings, customers, reviews + pre-enrolled dev admin
pnpm dev           # http://localhost:5827
```

**Passkey enrollment on localhost.** WebAuthn spec explicitly allows `http://localhost` without TLS, so enrollment and login work out of the box on `http://localhost:5827`. No self-signed certs needed.

**Web Push on localhost.** Service workers register on `http://localhost` (spec exception for localhost). You can exercise the full push flow end-to-end in dev — subscribe a browser, fire a test push, see the notification.

**Testing mailto: / sms: templates.** Native mail / messages apps don't open reliably from a dev browser. Use:

```bash
pnpm dev:preview-templates
```

Prints the fully-interpolated `mailto:` / `sms:` URI to stdout for every shipped template. Copy/paste into a browser to verify the prefilled body end-to-end.

---

## 6. Deployment

Zero manual build step — merges to `main` trigger a GitHub Actions build that pushes `ghcr.io/lxrbckl-dev/project-showalter:latest` and `:<sha>`. Alex pulls on the homelab when ready.

---

### 6a. First-time deploy (fresh homelab)

Follow every step in order. Subsequent releases only need step 9 (pull + up).

#### Step 1 — Generate secrets

Run each command separately and keep the output — you will paste these into `.env` in step 2.

```bash
# Auth.js session secret
openssl rand -base64 32         # → AUTH_SECRET

# VAPID keypair (Web Push)
npx web-push generate-vapid-keys
# outputs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
```

**Never commit these values to git.** Store them in a password manager alongside the recovery codes.

#### Step 2 — Create `.env` on the homelab

Clone the repo (e.g. `~/Project-Showalter`) and create the `.env` file there:

```bash
git clone git@github.com:lxrbckl-dev/Project-Showalter.git ~/Project-Showalter
cp ~/Project-Showalter/.env.example ~/Project-Showalter/.env
```

Edit `~/Project-Showalter/.env` and fill in every blank value:

```bash
# ─── App ───────────────────────────────────────────────────────────────────
AUTH_SECRET=<output of openssl above>
SEED_FROM_BRIEF=true          # first boot only — idempotent after that
# (Admins are self-served in-app — no env configuration; see step 7.)

# ─── VAPID (Web Push) ───────────────────────────────────────────────────────
VAPID_PUBLIC_KEY=<from npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<from npx web-push generate-vapid-keys>
VAPID_SUBJECT=mailto:sshowalterservices@gmail.com
```

Verify the file is only readable by your user:

```bash
chmod 600 ~/Project-Showalter/.env
```

#### Step 3 — Prepare the data directory

`docker-compose.yml` lives at the repo root and mounts `./data:/data` relative to itself. Create the data directory next to it:

```bash
mkdir -p ~/Project-Showalter/data
```

Docker Compose resolves the `.env` file automatically when both files are in the same directory (the repo root).

#### Step 4 — Point Porkbun DNS

Create an `A` record in the Porkbun dashboard:

| Hostname                      | Type | Value                        | TTL  |
|-------------------------------|------|------------------------------|------|
| `sawyer.showalter.business`   | A    | `<homelab public IP>`        | 600  |

Verify propagation (wait a few minutes, then):

```bash
dig sawyer.showalter.business +short
# should return your homelab's public IP
```

#### Step 5 — Add Caddyfile blocks

Add the block to the homelab's Caddyfile (typically `/etc/caddy/Caddyfile`):

```caddy
sawyer.showalter.business {
    encode zstd gzip
    reverse_proxy localhost:5827
}
```

Caddy auto-provisions TLS via Let's Encrypt.

Reload Caddy to pick up the new blocks:

```bash
caddy reload --config /etc/caddy/Caddyfile
# or, if running as a systemd service:
systemctl reload caddy
```

Verify Caddy accepted the config (no errors):

```bash
caddy validate --config /etc/caddy/Caddyfile
```

#### Step 6 — Pull images and start all containers

```bash
cd ~/Project-Showalter
docker compose pull
docker compose up -d
```

Check logs:

```bash
docker logs showalter --tail 50    # look for "server listening on port 5827"
```

#### Step 7 — First-time admin enrollment (passkeys)

After `docker compose up -d` the `admins` table is empty. The first person to visit `/admin/login` claims the founding admin slot — no env toggle required.

1. **Founding admin.** Open `https://sawyer.showalter.business/admin/login` in a browser on the founding admin's device. The page detects the empty admins table and renders the founding-admin form.
   - The founding admin types their email and follows the biometric prompt.
   - The server shows a **recovery code once** — save it to a password manager immediately.
2. **Invite the rest of the team.** Still as the founding admin, go to `/admin/settings/admins`:
   - For each additional admin, fill in their email (required) and an optional label, click **Create invite**, and copy the generated URL.
   - Share each URL with the respective admin however you want (text, Signal, paper). Invites are single-use, email-bound, and expire 24h after creation.
3. **Each invitee enrolls.** The invitee opens their URL, confirms their pre-filled email, and enrolls a passkey. Their recovery code is shown once — save to password manager.
4. Confirm every admin is enrolled:

   ```bash
   docker exec showalter pnpm admin:list
   # every admin should show enrolled_at set (not NULL)
   docker exec showalter pnpm admin:list-invites
   # no invites in pending state if everyone signed up
   ```

5. **Enrollment window.** There is no env toggle — the `admins` table is no longer empty, so `/admin/login` renders the regular login form (not the founding form). Additional admins can only be added via invite links issued from `/admin/settings/admins`.

#### Step 8 — Verify health

```bash
curl -sf https://sawyer.showalter.business/api/health
# expected: {"ok":true}
```

Also confirm:

- `https://sawyer.showalter.business` loads the public landing page.
- `https://sawyer.showalter.business/admin` redirects to `/admin/login` (not a 500).
- An admin can log in with their passkey.

---

### 6b. Routine releases (pull + up)

After the first-time setup above, every subsequent release is three commands:

```bash
cd ~/Project-Showalter
docker compose pull showalter
docker compose up -d showalter
```

Caddy keeps the prior container serving while the new one starts. The app's 30-second SIGTERM drain window lets any in-flight form submissions complete before the old container exits.

**Verify after every release:**

```bash
curl -sf https://sawyer.showalter.business/api/health
# expected: {"ok":true}
```

---

### 6c. Rollback to a previous image

Every CI build pushes an immutable `:<sha>` tag to GHCR. To roll back:

1. Find the last known-good commit SHA from the GitHub Actions run history.
2. Edit `~/Project-Showalter/docker-compose.yml` — pin the `showalter` image to that SHA:

   ```yaml
   image: ghcr.io/lxrbckl-dev/project-showalter:<sha>
   ```

3. Pull and restart:

   ```bash
   cd ~/Project-Showalter
   docker compose pull showalter
   docker compose up -d showalter
   ```

4. Verify health, then file a bug to fix `main` before reverting the pin.

---

## 6d. Pre-deploy checklist

Run through this before any first-time deploy or major homelab change.

### Secrets and config

- [ ] `.env` created from `.env.example` (`cp .env.example ~/Project-Showalter/.env`) and every blank value filled in
- [ ] `BASE_URL` set to the production URL (e.g. `https://sawyer.showalter.business`)
- [ ] `AUTH_SECRET` set and non-empty (32+ random bytes)
- [ ] `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` all set
- [ ] `.env` file is `chmod 600` (not world-readable)

### DNS

- [ ] `dig sawyer.showalter.business +short` returns the homelab's public IP

### Homelab ports

- [ ] Port 443 (HTTPS) open inbound on the router / firewall
- [ ] Port 80 (HTTP) open inbound — Caddy needs it for the ACME TLS-ALPN challenge
- [ ] Internal port 5827 (showalter) accessible from Caddy on the host

### Docker and Caddy

- [ ] Docker daemon running: `docker info`
- [ ] Caddy running and config validates: `caddy validate --config /etc/caddy/Caddyfile`
- [ ] Caddyfile has the `sawyer.showalter.business` block

### Storage

- [ ] `~/Project-Showalter/data/` directory exists and is writable by Docker
- [ ] `df -h ~/Project-Showalter` — at least a few GB free (SQLite + uploads + 14-day backups)

### Image availability

- [ ] `docker pull ghcr.io/lxrbckl-dev/project-showalter:latest` succeeds (confirms GHCR auth + CI built the image)

---

## 8. Accessibility test checklist

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

## 10. Incident response

A short decision tree for the most-likely failure modes.

### Container crashed / won't start

```bash
docker logs showalter --tail 200
```

Common causes:
- **Migration failure** → see section 1.
- **Bad env var** (e.g. missing `AUTH_SECRET`, malformed `DATABASE_URL`) — fix and restart.
- **Disk full** — `df -h ~/Project-Showalter`; prune old backups or extend the volume.

If the container is crashlooping but the prior image ran clean, roll back per section 6c.

### SQLite locked

Shouldn't happen in single-process deployment. If you see `SQLITE_BUSY` in the logs:

```bash
docker stop showalter
ls -la ~/Project-Showalter/data/sqlite.db*
# if stale *-shm / *-wal files exist and mtime is old, they're safe to remove:
rm ~/Project-Showalter/data/sqlite.db-shm ~/Project-Showalter/data/sqlite.db-wal
docker start showalter
```

Never `rm` the `.db` file itself — that's the entire database.

### All admins locked out

See section 4 — SSH to the homelab, run `admin:reset` for whichever admin can most easily re-enroll (usually the one with physical device access first).

### Booking flood / bot abuse

The `BOOKING_RATE_LIMIT_PER_HOUR` env var gates the public booking endpoint. Default is 30. If you see submission spam:

```bash
# In ~/Project-Showalter/docker-compose.yml, tighten:
#   BOOKING_RATE_LIMIT_PER_HOUR: 3
docker compose up -d showalter
```

The container restarts cleanly; the rate limit takes effect immediately. Dial back up once the abuse subsides.

If the honeypot field is being filled (check `cron_runs` / app logs for spam patterns), it's already silently rejecting — no action needed.

---

*Last updated alongside STACK.md. If a procedure here disagrees with STACK.md, STACK.md wins; update this file to match.*
