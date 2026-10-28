#!/usr/bin/env bash
# Keep portal.fitnixtrack.com working when HawkNexa deploys recreate Caddy.
# FitNix app stack lives under /opt/apps/fitnixtrack; HawkNexa Caddy terminates TLS
# and reverse-proxies via the external Docker network "edge".
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/apps/hawknexa/deploy}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/docker-compose.prod.yml}"
CADDYFILE="${DEPLOY_DIR}/Caddyfile"
FITNIX_INCLUDE_SRC="/opt/apps/fitnixtrack/deploy/Caddyfile.fitnixtrack"
FITNIX_IMPORT='import /etc/caddy/includes/fitnixtrack.caddy'
EDGE_NETWORK="${FITNIX_EDGE_NETWORK:-edge}"
FITNIX_PORTAL_URL="${FITNIX_PORTAL_URL:-https://portal.fitnixtrack.com/}"

if [[ ! -f "${FITNIX_INCLUDE_SRC}" ]]; then
  echo "FitNix co-host: ${FITNIX_INCLUDE_SRC} not found — skipping (FitNix not on this server)."
  exit 0
fi

if [[ ! -f "${COMPOSE_FILE}" || ! -f "${CADDYFILE}" ]]; then
  echo "ERROR: FitNix co-host: missing ${COMPOSE_FILE} or ${CADDYFILE}" >&2
  exit 1
fi

echo "=== FitNix co-host: ensure Docker edge network ==="
if ! docker network inspect "${EDGE_NETWORK}" >/dev/null 2>&1; then
  docker network create "${EDGE_NETWORK}"
fi

echo "=== FitNix co-host: ensure Caddyfile import ==="
if ! grep -qF "${FITNIX_IMPORT}" "${CADDYFILE}"; then
  {
    echo ""
    echo "# FitNix Track (managed from /opt/apps/fitnixtrack/deploy — required for client portal)"
    echo "${FITNIX_IMPORT}"
  } >> "${CADDYFILE}"
fi

echo "=== FitNix co-host: ensure compose mount + edge on Caddy ==="
python3 <<PY
from pathlib import Path

compose = Path("${COMPOSE_FILE}")
text = compose.read_text()
mount = "      - /opt/apps/fitnixtrack/deploy/Caddyfile.fitnixtrack:/etc/caddy/includes/fitnixtrack.caddy:ro"
changed = False

if mount not in text:
    needle = "      - ./Caddyfile:/etc/caddy/Caddyfile:ro"
    if needle not in text:
        raise SystemExit("FitNix co-host: cannot find Caddyfile volume in compose")
    text = text.replace(needle, needle + "\n" + mount, 1)
    changed = True

if "  edge:\n    external: true\n    name: edge\n" not in text:
    text = text.replace(
        "networks:\n  hawknexa_internal:\n    driver: bridge\n\nvolumes:",
        "networks:\n  hawknexa_internal:\n    driver: bridge\n  edge:\n    external: true\n    name: edge\n\nvolumes:",
    )
    changed = True

caddy_net = "    networks:\n      - hawknexa_internal\n      - edge\n"
if "      - edge\n" not in text:
    text = text.replace(
        "    networks:\n      - hawknexa_internal\n\nnetworks:",
        caddy_net + "\nnetworks:",
    )
    changed = True

if changed:
    compose.write_text(text)
    print("patched docker-compose.prod.yml")
else:
    print("compose already OK")
PY

recreate_caddy=false
if ! docker ps --format '{{.Names}}' | grep -qx 'hawknexa-caddy-1'; then
  recreate_caddy=true
elif ! docker exec hawknexa-caddy-1 test -f /etc/caddy/includes/fitnixtrack.caddy 2>/dev/null; then
  recreate_caddy=true
elif ! docker exec hawknexa-caddy-1 wget -qO- --timeout=5 http://fitnixtrack-portal:3000/ >/dev/null 2>&1; then
  recreate_caddy=true
fi

if [[ "${recreate_caddy}" == "true" ]]; then
  echo "=== FitNix co-host: recreating Caddy with FitNix mount + edge network ==="
  cd "${DEPLOY_DIR}"
  docker compose -f "${COMPOSE_FILE}" up -d --no-deps caddy
  sleep 2
fi

if ! docker exec hawknexa-caddy-1 caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  echo "ERROR: FitNix co-host: Caddy config invalid after ensure step" >&2
  docker exec hawknexa-caddy-1 caddy validate --config /etc/caddy/Caddyfile 2>&1 | tail -5 >&2 || true
  exit 1
fi

if ! docker exec hawknexa-caddy-1 wget -qO- --timeout=8 http://fitnixtrack-portal:3000/ >/dev/null 2>&1; then
  echo "ERROR: FitNix co-host: Caddy cannot reach fitnixtrack-portal:3000 on network ${EDGE_NETWORK}" >&2
  exit 1
fi

if curl -fsS -o /dev/null --max-time 20 "${FITNIX_PORTAL_URL}"; then
  echo "OK: FitNix portal ${FITNIX_PORTAL_URL}"
else
  echo "WARN: FitNix portal HTTPS check failed (${FITNIX_PORTAL_URL}) — upstream from Caddy is OK; check DNS/certs" >&2
fi
