#!/usr/bin/env python3
"""
Prototype (eval-only): fuse existing plain OCR with Pix2Text on math crops.
NOT wired into NestJS. Use to experiment before any feature flag in production.

Example:
  set PIX2TEXT_CROP=backend/eval/.../p57-divide-grid__divide_grid.jpg
  python prototype_hybrid_math_fusion.py --page-crop ...
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

# Reuse normalization from eval harness
from run_specialized_math_eval import latex_frac_plain, math_match_text, run_pix2text


def latex_to_app_plain(text: str) -> str:
    """Rough LaTeX → lesson plain text (keeps uncertainty as-is)."""
    t = latex_frac_plain(text)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", type=Path, help="Plain OCR text file (merge output)")
    ap.add_argument("--crop", type=Path, required=True, help="Math region JPEG")
    ap.add_argument("--out", type=Path, default=Path("outputs/hybrid_prototype.json"))
    args = ap.parse_args()

    from pix2text import Pix2Text

    p2t = Pix2Text()
    raw = run_pix2text(args.crop, p2t)
    math_plain = latex_to_app_plain(raw.get("text", ""))

    baseline = args.baseline.read_text(encoding="utf-8") if args.baseline else ""
    payload = {
        "baselineLen": len(baseline),
        "mathCropPlain": math_plain,
        "mathCropRaw": raw,
        "note": "Fusion splice not automated — inspect mathCropPlain vs baseline manually.",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
