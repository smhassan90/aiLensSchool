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
_ENGINE_KEY = None

WEBLINK_RE = re.compile(
    r"weblinks?|encourage students to(?:\s*visit)?|visit below link|youtube\.com|youtu\.be|"
    r"myphysicslab\.com|phet\.colorado\.edu|sciencelearn\.org\.nz|"
    r"https?://|watch\?v[=-]|[ab]+[_\s-]?channel|_channel|"
    r"^(?:Waves[\s-].{0,40}|Tank Interference|and Wavelength|launchSCIEN\w*|"
    r"Pendulum clock invention.{0,40}|oscillation and periodic motion)$|"
    r"pendulum-lab_en\.html|pendulum-en\.html|waves-and-energy",
    re.I,
)


def paddle_lang(lang: str) -> str:
    value = (lang or "en").lower()
    if value in {"en", "eng"}:
        return "en"
    if "ara" in value or "urd" in value or "ar" == value:
        return "arabic"
    return "en"


def _science_rec_model_dir() -> Path | None:
    """Fine-tuned rec model (λ/θ/π charset) from ocr/training — optional."""
    import os

    env = (os.environ.get("PADDLE_OCR_REC_MODEL_DIR") or "").strip()
    candidates = []
    if env:
        candidates.append(Path(env))
    here = Path(__file__).resolve().parent
    candidates.append(here / "models" / "science-en-rec")
    for path in candidates:
        if not path.is_dir():
            continue
        charset = path / "science_charset.txt"
        has_infer = any(
            (path / name).exists()
            for name in (
                "inference.pdmodel",
                "inference.json",
                "inference.pdiparams",
            )
        )
        if charset.is_file() and has_infer:
            return path
    return None


def get_engine(lang: str):
    global _ENGINE, _ENGINE_KEY
    key = paddle_lang(lang)
    rec_dir = _science_rec_model_dir()
    engine_key = f"{key}|rec={rec_dir}" if rec_dir else key
    if _ENGINE is not None and _ENGINE_KEY == engine_key:
        return _ENGINE
    from paddleocr import PaddleOCR

    kwargs: dict[str, Any] = dict(
        use_angle_cls=True,
        lang=key,
        show_log=False,
        use_gpu=False,
        # Lower det thresholds recover washed-out top lines on phone textbook photos.
        det_db_thresh=0.2,
        det_db_box_thresh=0.45,
        det_db_unclip_ratio=1.8,
    )
    # Trained science recognizer: same det, custom charset that includes λ θ π √ …
    if rec_dir is not None and key == "en":
        kwargs["rec_model_dir"] = str(rec_dir)
        kwargs["rec_char_dict_path"] = str(rec_dir / "science_charset.txt")
        print(f"[paddle_ocr_worker] using trained science rec model: {rec_dir}", file=sys.stderr)

    engine = PaddleOCR(**kwargs)
    _ENGINE = engine
    _ENGINE_KEY = engine_key
    return engine


def preprocess_for_ocr(image_path: str) -> str:
    """Upscale small pages + boost washed-out top band so openers are detectable."""
    try:
        from PIL import Image, ImageEnhance, ImageOps, ImageFilter
    except Exception:
        return image_path

    path = Path(image_path)
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return image_path

    w, h = im.size
    min_edge = min(w, h)
    scale = max(1400 / max(min_edge, 1), 1.0)
    if scale > 1.02:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
        w, h = im.size

    im = ImageOps.autocontrast(im, cutoff=1)
    im = ImageEnhance.Contrast(im).enhance(1.12)

    # Top third of phone textbook shots is often brighter / lower-contrast.
    top_h = max(40, int(h * 0.36))
    top = im.crop((0, 0, w, top_h))
    top = ImageOps.autocontrast(top, cutoff=2)
    top = ImageEnhance.Contrast(top).enhance(1.35)
    top = ImageEnhance.Sharpness(top).enhance(1.25)
    top = top.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))
    im.paste(top, (0, 0))

    out = path.with_name(f"{path.stem}__paddle_prep{path.suffix}")
    im.save(out, quality=93)
    return str(out)


def _line_text(row: dict[str, Any]) -> str:
    return str(row.get("text") or "").strip()


def opener_looks_complete(text: str) -> bool:
    head = (text or "")[:400].lower()
    return bool(
        re.search(
            r"\bin this chapter\b|\bunit\s+\d|\b14\.1\s+electric charge\b|\bcharge is a basic\b",
            head,
        )
    )


