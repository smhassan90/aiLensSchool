#!/usr/bin/env python3
"""
Phase 6.8 — single-model math recognition worker (isolated eval venv).

Usage:
  python benchmark_worker.py --model pix2tex --input benchmark-input.json --output results-pix2tex.json
  python benchmark_worker.py --model pix2text --input benchmark-input.json --output results-pix2text.json

Reads samples[].imagePath (absolute or relative to cwd). Loads one model per process.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from importlib.metadata import PackageNotFoundError, version as pkg_version
from pathlib import Path


def _pkg_ver(name: str) -> str:
    try:
        return pkg_version(name)
    except PackageNotFoundError:
        return "unknown"


def run_pix2text(samples: list[dict], timeout_s: float) -> dict:
    from pix2text import Pix2Text

    t0 = time.perf_counter()
    model = Pix2Text()
    init_ms = int((time.perf_counter() - t0) * 1000)
    rows = []
    for s in samples:
        t1 = time.perf_counter()
        err = None
        text = ""
        try:
            out = model.recognize(str(s["imagePath"]))
            text = "\n".join(str(x) for x in out) if isinstance(out, list) else str(out)
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
        ms = int((time.perf_counter() - t1) * 1000)
        if ms > timeout_s * 1000:
            err = err or "timeout_exceeded"
        rows.append(
            {
                "sampleId": s["sampleId"],
                "rawOutput": text,
                "error": err,
                "inferenceMs": ms,
            }
        )
    return {
        "modelId": "pix2text",
        "packageVersion": _pkg_ver("pix2text"),
        "initMs": init_ms,
        "device": "cpu",
        "rows": rows,
    }


def run_pix2tex(samples: list[dict], timeout_s: float) -> dict:
    from pix2tex.cli import LatexOCR
    from PIL import Image

    t0 = time.perf_counter()
    model = LatexOCR()
    init_ms = int((time.perf_counter() - t0) * 1000)
    rows = []
    for s in samples:
        t1 = time.perf_counter()
        err = None
        text = ""
        try:
            im = Image.open(s["imagePath"]).convert("RGB")
            text = model(im)
        except Exception as e:
            err = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        ms = int((time.perf_counter() - t1) * 1000)
        if ms > timeout_s * 1000:
            err = err or "timeout_exceeded"
        rows.append(
            {
                "sampleId": s["sampleId"],
                "rawOutput": text,
                "error": err,
                "inferenceMs": ms,
            }
        )
    return {
        "modelId": "pix2tex",
        "packageVersion": _pkg_ver("pix2tex"),
        "initMs": init_ms,
        "device": "cpu",
        "licenseNote": "MIT (LaTeX-OCR / pix2tex upstream — verify for commercial use)",
        "rows": rows,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=["pix2text", "pix2tex"], required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--timeout-s", type=float, default=120.0)
    args = ap.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    samples = payload["samples"]
    for s in samples:
        p = Path(s["imagePath"])
        if not p.is_file():
            print(f"missing crop {p}", file=sys.stderr)
            return 2

    if args.model == "pix2text":
        result = run_pix2text(samples, args.timeout_s)
    else:
        result = run_pix2tex(samples, args.timeout_s)

    result["python"] = sys.version
    result["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
