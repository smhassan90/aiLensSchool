#!/usr/bin/env python3
"""Promote validated science-en-rec-candidate to production science-en-rec."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANDIDATE = HERE / "models" / "science-en-rec-candidate"
PRODUCTION = HERE / "models" / "science-en-rec"


def main() -> int:
    validate_py = HERE / "model_validate.py"
    cmd = [sys.executable, str(validate_py), str(CANDIDATE)]
    print("Validating:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(HERE))
    if PRODUCTION.is_dir():
        backup = HERE / "models" / f"science-en-rec-backup"
        if backup.is_dir():
            shutil.rmtree(backup)
        shutil.copytree(PRODUCTION, backup)
        print(f"Backed up production to {backup}")
        shutil.rmtree(PRODUCTION)
    shutil.copytree(CANDIDATE, PRODUCTION)
    print(f"Promoted {CANDIDATE} -> {PRODUCTION}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
