#!/usr/bin/env bash
# Run p57 (or other) OCR diagnostic inside the production backend container.
# Usage on VPS (from deploy dir):
#   bash /opt/apps/hawknexa/repo/deploy/hawknexa/run-ocr-pipeline-diagnose-in-backend.sh \
#     test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg p57-divide-grid 0
#
# Third arg: 0 = OCR_PIX2TEXT_MATH_CROPS off, 1 = on (matches deploy .env default when 1).
set -euo pipefail

IMAGE_REL="${1:?image path relative to backend/}"
TEST_ID="${2:?test case id e.g. p57-divide-grid}"
PIX2="${3:-0}"

COMPOSE_DIR="${HAWKNEXA_DEPLOY_DIR:-/opt/apps/hawknexa/deploy}"
cd "$COMPOSE_DIR"

CID="$(docker compose -f docker-compose.prod.yml ps -q backend)"
if [ -z "$CID" ]; then
  echo "backend container not found" >&2
  exit 1
fi

docker compose -f docker-compose.prod.yml exec -T backend sh -c "
  set -e
  cd /app
  export OCR_DIAGNOSTIC=1
  export OCR_DIAGNOSTIC_DIR=/app/var/ocr-diagnostic
  export OCR_DIAGNOSTIC_ALLOWED_TEST_IDS=${TEST_ID}
  export OCR_PIX2TEXT_MATH_CROPS=${PIX2}
  export OCR_AI_MERGE=\${OCR_AI_MERGE:-0}
  IMG=/app/${IMAGE_REL}
  if [ ! -f \"\$IMG\" ]; then
    echo \"missing image: \$IMG\" >&2
    exit 2
  fi
  npx ts-node --transpile-only scripts/ocr-pipeline-diagnose.ts \"\$IMG\" \"${TEST_ID}\" Mathematics
"

echo "Artifacts under backend var/ocr-diagnostic inside container (mount or docker cp as needed)."
