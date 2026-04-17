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
| Container          | **Single Docker image**                   | Multi-stage build, runs on internal port **5827**. |
| Reverse proxy      | **Caddy** (on host)                       | TLS auto-provisioned via Let's Encrypt. Fronts `showalter.business`. |
| Data persistence   | **Host bind-mount** at `/data`            | SQLite DB file, uploaded images, and nightly backups all persist outside the container. |
| Backups            | **In-container cron**                     | Nightly `sqlite3 .backup` dump into `/data/backups/YYYY-MM-DD.db`, 14-day retention. |
| CI/CD              | **GitHub Actions → GHCR**                 | On merge to `main`, build and push `ghcr.io/lxrbckl-dev/project-showalter:{latest,<sha>}`. Alex pulls on the homelab. |

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

### `services`
- `id` INTEGER PK
- `name` TEXT
- `description` TEXT
- `price_cents` INTEGER (nullable — for "TBD" services like snow)
- `price_suffix` TEXT — e.g. `+` for variable, empty for fixed
- `sort_order` INTEGER
- `active` BOOLEAN — soft-archive instead of delete

### `busy_days`
- `date` TEXT (YYYY-MM-DD) PK
- `kind` TEXT — `busy` | `blocked` (e.g. school hours)
- `note` TEXT (optional)

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

## Healthcheck

`GET /api/health` returns `200 OK` with `{ "ok": true }`.

## Out of scope for this document

Scaffolding, feature implementation, and CI wiring will follow in separate PRs. This doc is the source of truth for *what* we're building on; *how* is tracked in those PRs.
