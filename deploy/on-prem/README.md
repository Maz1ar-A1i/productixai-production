# Productix + ERPNext — on-prem stack

One `docker compose` project containing Productix (frontend + FastAPI backend
+ Postgres) and ERPNext (frontend + backend + websocket + workers +
scheduler + MariaDB + Redis), fronted by a single Caddy reverse proxy. Only
Caddy is exposed to the LAN/internet — every database and Redis instance
stays on the internal Docker network.

This is a coordinated stack of containers, not literally one container —
ERPNext alone needs 9+ processes (frontend, backend, websocket, two queue
workers, scheduler, configurator, MariaDB, two Redis instances) to run
correctly, which is Frappe's own architecture, not something we can safely
collapse. "Single solution" here means: one repo, one `.env`, one `docker
compose up`, one host.

## What's still missing before this is sellable

- **ERPNext connector**: `productix_fastapi` has no ERPNext router yet
  (Phase 4 in the project plan). `ERPNEXT_*` env vars are wired through
  `compose.yml` so it's a drop-in once that router exists, but it does
  nothing today.
- **Licensing secrets**: `LICENSE_SIGNING_KEY` and the license DB password
  in `licensing-server/db_config.php` need rotating — see the chat history
  / commit notes for why. Don't ship a customer box with the old defaults.
- **`/api/internal/reset-database`**: still exists in `internal_admin.py`
  and can drop every Productix table. `MASTER_KILL_TOKEN` and
  `MASTER_KILL_ALLOWED_IP` in `.env` are the only things standing between
  that endpoint and anyone who can reach the box — both are required
  (no default) in `.env.example`, keep it that way.
- **No `/health` endpoint** on the backend yet — the Docker healthcheck and
  `smoke-test.sh` hit `/docs` as a stand-in. A real health endpoint that
  checks DB connectivity would be worth adding.

## Prerequisites

- Docker + Docker Compose v2 on the target Linux host.
- Either real DNS for `PRODUCTIX_DOMAIN` / `PRODUCTIX_API_DOMAIN` /
  `ERPNEXT_DOMAIN`, or hosts-file entries on client machines pointing those
  names at this server's IP (fine for a LAN-only install).
- Outbound HTTPS access to `CENTRAL_LICENSE_SERVER_URL` — logins call out
  to the central license server by design (see project decision: keep
  central licensing rather than bundling it per-customer).

## First run

```bash
cd deploy/on-prem
./scripts/install.sh   # copies .env.example -> .env, then STOPS so you can edit it
# edit .env: fill in every CHANGE_ME value (use `openssl rand -hex 32` for secrets)
./scripts/install.sh   # builds images
./scripts/start.sh
./scripts/smoke-test.sh
```

First boot takes a few minutes — `erpnext-create-site` waits for MariaDB/Redis,
then runs `bench new-site --install-app erpnext`, which is not instant.
Watch it with:

```bash
docker compose -f compose.yml logs -f erpnext-create-site
```

## Day-to-day

| Task | Command |
|---|---|
| Status | `./scripts/status.sh` |
| Stop (keep data) | `./scripts/stop.sh` |
| Start again | `./scripts/start.sh` |
| Backup | `./scripts/backup.sh` (writes to `backups/<timestamp>/`) |
| Restore | `./scripts/restore.sh backups/<timestamp>` |
| Update after a git pull | `./scripts/update.sh` (prompts for a backup first) |
| Verify everything's up | `./scripts/smoke-test.sh` |

## Moving to another machine

1. `./scripts/backup.sh` on the old host.
2. Copy this `deploy/on-prem/` directory (with your real `.env`, not the
   example) and the `backups/<timestamp>/` folder to the new host.
3. `./scripts/install.sh && ./scripts/start.sh` on the new host.
4. `./scripts/restore.sh backups/<timestamp>`.
5. `./scripts/smoke-test.sh`.

Untested claim until we actually run it once — treat this checklist as a
draft until it's been exercised end-to-end on a second machine.

## Online demo (optional)

Not included in `compose.yml` on purpose — the base package must work with
zero outbound exposure beyond the license check. A `compose.demo.yml`
overlay adding a named Cloudflare tunnel is Phase 6 of the project plan and
isn't built yet.
