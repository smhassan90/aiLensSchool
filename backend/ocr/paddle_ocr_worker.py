#!/usr/bin/env python3
"""CLI OCR worker for Nest PageOcrService. Prints one JSON object to stdout."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ENGINE = None


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


def lines_from_result(result) -> list[str]:
    lines: list[str] = []
    if not result:
        return lines
    # 2.x: [ [ [box], (text, conf) ], ... ] per page
    page = result[0] if isinstance(result, list) and result else result
    if not page:
        return lines
    for item in page:
        try:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                payload = item[1]
                if isinstance(payload, (list, tuple)) and payload:
                    text = str(payload[0]).strip()
                else:
                    text = str(payload).strip()
                if text:
                    lines.append(text)
        except Exception:
            continue
    return lines


def predict_text(image_path: str, lang: str) -> str:
    engine = get_engine(lang)
    # Prefer predict() when available (3.x); else ocr() (2.x).
    if hasattr(engine, "predict"):
        try:
            result = engine.predict(image_path)
            lines: list[str] = []
            for res in result or []:
                data = getattr(res, "json", None) or getattr(res, "res", None) or res
                if isinstance(data, dict):
                    rec = data.get("rec_texts") or data.get("texts") or []
                    for t in rec:
                        t = str(t).strip()
                        if t:
                            lines.append(t)
                    if lines:
                        return "\n".join(lines)
                printed = getattr(res, "str", None)
                if callable(printed):
                    # fall through to ocr()
                    pass
            if lines:
                return "\n".join(lines)
        except Exception:
            pass

    result = engine.ocr(image_path, cls=True)
    return "\n".join(lines_from_result(result))


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
        text = predict_text(str(image), args.lang)
        print(
            json.dumps(
                {
                    "ok": True,
                    "engine": "paddle",
                    "lang": paddle_lang(args.lang),
                    "text": text or "",
                    "chars": len((text or "").replace(" ", "")),
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
