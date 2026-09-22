# HawkNexa VPS deployment

Production deployment assets for HawkNexa only. Other apps (FitNix Track, Al Asr, AMTKN) will be added under `/opt/apps/` later.

## Stage 1 + 2 — server preparation

Script: `stage1-2-server-prep.sh`

**What it does (additive, non-destructive):**
- Logs inspection output to `/var/log/hawknexa-deploy/`
- Installs Docker Engine + Compose plugin from Docker's official Ubuntu repo
- Configures Docker log rotation (`max-size: 10m`, `max-file: 5`)
- Creates `/opt/apps/hawknexa/{repo,deploy,data}`
- Enables UFW (SSH, HTTP, HTTPS)
- Configures fail2ban for SSH (only if `jail.local` does not exist)

**What it does NOT do:**
- Delete files, volumes, databases, or containers
- Overwrite existing `daemon.json` log settings (merges or skips)
- Deploy HawkNexa application containers

## Push notifications (FCM)

The mobile app uses package `com.hawknexa.student` with Firebase project `hawknexa-69fb8`
(see `mobile/google-services.json`).

Place the Firebase Admin key in the repo at:

`mobile/hawknexa-69fb8-firebase-adminsdk-fbsvc-*.json`

**Hostinger VPS:** port 22 is often blocked from your PC. Use **hPanel → VPS → Browser terminal**
(not `scp` from Windows).

Option A — paste the env line from your PC:

```powershell
.\deploy\hawknexa\print-firebase-env-line.ps1
```

Copy the printed `FIREBASE_SERVICE_ACCOUNT_JSON=...` line into `/opt/apps/hawknexa/deploy/.env`
via `nano`, then on the VPS:

```bash
bash /opt/apps/hawknexa/deploy/deploy.sh
```

Option B — if the JSON file is already on the server under `mobile/`:

```bash
bash /opt/apps/hawknexa/repo/deploy/hawknexa/set-firebase-env.sh
bash /opt/apps/hawknexa/deploy/deploy.sh
```

If this variable is missing or points at a different Firebase project, in-app notifications
still work but FCM push delivery will not.

## GitHub Actions auto-deploy (push to `main`)

Workflow: `.github/workflows/deploy-hawknexa-vps.yml`

**Triggers:** push to `main` when `backend/`, `portal/`, or `deploy/hawknexa/` changes. You can also run it manually from **Actions → Deploy HawkNexa VPS → Run workflow**.

### One-time: deploy webhook + GitHub secret

Deploy normally uses an **HTTPS webhook** on port 443. If Hostinger firewall blocks 80/443,
GitHub Actions falls back to **SSH deploy** on port 22 when `HAWKNEXA_VPS_SSH_KEY` is set.

On the VPS, the `deploy-webhook` Docker service handles deploy triggers. `DEPLOY_WEBHOOK_SECRET` must be set in `/opt/apps/hawknexa/deploy/.env`.

GitHub → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|--------|
| `HAWKNEXA_DEPLOY_WEBHOOK_SECRET` | Same value as `DEPLOY_WEBHOOK_SECRET` in the server `.env` |
| `HAWKNEXA_VPS_SSH_KEY` | Private SSH key for `root@187.53.141.109` (SSH deploy fallback when 443 is blocked) |

Optional variable: `HAWKNEXA_DEPLOY_URL` (default `https://hawknexabackend.fynals.com/internal/deploy`).

Vercel auto-deploy is disabled; production deploys go through this workflow only.

**How auto-deploy works:** push to `main` → GitHub Actions POSTs to `/internal/deploy` → VPS runs `deploy.sh` (git pull + docker rebuild) → Actions polls `/internal/deploy/status` until the new commit is live.

You should **not** need to SSH and run `deploy.sh` manually after this is set up. If deploys stop updating production, check **Actions → Deploy HawkNexa VPS** and `/tmp/hawknexa-deploy.log` on the VPS.

Manual deploy on the server:

```bash
bash /opt/apps/hawknexa/deploy/deploy.sh
```

### If GitHub Actions shows HTTP 502 on `/internal/deploy`

