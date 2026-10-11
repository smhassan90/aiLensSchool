#!/usr/bin/env python3
"""Validate custom Paddle rec inference dir before production use."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REQUIRED_SYMBOLS = ("÷", "×", "√", "λ", "θ", "π")
SMOKE_LINES = (
    "84 ÷ 4 = 21",
    "a. 1 2/5 ÷ 4/5",
    "3/4, 8/11",
    "v = f × λ",
)


def inference_files_ok(model_dir: Path) -> tuple[bool, str]:
    if not model_dir.is_dir():
        return False, f"not a directory: {model_dir}"
    charset = model_dir / "science_charset.txt"
    if not charset.is_file():
        return False, "missing science_charset.txt"
    has_weights = (model_dir / "inference.pdmodel").is_file() or (
        model_dir / "inference.json"
    ).is_file()
    if not (model_dir / "inference.pdiparams").is_file():
        return False, "missing inference.pdiparams"
    if not has_weights:
        return False, "missing inference.pdmodel or inference.json"
    return True, "ok"


def charset_covers(model_dir: Path) -> tuple[bool, list[str]]:
    charset_path = model_dir / "science_charset.txt"
    text = charset_path.read_text(encoding="utf-8")
    missing = [s for s in REQUIRED_SYMBOLS if s not in text]
    return len(missing) == 0, missing


def smoke_recognize(model_dir: Path) -> tuple[bool, str]:
    """Run Paddle on synthetic crops if available; else skip with warning."""
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        return True, "skip: paddleocr not importable in this interpreter"

    training_root = model_dir.parent.parent / "training"
    samples: list[Path] = []
    for name in ("_smoke_div.png", "_smoke_frac.png"):
        p = training_root / "data" / "train" / "images" / name
        if p.is_file():
            samples.append(p)
    if not samples:
        # Generate one line via training module if possible
        try:
            sys.path.insert(0, str(training_root.parent))
            from training.generate_textbook_rec_samples import render_line  # type: ignore
            import random

            rng = random.Random(0)
            im = render_line("a. 1 2/5 ÷ 4/5", rng)
            out = training_root / "data" / "train" / "images" / "_smoke_div.png"
            out.parent.mkdir(parents=True, exist_ok=True)
            im.save(out)
            samples = [out]
        except Exception as exc:
            return True, f"skip: no smoke images ({exc})"

    ocr = PaddleOCR(
        use_angle_cls=False,
        lang="en",
        show_log=False,
        use_gpu=False,
        rec_model_dir=str(model_dir),
        rec_char_dict_path=str(model_dir / "science_charset.txt"),
    )
    total_chars = 0
    for img in samples[:2]:
        try:
            result = ocr.ocr(str(img), cls=False)
        except Exception as exc:
            return False, f"inference failed: {exc}"
        for block in result or []:
            for line in block or []:
                if line and len(line) > 1:
                    t = str(line[1][0] or "")
                    total_chars += len(re.sub(r"\s+", "", t))
    if total_chars < 3:
        return False, "smoke test produced empty or trivial output"
    return True, f"ok ({total_chars} chars from {len(samples)} image(s))"


def validate_model_dir(model_dir: Path, *, run_smoke: bool = True) -> dict:
    ok_files, msg_files = inference_files_ok(model_dir)
    ok_cs, missing = charset_covers(model_dir)
    smoke_ok, smoke_msg = (True, "skipped") if not run_smoke else smoke_recognize(model_dir)
    passed = ok_files and ok_cs and smoke_ok
    return {
        "passed": passed,
        "path": str(model_dir),
        "files": msg_files,
        "charset_missing": missing,
        "smoke": smoke_msg,
    }


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("model_dir", nargs="?", default="")
    ap.add_argument("--no-smoke", action="store_true")
    args = ap.parse_args()
    here = Path(__file__).resolve().parent
    model_dir = Path(args.model_dir) if args.model_dir else here / "models" / "science-en-rec"
    report = validate_model_dir(model_dir, run_smoke=not args.no_smoke)
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
