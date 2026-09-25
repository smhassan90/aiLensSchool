#!/usr/bin/env bash
# HawkNexa ZKTeco edge sync — install Python + pyzk (Linux / macOS / Termux)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> HawkNexa biometric edge sync — prerequisite setup"
echo "    $SCRIPT_DIR"

find_python() {
  for cmd in python3 python py; do
    if command -v "$cmd" >/dev/null 2>&1; then
      if "$cmd" -c 'import sys; exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
        echo "$cmd"
        return 0
      fi
    fi
  done
  return 1
}

PYTHON=""
if ! PYTHON="$(find_python)"; then
  echo "Python 3.9+ not found."
  if command -v apt-get >/dev/null 2>&1; then
    read -r -p "Install python3 + pip with apt? [Y/n] " ans
    if [[ -z "$ans" || "$ans" =~ ^[Yy] ]]; then
      sudo apt-get update
      sudo apt-get install -y python3 python3-pip python3-venv
      PYTHON="$(find_python)" || true
    fi
  fi
  if [[ -z "$PYTHON" ]]; then
    echo "Install Python 3.9+ manually, then run this script again."
    exit 1
  fi
fi

echo "==> Using $PYTHON ($($PYTHON --version))"
"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install pyzk tzdata

echo "==> bootstrap.json is created on first agent run when you paste the API key."

"$PYTHON" -c "from zk import ZK; print('pyzk OK')"

echo ""
echo "Test:  $PYTHON hawknexa_device_sync.py --once"
echo "Run:   $PYTHON hawknexa_device_sync.py"
