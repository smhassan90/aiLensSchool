#!/usr/bin/env python3
"""Export reference exercise lines from chapter_dataset.json into train label list."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATASET = ROOT / "test-fixtures" / "fractions-chapter-calibration" / "chapter_dataset.json"
OUT = Path(__file__).resolve().parent / "data" / "chapter_calibration_labels.txt"


def main() -> int:
    if not DATASET.is_file():
        print(f"Missing {DATASET}", file=sys.stderr)
        return 2
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    lines: list[str] = []
    for page in data.get("pages", []):
        pid = page.get("id", "")
        for item in page.get("exerciseItems", []):
            if item.get("reviewStatus") != "reference":
                continue
            label = (item.get("label") or "").strip()
            text = (item.get("text") or "").strip()
            if not text:
                continue
            line = f"{label}. {text}" if label else text
            lines.append(f"# {pid}\n{line}")
        for snip in page.get("verifiedSnippets", []):
            if snip.get("reviewStatus") != "reference":
                continue
            t = (snip.get("text") or "").strip()
            if t and len(t) > 4:
                lines.append(f"# {pid}\n{t}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(lines)} reference lines to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
