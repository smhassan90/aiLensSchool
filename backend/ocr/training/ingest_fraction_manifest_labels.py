#!/usr/bin/env python3
"""Append manifest trainLabels as rendered line crops into data/train (and val)."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from generate_textbook_rec_samples import DATA, render_line

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "fractions_pages_manifest.json"


def append_labels(labels: list[str], split: str, seed: int, repeats: int = 3) -> int:
    rng = random.Random(seed)
    img_dir = DATA / split / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    gt_path = DATA / split / "rec_gt.txt"
    existing = gt_path.read_text(encoding="utf-8") if gt_path.is_file() else ""
    lines: list[str] = []
    n = 0
    for label in labels:
        for r in range(repeats):
            im = render_line(label, rng)
            lab = label
            name = f"frac_{split}_{abs(hash(label)) % 100000}_{r}_{n:04d}.png"
            im.save(img_dir / name)
            lines.append(f"images/{name}\t{lab}")
            n += 1
    if lines:
        gt_path.write_text(existing + ("\n" if existing and not existing.endswith("\n") else "") + "\n".join(lines) + "\n", encoding="utf-8")
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page-id", default="")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--repeats", type=int, default=4)
    args = ap.parse_args()
    pages = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if args.page_id:
        pages = [p for p in pages if p["id"] == args.page_id]
    total = 0
    for p in pages:
        labels = p.get("trainLabels") or []
        if not labels:
            continue
        total += append_labels(labels, "train", seed=hash(p["id"]) % 10000, repeats=args.repeats)
        total += append_labels(labels[:2], "val", seed=hash(p["id"]) % 10000 + 1, repeats=1)
        print(f"ingested {len(labels)} labels for {p['id']}")
    print(f"total new crops: {total}")


if __name__ == "__main__":
    main()
