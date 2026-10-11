#!/usr/bin/env python3
"""Pix2Text crop worker — one JSON line on stdout. Batch mode loads the model once."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

_ENGINE = None
_VERSION = None


def _engine():
    global _ENGINE, _VERSION
    if _ENGINE is not None:
        return _ENGINE
    try:
        from importlib.metadata import PackageNotFoundError, version as pkg_version

        try:
            _VERSION = pkg_version("pix2text")
        except PackageNotFoundError:
            _VERSION = "unknown"
        from pix2text import Pix2Text

        _ENGINE = Pix2Text()
        return _ENGINE
    except Exception as e:
        raise RuntimeError(f"pix2text_unavailable: {e}") from e


def _recognize(path: Path) -> dict[str, Any]:
    t0 = time.perf_counter()
    try:
        p2t = _engine()
        out = p2t.recognize(str(path))
        if isinstance(out, list):
            text = "\n".join(str(x) for x in out)
        else:
            text = str(out)
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": True, "text": text, "ms": ms, "error": None}
    except Exception as e:
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "text": "", "ms": ms, "error": f"{type(e).__name__}: {e}"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--batch-json",
        required=True,
        help='JSON file: {"crops":[{"id":"r1","path":"/abs/img.jpg"}]}',
    )
    args = parser.parse_args()
    batch_path = Path(args.batch_json)
    if not batch_path.is_file():
        print(
            json.dumps(
                {"ok": False, "error": "batch_file_missing", "results": []},
                ensure_ascii=False,
            )
        )
        return 1

    try:
        batch = json.loads(batch_path.read_text(encoding="utf-8"))
        crops = batch.get("crops") or []
    except Exception as e:
        print(
            json.dumps(
                {"ok": False, "error": f"invalid_batch: {e}", "results": []},
                ensure_ascii=False,
            )
        )
        return 1

    results: list[dict[str, Any]] = []
    load_ms = 0
    try:
        t_load = time.perf_counter()
        _engine()
        load_ms = int((time.perf_counter() - t_load) * 1000)
    except RuntimeError as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(e),
                    "results": [],
                    "version": _VERSION,
                },
                ensure_ascii=False,
            )
        )
        return 0

    for item in crops:
        cid = str(item.get("id") or "")
        path = Path(str(item.get("path") or ""))
        if not path.is_file():
            results.append(
                {
                    "id": cid,
                    "ok": False,
                    "text": "",
                    "ms": 0,
                    "error": "missing_image",
                }
            )
            continue
        rec = _recognize(path)
        results.append({"id": cid, **rec})

    print(
        json.dumps(
            {
                "ok": True,
                "version": _VERSION,
                "loadMs": load_ms,
                "results": results,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
