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

Add these **repository secrets** in GitHub → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|--------|
| `HAWKNEXA_VPS_HOST` | VPS IP or hostname, e.g. `187.53.141.109` |
| `HAWKNEXA_VPS_USER` | `root` |
| `HAWKNEXA_VPS_SSH_KEY` | Private SSH key (read-only deploy key for Actions) |

Workflow: `.github/workflows/deploy-hawknexa-vps.yml` — runs on push to `main` when `backend/`, `portal/`, or `deploy/hawknexa/` changes.

Manual deploy on the server:

```bash
bash /opt/apps/hawknexa/deploy/deploy.sh
```

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
