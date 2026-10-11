#!/usr/bin/env python3
"""
Append teacher-verified labels from a JSON export into rec training lists.

Export format (array of objects):
  { "label": "...", "split_group": "lesson:...:source:...", "image_path": "optional/crop.png" }

Full-page crops: run a separate export that writes images under data/real/images/.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REAL_DIR = ROOT / "data" / "real"
REAL_GT = REAL_DIR / "rec_gt.txt"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("export_json", type=Path, help="JSON file from ocr_training_examples export")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not args.export_json.is_file():
        print(f"Missing {args.export_json}", file=sys.stderr)
        return 2
    rows = json.loads(args.export_json.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        print("Expected JSON array", file=sys.stderr)
        return 2
    REAL_DIR.mkdir(parents=True, exist_ok=True)
    (REAL_DIR / "images").mkdir(parents=True, exist_ok=True)
    existing = set()
    if REAL_GT.is_file():
        for line in REAL_GT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                existing.add(line.strip())
    added = 0
    for row in rows:
        label = (row.get("label") or "").strip()
        if not label or len(label) < 2:
            continue
        img = (row.get("image_path") or row.get("image") or "").strip()
        if not img:
            # Text-only line: skip until crop export exists
            continue
        rel = img.replace("\\", "/")
        line = f"images/{Path(rel).name}\t{label}"
        if line in existing:
            continue
        existing.add(line)
        added += 1
        if not args.dry_run:
            with REAL_GT.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
    print(f"Added {added} lines to {REAL_GT} (dry_run={args.dry_run})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
