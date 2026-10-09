#!/usr/bin/env python3
"""CLI OCR worker for Nest PageOcrService. Prints one JSON object to stdout."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

_ENGINE = None

WEBLINK_RE = re.compile(
    r"weblinks?|encourage students to(?:\s*visit)?|visit below link|youtube\.com|youtu\.be|"
    r"https?://|watch\?v[=-]|[ab]+[_\s-]?channel|_channel|"
    r"^(?:Waves[\s-].{0,40}|Tank Interference|and Wavelength|launchSCIEN\w*)$",
    re.I,
)


def paddle_lang(lang: str) -> str:
    value = (lang or "en").lower()
    if value in {"en", "eng"}:
        return "en"
    if "ara" in value or "urd" in value or "ar" == value:
        return "arabic"
    return "en"


def get_engine(lang: str):
    global _ENGINE
    key = paddle_lang(lang)
    if _ENGINE and _ENGINE[0] == key:
        return _ENGINE[1]
    from paddleocr import PaddleOCR

    # paddleocr 2.x API (stable for CPU textbook photos).
    engine = PaddleOCR(
        use_angle_cls=True,
        lang=key,
        show_log=False,
        use_gpu=False,
    )
    _ENGINE = (key, engine)
    return engine


def _box_bounds(box: Any) -> tuple[float, float, float, float] | None:
    try:
        xs = [float(p[0]) for p in box]
        ys = [float(p[1]) for p in box]
        return min(xs), min(ys), max(xs), max(ys)
    except Exception:
        return None


def lines_from_result(result) -> list[dict[str, Any]]:
    """Return [{text, x0, y0, x1, y1}] from a Paddle 2.x ocr() result."""
    lines: list[dict[str, Any]] = []
    if not result:
        return lines
    page = result[0] if isinstance(result, list) and result else result
    if not page:
        return lines
    for item in page:
        try:
            if not (isinstance(item, (list, tuple)) and len(item) >= 2):
                continue
            box = item[0]
            payload = item[1]
            if isinstance(payload, (list, tuple)) and payload:
                text = str(payload[0]).strip()
            else:
                text = str(payload).strip()
            if not text:
                continue
            bounds = _box_bounds(box)
            if not bounds:
                lines.append({"text": text, "x0": 0.0, "y0": float(len(lines)), "x1": 1.0, "y1": float(len(lines))})
                continue
            x0, y0, x1, y1 = bounds
            lines.append({"text": text, "x0": x0, "y0": y0, "x1": x1, "y1": y1})
        except Exception:
            continue
    return lines


def _weblink_density(band: list[dict[str, Any]]) -> float:
    if not band:
        return 0.0
    hits = sum(1 for row in band if WEBLINK_RE.search(row["text"] or ""))
    return hits / len(band)


def _body_chars(band: list[dict[str, Any]]) -> int:
    total = 0
    for row in band:
        text = row.get("text") or ""
        if WEBLINK_RE.search(text):
            continue
        total += len(re.sub(r"\s+", "", text))
    return total


def _band_width(band: list[dict[str, Any]]) -> float:
    if not band:
        return 0.0
    return max(r["x1"] for r in band) - min(r["x0"] for r in band)


def pick_main_column(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    If a narrow side band is mostly Weblinks/URLs, keep the wider body column only.
    Otherwise return lines sorted top→bottom, left→right (default reading order).
    """
    if len(lines) < 8:
        return sorted(lines, key=lambda r: (r["y0"], r["x0"]))

    page_left = min(r["x0"] for r in lines)
    page_right = max(r["x1"] for r in lines)
    page_width = max(page_right - page_left, 1.0)

    mids = sorted((r["x0"] + r["x1"]) / 2.0 for r in lines)
    best_gap = 0.0
    split_at = -1.0
    for i in range(1, len(mids)):
        gap = mids[i] - mids[i - 1]
        if gap > best_gap:
            best_gap = gap
            split_at = (mids[i] + mids[i - 1]) / 2.0

    weblink_count = sum(1 for r in lines if WEBLINK_RE.search(r.get("text") or ""))
    gap_ok = best_gap >= page_width * 0.08 and split_at >= 0
    if not gap_ok:
        if weblink_count < 2:
            return sorted(lines, key=lambda r: (r["y0"], r["x0"]))
        # Typical textbook left rail when OCR midpoints do not show a wide gutter
        split_at = page_left + page_width * 0.34

    left = [r for r in lines if (r["x0"] + r["x1"]) / 2.0 < split_at]
    right = [r for r in lines if (r["x0"] + r["x1"]) / 2.0 >= split_at]
    if len(left) < 2 or len(right) < 2:
        return sorted(lines, key=lambda r: (r["y0"], r["x0"]))

    left_w = _band_width(left)
    right_w = _band_width(right)
    left_web = _weblink_density(left)
    right_web = _weblink_density(right)
    left_body = _body_chars(left)
    right_body = _body_chars(right)

    main = None
    if left_w <= page_width * 0.48 and left_web >= 0.22 and right_body > left_body:
        main = right
    elif right_w <= page_width * 0.48 and right_web >= 0.22 and left_body > right_body:
        main = left
    elif left_web >= 0.32 and right_web < 0.18 and right_body >= left_body:
        main = right
    elif right_web >= 0.32 and left_web < 0.18 and left_body >= right_body:
        main = left

    chosen = main if main and len(main) >= 4 else lines
    return sorted(chosen, key=lambda r: (r["y0"], r["x0"]))


