#!/usr/bin/env bash
# HawkNexa VPS preparation — Stage 1 (inspect) + Stage 2 (Docker, firewall, log rotation)
# Safe defaults: additive only, does not delete existing data or overwrite configs blindly.

set -euo pipefail

LOG_DIR="/var/log/hawknexa-deploy"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${LOG_DIR}/stage1-2-${STAMP}.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=============================================="
echo "HawkNexa server prep — ${STAMP}"
echo "Log: ${LOG_FILE}"
echo "=============================================="

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "ERROR: run as root (or with sudo)." >&2
    exit 1
  fi
}

require_root

echo ""
echo "=== STAGE 1: INSPECTION ==="
echo "--- System ---"
uname -a
lsb_release -a 2>/dev/null || true
echo "--- Disk ---"
df -h /
echo "--- Memory ---"
free -h
echo "--- CPU ---"
nproc
lscpu | grep -E 'Model name|^CPU[(]s[)]:' || true
echo "--- Docker (before) ---"
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || true
  docker ps -a 2>/dev/null || true
  docker volume ls 2>/dev/null || true
else
  echo "docker: not installed"
fi
echo "--- Listening ports ---"
ss -tlnp || netstat -tlnp 2>/dev/null || true
echo "--- Firewall (before) ---"
ufw status verbose 2>/dev/null || echo "ufw: not installed or inactive"
echo "--- Existing app dirs ---"
ls -la /opt 2>/dev/null || true
ls -la /var/www 2>/dev/null || true
echo "--- Docker daemon.json (before) ---"
if [[ -f /etc/docker/daemon.json ]]; then
  cat /etc/docker/daemon.json
else
  echo "(not present)"
fi

echo ""
echo "=== STAGE 2: BASE PACKAGES ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban

echo ""
echo "=== STAGE 2: DOCKER ENGINE + COMPOSE PLUGIN ==="
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-${VERSION_CODENAME}}")"
  DOCKER_APT_SOURCE="/etc/apt/sources.list.d/docker.sources"
  if [[ ! -f "$DOCKER_APT_SOURCE" ]]; then
    cat > "$DOCKER_APT_SOURCE" <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${CODENAME}
Components: stable
Architectures: ${ARCH}
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  fi

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "Docker already installed — skipping package install."
  if ! docker compose version >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y docker-compose-plugin
  fi
fi

systemctl enable docker
systemctl start docker

echo ""
echo "=== STAGE 2: DOCKER LOG ROTATION ==="
DAEMON_JSON="/etc/docker/daemon.json"
LOG_ROTATE_SNIPPET='{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}'

if [[ ! -f "$DAEMON_JSON" ]]; then
  echo "$LOG_ROTATE_SNIPPET" > "$DAEMON_JSON"
  echo "Created ${DAEMON_JSON}"
else
  if grep -q '"log-driver"' "$DAEMON_JSON"; then
    echo "Existing ${DAEMON_JSON} already defines log-driver — leaving unchanged."
  else
    BACKUP="${DAEMON_JSON}.bak.${STAMP}"
    cp -a "$DAEMON_JSON" "$BACKUP"
    python3 - <<'PY'
import json
from pathlib import Path

path = Path("/etc/docker/daemon.json")
backup = path.read_text()
data = json.loads(backup)
data.setdefault("log-driver", "json-file")
data.setdefault("log-opts", {})
data["log-opts"].setdefault("max-size", "10m")
data["log-opts"].setdefault("max-file", "5")
path.write_text(json.dumps(data, indent=2) + "\n")
print("Merged log rotation into existing daemon.json")
PY
    echo "Backup saved: ${BACKUP}"
  fi
fi

systemctl restart docker

echo ""
echo "=== STAGE 2: HAWKNEXA DIRECTORY LAYOUT (additive) ==="
mkdir -p /opt/apps/hawknexa/{repo,deploy,data}
chmod 755 /opt/apps /opt/apps/hawknexa /opt/apps/hawknexa/repo /opt/apps/hawknexa/deploy /opt/apps/hawknexa/data
touch /opt/apps/hawknexa/.stage2-complete
echo "Created /opt/apps/hawknexa layout (no files overwritten)."

echo ""
echo "=== STAGE 2: FIREWALL (UFW) ==="
# Allow SSH before enabling — avoids lockout on fresh VPS.
ufw allow OpenSSH
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

if ufw status | grep -q "Status: active"; then
  echo "UFW already active — rules updated, not re-enabled."
else
  ufw --force enable
  echo "UFW enabled."
fi
ufw status verbose

echo ""
echo "=== STAGE 2: FAIL2BAN (SSH) ==="
if [[ ! -f /etc/fail2ban/jail.local ]]; then
  cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF
  systemctl enable fail2ban
  systemctl restart fail2ban
  echo "fail2ban configured for sshd."
else
  echo "fail2ban jail.local already exists — left unchanged."
  systemctl enable fail2ban 2>/dev/null || true
  systemctl restart fail2ban 2>/dev/null || true
fi

echo ""
echo "=== VERIFICATION ==="
docker --version
docker compose version
docker info 2>/dev/null | grep -E 'Server Version|Logging Driver' || true
systemctl is-active docker
ss -tlnp | grep -E ':22|:80|:443' || true
ls -la /opt/apps/hawknexa
echo ""
echo "Stage 1 + Stage 2 complete."
echo "Next: Stage 3 — clone repo and add HawkNexa Docker deployment files."