The deploy webhook container is down or Caddy cannot reach it. In **Hostinger VPS browser terminal** (or SSH):

```bash
bash /opt/apps/hawknexa/deploy/recover-deploy-webhook.sh
```

If the script is not on the server yet, run manually:

```bash
cd /opt/apps/hawknexa/repo && git pull origin main
rsync -a --exclude '.env' /opt/apps/hawknexa/repo/deploy/hawknexa/ /opt/apps/hawknexa/deploy/
cd /opt/apps/hawknexa/deploy
docker compose -f docker-compose.prod.yml up -d --build deploy-webhook caddy
docker compose -f docker-compose.prod.yml logs deploy-webhook --tail 30
curl -sS https://hawknexabackend.fynals.com/internal/deploy/health
```

You should see `ok` (not a JSON 404 from the API). Then re-run the GitHub Actions workflow.

**Checklist:**
1. `/opt/apps/hawknexa/deploy/.env` has `DEPLOY_WEBHOOK_SECRET=...` (same as GitHub secret `HAWKNEXA_DEPLOY_WEBHOOK_SECRET`)
2. `docker compose -f docker-compose.prod.yml ps deploy-webhook` shows **Up** (not restarting)
3. `curl https://hawknexabackend.fynals.com/internal/deploy/health` returns plain text `ok`

## Run server prep (one-time)

```bash
bash /path/to/stage1-2-server-prep.sh
```

## Verify

```bash
docker --version
docker compose version
systemctl is-active docker
docker info | grep -i 'Logging Driver'
ufw status verbose
ls -la /opt/apps/hawknexa
```

## Database (Docker MySQL on VPS)

Production uses **MySQL inside Docker Compose** (`mysql` service). `docker-compose.prod.yml` sets `DATABASE_URL` and `REDIS_URL` on the backend container so it always talks to in-stack services — not a remote database host.

One-time on the VPS:

```bash
cp /opt/apps/hawknexa/deploy/.env.example /opt/apps/hawknexa/deploy/.env
# Edit passwords and DEPLOY_WEBHOOK_SECRET, then:
cd /opt/apps/hawknexa/deploy
docker compose -f docker-compose.prod.yml up -d mysql redis
docker compose -f docker-compose.prod.yml up -d --build backend portal caddy deploy-webhook
```

Migrating from the old remote `sms` database (one-time): `bash /opt/apps/hawknexa/deploy/import-remote-sms-db.sh`

## Local development (full Docker stack — mirrors VPS)

Run **MySQL, Redis, backend, portal, and Caddy** on your machine with the same layout as production.

### Quick start (Windows PowerShell)

```powershell
cd deploy\hawknexa
copy .env.local.example .env.local
# Edit .env.local if ports 3306/6379/3000/3001 are already in use

# Start stack (first run builds images — ~5–10 min)
..\..\deploy\hawknexa\up-local.ps1 -Build

# Copy live VPS database into local MySQL (needs SSH to VPS; you will be prompted for password)
..\..\deploy\hawknexa\up-local.ps1 -SyncDb
```

### URLs

| Service | Direct | Via Caddy (VPS-like hostnames) |
|---------|--------|--------------------------------|
| Portal | http://localhost:3000 | http://hawknexa.localhost:8080 |
| API | http://localhost:3001/api/v1 | http://hawknexabackend.localhost:8080/api/v1 |

### Manual commands

```bash
cd deploy/hawknexa
cp .env.local.example .env.local
docker compose -f docker-compose.local.yml --env-file .env.local up -d --build
bash sync-db-from-vps.sh   # replica of VPS MySQL
docker compose -f docker-compose.local.yml --env-file .env.local logs -f backend
```

Stop: `docker compose -f docker-compose.local.yml --env-file .env.local down`

### Portal-only dev (no Docker — API still on VPS)

```bash
cd portal
cp .env.example .env.local
npm run dev
```

Use `NEXT_PUBLIC_API_URL=https://hawknexabackend.fynals.com/api/v1` and **do not** set `NEXT_PUBLIC_USE_LOCAL_API=true`.
