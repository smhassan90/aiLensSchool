#!/usr/bin/env bash
set -euo pipefail
cd /opt/apps/hawknexa/repo
git remote prune origin || true
git fetch --prune origin main || git fetch origin '+refs/heads/main:refs/remotes/origin/main'
git reset --hard origin/main
rsync -a --exclude '.env' /opt/apps/hawknexa/repo/deploy/hawknexa/ /opt/apps/hawknexa/deploy/
cd /opt/apps/hawknexa/deploy
export BUILD_SHA
BUILD_SHA="$(git -C /opt/apps/hawknexa/repo rev-parse --short HEAD)"
echo "BUILD_SHA=${BUILD_SHA}"
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d --no-deps backend
for i in $(seq 1 20); do
  if curl -fsS "https://hawknexabackend.fynals.com/api/v1/health" | tee /tmp/hawknexa-health.json; then
    echo
    exit 0
  fi
  sleep 3
done
exit 1
