#!/usr/bin/env bash
# Write FIREBASE_SERVICE_ACCOUNT_JSON into the HawkNexa deploy .env from the mobile service-account key.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/apps/hawknexa/repo}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/apps/hawknexa/deploy}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env}"

if [[ $# -ge 1 ]]; then
  JSON_FILE="$1"
else
  JSON_FILE="$(find "${REPO_DIR}/mobile" -maxdepth 1 -name '*firebase-adminsdk*.json' -type f | head -n 1)"
fi

if [[ -z "${JSON_FILE}" || ! -f "${JSON_FILE}" ]]; then
  echo "ERROR: Firebase service-account JSON not found." >&2
  echo "Place it in ${REPO_DIR}/mobile/ or pass the file path as the first argument." >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found." >&2
  exit 1
fi

python3 - "$JSON_FILE" "$ENV_FILE" <<'PY'
import json
import pathlib
import sys

json_path = pathlib.Path(sys.argv[1])
env_path = pathlib.Path(sys.argv[2])
service_account = json.loads(json_path.read_text(encoding="utf-8"))
inline = json.dumps(service_account, separators=(",", ":"))
key = "FIREBASE_SERVICE_ACCOUNT_JSON"
lines = env_path.read_text(encoding="utf-8").splitlines()
updated = False
out = []
for line in lines:
    if line.startswith(f"{key}="):
        out.append(f"{key}={inline}")
        updated = True
    else:
        out.append(line)
if not updated:
    if out and out[-1].strip():
        out.append("")
    out.append(f"{key}={inline}")
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"project_id={service_account['project_id']}")
PY

echo "Updated ${ENV_FILE} with FIREBASE_SERVICE_ACCOUNT_JSON from:"
echo "  ${JSON_FILE}"
echo ""
echo "Redeploy to apply:"
echo "  bash ${DEPLOY_DIR}/deploy.sh"