def ocr_top_band(image_path: str, lang: str, fraction: float = 0.38) -> list[dict[str, Any]]:
    """Second-pass OCR on the top band when the first pass missed the chapter opener."""
    try:
        from PIL import Image, ImageEnhance, ImageOps
    except Exception:
        return []

    path = Path(image_path)
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return []

    w, h = im.size
    band_h = max(80, int(h * fraction))
    top = im.crop((0, 0, w, band_h))
    top = top.resize((max(1, top.width * 2), max(1, top.height * 2)), Image.Resampling.LANCZOS)
    top = ImageOps.autocontrast(top, cutoff=1)
    top = ImageEnhance.Contrast(top).enhance(1.25)
    scale_y = band_h / max(1, top.height)
    band_path = path.with_name(f"{path.stem}__top_band{path.suffix}")
    top.save(band_path, quality=92)

    engine = get_engine(lang)
    try:
        result = engine.ocr(str(band_path), cls=True)
        lines = lines_from_result(result)
    except Exception:
        return []
    finally:
        try:
            band_path.unlink(missing_ok=True)
        except Exception:
            pass

    # Map y back into original page coordinates (top band only).
    for row in lines:
        row["y0"] = float(row["y0"]) * scale_y
        row["y1"] = float(row["y1"]) * scale_y
    return sorted(lines, key=lambda r: (r["y0"], r["x0"]))


def merge_top_band_lines(
    full: list[dict[str, Any]], top: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if not top:
        return full
    existing = {re.sub(r"\s+", " ", _line_text(r)).lower() for r in full if _line_text(r)}
    extras: list[dict[str, Any]] = []
    for row in top:
        text = _line_text(row)
        if not text or len(text) < 8:
            continue
        key = re.sub(r"\s+", " ", text).lower()
        if key in existing:
            continue
        # Prefer opener / early-paragraph lines from the top band.
        if re.search(
            r"in this chapter|static charges|electrostatics|electric force|electric field|"
            r"electric potential|precautions|not moving|14\.1|charge is a basic",
            key,
        ) or float(row.get("y0") or 0) < 220:
            extras.append(row)
            existing.add(key)
    if not extras:
        return full
    return sorted(full + extras, key=lambda r: (r["y0"], r["x0"]))


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
            # Paddle 2.x: payload is (text, confidence). Never stringify the tuple.
            if isinstance(payload, (list, tuple)) and payload:
                text = str(payload[0]).strip()
            elif isinstance(payload, dict):
                text = str(payload.get("text") or payload.get("transcription") or "").strip()
            elif isinstance(payload, str):
                text = payload.strip()
            else:
                continue
            if not text:
                continue
            bounds = _box_bounds(box)
            if not bounds:
                lines.append({"text": text, "x0": 0.0, "y0": float(len(lines)), "x1": 1.0, "y1": float(len(lines))})
                continue
            x0, y0, x1, y1 = bounds
            # Drop near-duplicate boxes (same text, heavily overlapping) from multi-pass noise.
            mid_y = (y0 + y1) / 2.0
            mid_x = (x0 + x1) / 2.0
            dup = False
            for prev in lines[-8:]:
                if (prev.get("text") or "").strip() != text:
                    continue
                py = (prev["y0"] + prev["y1"]) / 2.0
                px = (prev["x0"] + prev["x1"]) / 2.0
                if abs(py - mid_y) <= 12 and abs(px - mid_x) <= 40:
                    dup = True
                    break
            if dup:
                continue
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
    prepared = preprocess_for_ocr(image_path)
    engine = get_engine(lang)
    lines: list[dict[str, Any]] = []

    # Prefer classic ocr() path — it returns boxes reliably on 2.x.
    if hasattr(engine, "ocr"):
        try:
            result = engine.ocr(prepared, cls=True)
            lines = lines_from_result(result)
        except Exception:
            lines = []

    if not lines and hasattr(engine, "predict"):
        try:
            result = engine.predict(prepared)
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
        except Exception:
            lines = []

    if prepared != image_path:
        try:
            Path(prepared).unlink(missing_ok=True)
        except Exception:
            pass

    if not lines:
        return []

    chosen = pick_main_column(lines)
    text = text_from_lines(chosen)
    if not opener_looks_complete(text):
        # Full-page pass often skips the bright top paragraph — recover from a zoomed top band.
        top = ocr_top_band(image_path, lang)
        chosen = merge_top_band_lines(chosen, top)
    return chosen


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
                    "openerOk": opener_looks_complete(text or ""),
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