def text_from_lines(lines: list[dict[str, Any]]) -> str:
    return "\n".join(r["text"] for r in lines if (r.get("text") or "").strip()).strip()


def predict_structured(image_path: str, lang: str) -> list[dict[str, Any]]:
    engine = get_engine(lang)
    # Prefer classic ocr() path — it returns boxes reliably on 2.x.
    if hasattr(engine, "ocr"):
        try:
            result = engine.ocr(image_path, cls=True)
            lines = lines_from_result(result)
            if lines:
                return pick_main_column(lines)
        except Exception:
            pass

    if hasattr(engine, "predict"):
        try:
            result = engine.predict(image_path)
            lines: list[dict[str, Any]] = []
            for res in result or []:
                data = getattr(res, "json", None) or getattr(res, "res", None) or res
                if not isinstance(data, dict):
                    continue
                texts = data.get("rec_texts") or data.get("texts") or []
                polys = data.get("dt_polys") or data.get("rec_polys") or data.get("boxes") or []
                for idx, t in enumerate(texts):
                    text = str(t).strip()
                    if not text:
                        continue
                    bounds = _box_bounds(polys[idx]) if idx < len(polys) else None
                    if bounds:
                        x0, y0, x1, y1 = bounds
                    else:
                        x0, y0, x1, y1 = 0.0, float(idx), 1.0, float(idx)
                    lines.append({"text": text, "x0": x0, "y0": y0, "x1": x1, "y1": y1})
            if lines:
                return pick_main_column(lines)
        except Exception:
            pass

    return []


def predict_text(image_path: str, lang: str) -> str:
    lines = predict_structured(image_path, lang)
    return text_from_lines(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="PaddleOCR worker for aiLensSchool")
    parser.add_argument("--image", required=True, help="Path to image file")
    parser.add_argument("--lang", default="en", help="Language hint (en|eng|arabic|eng+urd+ara)")
    args = parser.parse_args()

    image = Path(args.image)
    if not image.is_file():
        print(json.dumps({"ok": False, "error": f"Image not found: {args.image}"}), flush=True)
        return 2

    try:
        lines = predict_structured(str(image), args.lang)
        text = text_from_lines(lines)
        print(
            json.dumps(
                {
                    "ok": True,
                    "engine": "paddle",
                    "lang": paddle_lang(args.lang),
                    "text": text or "",
                    "chars": len((text or "").replace(" ", "")),
                    "lineCount": len(lines),
                    "columnFiltered": True,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
        return 0
    except Exception as exc:  # noqa: BLE001 — worker must always emit JSON
        print(json.dumps({"ok": False, "error": str(exc)}), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
