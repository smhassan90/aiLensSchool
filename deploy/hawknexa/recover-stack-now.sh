#!/usr/bin/env bash
set -euo pipefail
cd /opt/apps/hawknexa/deploy
echo "=== Force-clear and bring stack up ==="
docker compose -f docker-compose.prod.yml down --remove-orphans || true
sleep 3
# Never kill the in-flight GitHub deploy runner (hawknexa-deploy-run).
ids="$(docker ps -aq --filter name=hawknexa- | grep -v 'hawknexa-deploy-run' || true)"
if [[ -n "${ids}" ]]; then
  # shellcheck disable=SC2086
  docker rm -f ${ids} || true
fi
docker container prune -f || true
sleep 2

cd /opt/apps/hawknexa/repo
git remote prune origin || true
git fetch --prune origin main || git fetch origin '+refs/heads/main:refs/remotes/origin/main'
git reset --hard origin/main
rsync -a --exclude '.env' /opt/apps/hawknexa/repo/deploy/hawknexa/ /opt/apps/hawknexa/deploy/
sed -i 's/\r$//' /opt/apps/hawknexa/deploy/deploy.sh /opt/apps/hawknexa/deploy/recover-stack-now.sh || true
chmod +x /opt/apps/hawknexa/deploy/deploy.sh /opt/apps/hawknexa/deploy/recover-stack-now.sh

cd /opt/apps/hawknexa/deploy
BUILD_SHA="$(cd /opt/apps/hawknexa/repo && git rev-parse --short HEAD)"
echo "BUILD_SHA=${BUILD_SHA}"
docker compose -f docker-compose.prod.yml up -d mysql redis
sleep 10
docker compose -f docker-compose.prod.yml up -d --no-deps backend portal caddy deploy-webhook

echo "=== Wait health ==="
for i in $(seq 1 24); do
  if curl -fsS https://hawknexabackend.fynals.com/api/v1/health >/dev/null; then
    echo "OK health"
    curl -fsS https://hawknexabackend.fynals.com/api/v1/health
    docker compose -f docker-compose.prod.yml ps
    python3 - <<PY
import json, time, subprocess
from pathlib import Path
commit = subprocess.check_output(
    ['git', '-C', '/opt/apps/hawknexa/repo', 'rev-parse', '--short', 'HEAD'],
    text=True,
).strip()
Path('/opt/apps/hawknexa/deploy/.last-deploy.json').write_text(
    json.dumps(
        {
            'status': 'success',
            'message': 'Recovered after container-removal race',
            'commit': commit,
            'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'running': False,
        },
        indent=2,
    )
)
print('status written', commit)
PY
    exit 0
  fi
  echo "waiting ${i}"
  sleep 5
done
echo "FAILED"
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail 50
exit 1
