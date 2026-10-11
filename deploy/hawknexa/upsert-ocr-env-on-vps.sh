#!/usr/bin/env bash
set -euo pipefail
ENV="${1:-/opt/apps/hawknexa/deploy/.env}"
if [[ ! -f "${ENV}" ]]; then
  echo "ERROR: ${ENV} not found" >&2
  exit 1
fi
upsert() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=" "${ENV}"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "${ENV}"
  else
    printf '\n# Lesson page OCR (Paddle + Tesseract)\n%s=%s\n' "${key}" "${val}" >> "${ENV}"
  fi
}
upsert BUILD_PADDLE_OCR 1
upsert OCR_ENGINE auto
# Pix2Text math crops: off unless venv + weights are installed on the host (see backend/docs/PIX2TEXT_MATH_CROPS.md)
upsert OCR_PIX2TEXT_MATH_CROPS 0
echo "=== OCR settings in ${ENV} ==="
grep -E '^BUILD_PADDLE_OCR=|^OCR_ENGINE=|^OCR_PIX2TEXT_MATH_CROPS=' "${ENV}"
