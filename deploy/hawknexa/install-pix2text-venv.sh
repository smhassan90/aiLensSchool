#!/usr/bin/env bash
# Install Pix2Text into the running backend container (persistent volume /opt/pix2text).
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-/opt/apps/hawknexa/deploy/docker-compose.prod.yml}"
CONTAINER="${PIX2TEXT_CONTAINER:-hawknexa-backend-1}"

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "ERROR: container ${CONTAINER} not running" >&2
  exit 1
fi

docker exec "${CONTAINER}" bash -ec '
set -euo pipefail
if [[ -x /opt/pix2text/bin/python ]] && /opt/pix2text/bin/python -c "from pix2text import Pix2Text" 2>/dev/null; then
  echo "Pix2Text venv already OK at /opt/pix2text"
else
  echo "=== Creating /opt/pix2text venv ==="
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3-venv python3-pip libgomp1 \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 libxcb1 \
    >/dev/null
  if [[ -d /opt/pix2text ]] && [[ -n "$(ls -A /opt/pix2text 2>/dev/null || true)" ]]; then
    echo "ERROR: /opt/pix2text is a non-empty mount; remove volume hawknexa_pix2text_venv to reinstall" >&2
    exit 1
  fi
  python3 -m venv /opt/pix2text
  /opt/pix2text/bin/pip install --no-cache-dir -U pip
  /opt/pix2text/bin/pip install --no-cache-dir -r /app/ocr/requirements-pix2text.txt
fi
export HF_HOME="${HF_HOME:-/app/.cache/huggingface}"
mkdir -p "${HF_HOME}"
echo "=== Warming Pix2Text (may download weights once) ==="
/opt/pix2text/bin/python -c "from pix2text import Pix2Text; Pix2Text(); print(\"Pix2Text load OK\")"
'

echo "Done. Set OCR_PIX2TEXT_MATH_CROPS=1 and PIX2TEXT_PYTHON=/opt/pix2text/bin/python in deploy .env, then recreate backend."
