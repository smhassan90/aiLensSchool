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

## GitHub Actions auto-deploy (push to `main`)

Workflow: `.github/workflows/deploy-hawknexa-vps.yml`

**Triggers:** push to `main` when `backend/`, `portal/`, or `deploy/hawknexa/` changes. You can also run it manually from **Actions → Deploy HawkNexa VPS → Run workflow**.

### One-time: deploy webhook + GitHub secret

GitHub Actions cannot SSH into Hostinger VPS (port 22 is blocked from GitHub runners). Deploy uses an **HTTPS webhook** on port 443 instead.

On the VPS, the `deploy-webhook` Docker service handles deploy triggers. `DEPLOY_WEBHOOK_SECRET` must be set in `/opt/apps/hawknexa/deploy/.env`.

GitHub → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|--------|
| `HAWKNEXA_DEPLOY_WEBHOOK_SECRET` | Same value as `DEPLOY_WEBHOOK_SECRET` in the server `.env` |

Optional variable: `HAWKNEXA_DEPLOY_URL` (default `https://hawknexabackend.fynals.com/internal/deploy`).

Vercel auto-deploy is disabled; production deploys go through this workflow only.

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
