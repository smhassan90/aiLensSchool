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


def get_engine(lang: str, *, use_science_rec: bool = True):
    global _ENGINE, _ENGINE_KEY
    key = paddle_lang(lang)
    rec_dir = _science_rec_model_dir() if use_science_rec else None
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


_DIGIT_ONLY_RE = re.compile(r"^\d{1,3}$")
_FRAC_EXPR_RE = re.compile(r"^\d{1,3}(?:\s*[÷+\u00d7x*]\s*\d{1,2})?$")
_FRAC_TOKEN_RE = re.compile(
    r"^(?:\d{1,3}\s+)?\d{1,3}\s*/\s*\d{1,3}$|^\d{1,3}$"
)
_DIV_OP_RE = re.compile(r"^[÷:]$|^(?:div|divided)$", re.I)
# OCR often misreads ÷ as a lone dash/dot between two fractions.
_DIV_OP_LOOSE_RE = re.compile(r"^[-–—_=·.•]$")
_BAR_RE = re.compile(r"^[-–—_=‾¯\-]{1,6}$")
_LETTERED_ITEM_RE = re.compile(r"^[a-n][.)]$", re.I)


def _is_fraction_digit(text: str) -> bool:
    t = (text or "").strip()
    return bool(_DIGIT_ONLY_RE.match(t) or _FRAC_EXPR_RE.match(t))


def _is_fraction_token(text: str) -> bool:
    t = (text or "").strip()
    return bool(_FRAC_TOKEN_RE.match(t) or re.search(r"\d/\d", t))


def _is_div_op(text: str, *, loose: bool = False) -> bool:
    t = (text or "").strip()
    if _DIV_OP_RE.match(t):
        return True
    return bool(loose and _DIV_OP_LOOSE_RE.match(t))


def _is_vinculum(text: str) -> bool:
    t = (text or "").strip()
    return bool(_BAR_RE.match(t)) or t in {"/", "／", "⁄"}


def compose_stacked_fractions(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Rebuild textbook stacked fractions from Paddle boxes:
      3          →  3/4
      ─
      4
    Mixed numbers: 2 beside 1/6 → "2 1/6".
    """
    if len(lines) < 2:
        return lines

    unused = set(range(len(lines)))
    composed: list[dict[str, Any]] = []

    # Pair numerator (above) with denominator (below) when x-centers align.
    # Prefer shorter digit boxes as nums — tall full-height digits are usually
    # mixed-number wholes (1 beside 2/5), not numerators.
    candidates = [
        i
        for i, row in enumerate(lines)
        if i in unused and _is_fraction_digit(row.get("text") or "")
    ]
    candidates.sort(
        key=lambda i: (lines[i]["y1"] - lines[i]["y0"], lines[i]["y0"], lines[i]["x0"])
    )
    for i in candidates:
        if i not in unused or not _is_fraction_digit(lines[i].get("text") or ""):
            continue
        top = lines[i]
        top_h = max(1.0, top["y1"] - top["y0"])
        top_w = max(1.0, top["x1"] - top["x0"])
        top_cx = (top["x0"] + top["x1"]) / 2.0
        # Tall digit spanning a typical fraction stack → leave for mixed whole.
        nearby_h = [
            lines[j]["y1"] - lines[j]["y0"]
            for j in unused
            if j != i and _DIGIT_ONLY_RE.match((lines[j].get("text") or "").strip())
        ]
        if nearby_h and top_h > max(nearby_h) * 1.55:
            continue
        best_j: int | None = None
        best_score = 1e9
        for j, bot in enumerate(lines):
            if j == i or j not in unused or not _is_fraction_digit(bot.get("text") or ""):
                continue
            # Denominator must sit below numerator (allow tiny overlap).
            if bot["y0"] + 2 < top["y0"] + top_h * 0.35:
                continue
            gap = bot["y0"] - top["y1"]
            if gap > top_h * 2.8 or gap < -top_h * 0.35:
                continue
            bot_cx = (bot["x0"] + bot["x1"]) / 2.0
            bot_w = max(1.0, bot["x1"] - bot["x0"])
            if abs(top_cx - bot_cx) > max(18.0, top_w * 0.85, bot_w * 0.85):
                continue
            if max(top_w, bot_w) / min(top_w, bot_w) > 3.5:
                continue
            score = abs(top_cx - bot_cx) * 2.0 + abs(max(0.0, gap))
            if score < best_score:
                best_score = score
                best_j = j
        if best_j is None:
            continue

        bot = lines[best_j]
        num = (top.get("text") or "").strip()
        den = (bot.get("text") or "").strip()
        frac_y0, frac_y1 = top["y0"], bot["y1"]
        frac_x0, frac_x1 = min(top["x0"], bot["x0"]), max(top["x1"], bot["x1"])
        frac_cx = (frac_x0 + frac_x1) / 2.0

        # Drop vinculum / bar tokens between the pair (never eat digit wholes).
        for k, mid in enumerate(lines):
            if k not in unused or k in (i, best_j):
                continue
            mt = (mid.get("text") or "").strip()
            if _DIGIT_ONLY_RE.match(mt) or _is_fraction_token(mt):
                continue
            if not _is_vinculum(mt):
                # Very short horizontal junk OCR sometimes emits as lone chars
                if len(mt) > 2:
                    continue
            mid_cx = (mid["x0"] + mid["x1"]) / 2.0
            if abs(mid_cx - frac_cx) > max(28.0, (frac_x1 - frac_x0) * 1.2):
                continue
            if mid["y0"] >= frac_y0 - 2 and mid["y1"] <= frac_y1 + 2:
                unused.discard(k)

        # Mixed number: whole digit left of the stacked fraction.
        # Textbook wholes are often tall (full fraction height), so allow large
        # vertical overlap — not only a short digit centered on the bar.
        whole_k: int | None = None
        whole_txt = ""
        best_whole_score = 1e9
        frac_h = max(1.0, frac_y1 - frac_y0)
        for k, whole in enumerate(lines):
            if k not in unused or k in (i, best_j):
                continue
            wt = (whole.get("text") or "").strip()
            if not _DIGIT_ONLY_RE.match(wt):
                continue
            # Whole must horizontally sit just left of the fraction.
            if whole["x1"] > frac_x0 + 8:
                continue
            gap_x = frac_x0 - whole["x1"]
            if gap_x > max(42.0, top_w * 2.2):
                continue
            # Vertical: centers near, or tall whole overlaps the fraction band.
            wcy = (whole["y0"] + whole["y1"]) / 2.0
            fcy = (frac_y0 + frac_y1) / 2.0
            overlap = min(whole["y1"], frac_y1) - max(whole["y0"], frac_y0)
            tall_overlap = overlap >= frac_h * 0.35
            centered = abs(wcy - fcy) <= frac_h * 0.75
            if not (tall_overlap or centered):
                continue
            score = gap_x + abs(wcy - fcy) * 0.5
            if score < best_whole_score:
                best_whole_score = score
                whole_k = k
                whole_txt = wt

        text = f"{num}/{den}"
        x0 = frac_x0
        if whole_k is not None:
            text = f"{whole_txt} {text}"
            x0 = lines[whole_k]["x0"]
            unused.discard(whole_k)
        unused.discard(i)
        unused.discard(best_j)
        composed.append(
            {
                "text": text,
                "x0": x0,
                "y0": frac_y0,
                "x1": frac_x1,
                "y1": frac_y1,
            }
        )

    remaining = [lines[i] for i in sorted(unused)] + composed
    return sorted(remaining, key=lambda r: (r["y0"], r["x0"]))


def compose_fraction_division_ops(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Join left÷right fraction expressions from boxes:
      1 2/5   ÷   4/5   →  "1 2/5 ÷ 4/5"
    Also recovers when ÷ was misread as a lone dash/dot between two fractions.
    """
    if len(lines) < 2:
        return lines
    unused = set(range(len(lines)))
    composed: list[dict[str, Any]] = []

    for i, left in enumerate(lines):
        if i not in unused or not _is_fraction_token(left.get("text") or ""):
            continue
        left_cx = (left["x0"] + left["x1"]) / 2.0
        left_cy = (left["y0"] + left["y1"]) / 2.0
        left_h = max(1.0, left["y1"] - left["y0"])

        # Prefer an explicit ÷ (or loose OCR stand-in) just to the right of left.
        op_k: int | None = None
        op_score = 1e9
        for k, op in enumerate(lines):
            if k == i or k not in unused:
                continue
            if not _is_div_op(op.get("text") or "", loose=True):
                continue
            op_cy = (op["y0"] + op["y1"]) / 2.0
            if abs(op_cy - left_cy) > left_h * 0.85:
                continue
            if op["x0"] < left["x1"] - 4:
                continue
            gap = op["x0"] - left["x1"]
            if gap > 90:
                continue
            score = gap + abs(op_cy - left_cy)
            if score < op_score:
                op_score = score
                op_k = k

        right_k: int | None = None
        right_score = 1e9
        min_x = lines[op_k]["x1"] if op_k is not None else left["x1"]
        for j, right in enumerate(lines):
            if j == i or j == op_k or j not in unused:
                continue
            if not _is_fraction_token(right.get("text") or ""):
                continue
            # Avoid pairing a bare whole digit as the right operand when a frac exists.
            rt = (right.get("text") or "").strip()
            if _DIGIT_ONLY_RE.match(rt) and "/" not in rt:
                continue
            rcy = (right["y0"] + right["y1"]) / 2.0
            if abs(rcy - left_cy) > left_h * 0.9:
                continue
            if right["x0"] < min_x - 2:
                continue
            gap = right["x0"] - min_x
            if gap > 110:
                continue
            score = gap + abs(rcy - left_cy) * 2.0
            if score < right_score:
                right_score = score
                right_k = j

        if right_k is None:
            continue
        # Need either an op token or a tight left→right gap (÷ glyph dropped).
        if op_k is None:
            gap = lines[right_k]["x0"] - left["x1"]
            if gap > 70:
                continue

        left_t = (left.get("text") or "").strip()
        right_t = (lines[right_k].get("text") or "").strip()
        text = f"{left_t} ÷ {right_t}"
        x0 = left["x0"]
        x1 = lines[right_k]["x1"]
        y0 = min(left["y0"], lines[right_k]["y0"])
        y1 = max(left["y1"], lines[right_k]["y1"])
        unused.discard(i)
        unused.discard(right_k)
        if op_k is not None:
            unused.discard(op_k)
        composed.append({"text": text, "x0": x0, "y0": y0, "x1": x1, "y1": y1})

    remaining = [lines[i] for i in sorted(unused)] + composed
    return sorted(remaining, key=lambda r: (r["y0"], r["x0"]))


def cluster_reading_lines(
    lines: list[dict[str, Any]],
    y_tol: float = 14.0,
    *,
    divide_exercise: bool = False,
) -> list[str]:
    """Join same-band boxes left→right so fraction lists stay on one Example line."""
    if not lines:
        return []
    ordered = sorted(lines, key=lambda r: (r["y0"], r["x0"]))
    bands: list[list[dict[str, Any]]] = []
    for row in ordered:
        text = (row.get("text") or "").strip()
        if not text:
            continue
        placed = False
        for band in bands:
            ref = band[0]
            ref_cy = (ref["y0"] + ref["y1"]) / 2.0
            cy = (row["y0"] + row["y1"]) / 2.0
            if abs(cy - ref_cy) <= y_tol:
                band.append(row)
                placed = True
                break
        if not placed:
            bands.append([row])

    out: list[str] = []
    for band in bands:
        band.sort(key=lambda r: r["x0"])
        parts: list[str] = []
        for row in band:
            t = (row.get("text") or "").strip()
            if not t:
                continue
            if _is_div_op(t, loose=False):
                t = "÷"
            elif _is_div_op(t, loose=True) and parts and _is_fraction_token(parts[-1]):
                # Lone dash/dot after a fraction on a divide page → ÷
                t = "÷" if divide_exercise else t
            if (
                parts
                and _is_fraction_token(parts[-1])
                and _is_fraction_token(t)
                and not str(parts[-1]).endswith("÷")
                and t != "÷"
            ):
                if divide_exercise:
                    parts.append("÷")
                else:
                    # Math Flash Example lists keep commas between fractions.
                    parts[-1] = parts[-1].rstrip(",") + ","
            parts.append(t)
        line = " ".join(parts)
        line = re.sub(r"\s+,", ",", line)
        line = re.sub(r",\s*", ", ", line)
        line = re.sub(r"\s*÷\s*", " ÷ ", line)
        line = re.sub(r"[ \t]{2,}", " ", line).strip()
        if line:
            out.append(line)
    return out


def _normalize_fraction_digit_line(line: str) -> str:
    s = (line or "").strip()
    s = re.sub(r"(\d)'(\d)", r"\1 11 \2", s)
    s = re.sub(r"^'(\d)", r"11 \1", s)
    s = re.sub(r"(\d)'$", r"\1", s)
    s = s.replace("'", " ")
    s = re.sub(r"[^\d\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _split_digit_run(digits: str, count: int) -> list[str] | None:
    d = re.sub(r"\D", "", digits)
    if count < 2 or len(d) < count or len(d) > count * 2:
        return None
    preferred = {str(n) for n in range(10, 26)}
    parts: list[str] = []
    pos = 0
    for k in range(count):
        rem_parts = count - k
        rem_digits = len(d) - pos
        if rem_digits < rem_parts or rem_digits > rem_parts * 2:
            return None
        if rem_digits == rem_parts:
            parts.append(d[pos])
            pos += 1
            continue
        two = d[pos : pos + 2]
        take_two = (
            rem_digits == rem_parts * 2
            or two in preferred
            or rem_digits - 1 > rem_parts * 2 - 2
        )
        if take_two and pos + 2 <= len(d):
            parts.append(two)
            pos += 2
        else:
            parts.append(d[pos])
            pos += 1
    return parts if pos == len(d) else None


_PREFERRED_TWO_DIGIT = {str(n) for n in range(10, 26)}


def _parse_trailing_mixed(digits: str, dens: list[str]) -> list[str] | None:
    """whole + optional n/d for trailing dens; does not invent missing nums."""
    d = re.sub(r"\D", "", digits)
    if not dens or len(d) < len(dens):
        return None
    wholes = list(d[: len(dens)])
    leftover = d[len(dens) :]
    nums: list[str | None] = [None] * len(dens)
    li = len(leftover)
    for i in range(len(dens) - 1, -1, -1):
        if li <= 0:
            break
        if li >= 2 and leftover[li - 2 : li] in _PREFERRED_TWO_DIGIT:
            nums[i] = leftover[li - 2 : li]
            li -= 2
        else:
            nums[i] = leftover[li - 1 : li]
            li -= 1
    if li != 0:
        return None
    for i, den in enumerate(dens):
        if wholes[i] == "0" or nums[i] == "0":
            return None
        if nums[i] and f"{wholes[i]}{nums[i]}" in _PREFERRED_TWO_DIGIT:
            return None
    out: list[str] = []
    for i, den in enumerate(dens):
        if den == "0":
            continue
        if nums[i]:
            out.append(f"{wholes[i]} {nums[i]}/{den}")
        else:
            out.append(f"{wholes[i]}/{den}")
    return out or None


def _score_fraction_parts(parts: list[str]) -> int:
    score = len(parts) * 2
    for p in parts:
        mixed = re.fullmatch(r"(\d{1,2})\s+(\d{1,2})/(\d{1,2})", p)
        simple = re.fullmatch(r"(\d{1,2})/(\d{1,2})", p)
        if mixed:
            score += 8
            num, den = int(mixed.group(2)), int(mixed.group(3))
            if num == 0:
                score -= 20
            if f"{mixed.group(1)}{mixed.group(2)}" in _PREFERRED_TWO_DIGIT:
                score -= 15
            if num < den:
                score += 3
            if num <= 20 and den <= 25:
                score += 2
        elif simple:
            num, den = int(simple.group(1)), int(simple.group(2))
            if num == 0:
                score -= 20
            if num <= 25 and den <= 25:
                score += 2
            if simple.group(1) in _PREFERRED_TWO_DIGIT:
                score += 4
            if num >= 40:
                score -= 10
            if den > 0 and num > den * 3:
                score -= 2
    return score


def _pair_num_den_rows(num_glued: str, dens: list[str]) -> list[str] | None:
    d = re.sub(r"\D", "", num_glued)
    if len(dens) < 2 or len(d) < len(dens):
        return None
    best: list[str] | None = None
    best_score = -1
    simple_nums = _split_digit_run(d, len(dens))
    if simple_nums:
        parts = [f"{a}/{b}" for a, b in zip(simple_nums, dens) if b != "0"]
        score = _score_fraction_parts(parts)
        if score > best_score:
            best_score = score
            best = parts
    simple_absurd = bool(simple_nums and any(int(n) >= 40 for n in simple_nums))
    extras = len(d) - len(dens)
    if not (simple_absurd or (len(dens) >= 7 and extras >= 2)):
        return best if best and len(best) >= 2 else None
    max_mixed = min(4, len(dens) - 2)
    for mixed_count in range(1, max_mixed + 1):
        simple_count = len(dens) - mixed_count
        if simple_count < 2:
            continue
        min_sd = simple_count
        max_sd = min(len(d) - mixed_count, simple_count * 2)
        for sd in range(min_sd, max_sd + 1):
            head, tail = d[:sd], d[sd:]
            if len(tail) < mixed_count or len(tail) > mixed_count * 2:
                continue
            head_nums = _split_digit_run(head, simple_count)
            if not head_nums:
                continue
            mixed_parts = _parse_trailing_mixed(tail, dens[simple_count:])
            if not mixed_parts:
                continue
            parts = [f"{a}/{b}" for a, b in zip(head_nums, dens[:simple_count])] + mixed_parts
            score = _score_fraction_parts(parts) + 3
            if score > best_score:
                best_score = score
                best = parts
    return best if best and len(best) >= 2 else None


def reconstruct_glued_example_fractions(text: str) -> str:
    """Turn Example3869102792 + 4'457613' into Example: 3/4, 8/11, …"""
    if not text or not re.search(r"fraction|Example", text, re.I):
        return text
    lines = text.splitlines()
    out: list[str] = []
    used: set[int] = set()
    for i, raw in enumerate(lines):
        if i in used:
            continue
        m = re.match(r"^(Example)(\d{4,})$", raw.strip(), re.I)
        m2 = re.match(r"^(Example\s*[:.]?\s+)([\d\s]{4,})$", raw.strip(), re.I)
        if not m and not m2:
            out.append(raw)
            continue
        prefix = f"{m.group(1)}: " if m else m2.group(1)
        num_glued = (m.group(2) if m else m2.group(2)).replace(" ", "")
        den_chunks: list[str] = []
        den_idxs: list[int] = []
        for j in range(i + 1, min(i + 5, len(lines))):
            t = lines[j].strip()
            if not t:
                continue
            lead = re.match(r"^([\d'\s]{2,}?)(?:\s+(?:are|is|equivalent)\b.*)?$", t, re.I)
            lead2 = re.match(r"^((?:\d{1,3}[\s,]*){2,})\s+[a-z]", t, re.I)
            chunk = None
            if re.fullmatch(r"[\d'\s]{2,}", t) or re.fullmatch(r"\d{1,3}", t):
                chunk = _normalize_fraction_digit_line(t)
            elif lead and re.sub(r"\D", "", lead.group(1) or ""):
                chunk = _normalize_fraction_digit_line(lead.group(1))
            elif lead2:
                chunk = _normalize_fraction_digit_line(lead2.group(1))
            if chunk:
                den_chunks.append(chunk)
                den_idxs.append(j)
                for k in range(j + 1, min(j + 4, len(lines))):
                    nxt = lines[k].strip()
                    if not nxt:
                        continue
                    if re.fullmatch(r"\d{1,3}", nxt):
                        den_chunks.append(nxt)
                        den_idxs.append(k)
                        break
                    # skip brief prose between dens and a stray "11"
                    if len(nxt) < 48 and not re.match(r"^\d", nxt):
                        continue
                    break
                break
            if re.search(r"[a-z]{4,}", t, re.I) and den_chunks:
                break
            # skip short sidebar junk between num and den
            if len(t) < 48 and not re.match(r"^\d", t):
                continue
            if re.search(r"[a-z]{4,}", t, re.I):
                break
        if not den_chunks:
            out.append(raw)
            continue
        den_glued = re.sub(r"\D", "", " ".join(den_chunks))
        dens = None
        best_score = -1
        for c in range(min(12, len(den_glued)), 1, -1):
            cand = _split_digit_run(den_glued, c)
            if not cand:
                continue
            score = len(cand) * 2 + sum(5 for p in cand if p in _PREFERRED_TWO_DIGIT)
            if score > best_score:
                best_score = score
                dens = cand
        if not dens:
            out.append(raw)
            continue
        parts = _pair_num_den_rows(num_glued, dens)
        if not parts:
            out.append(raw)
            continue
        out.append(prefix + ", ".join(parts))
        used.update(den_idxs)
    return "\n".join(out).strip()


def _parse_glued_div(token: str) -> str:
    t = (token or "").strip()
    if not re.fullmatch(r"\d{2,4}", t) or len(t) <= 2:
        return t
    div, left = t[-1], t[:-1]
    if div in "23456789" and re.fullmatch(r"\d{1,2}", left):
        return f"{left}÷{div}"
    return t


def _align_dens(num_segs: list[str], den_segs: list[str]) -> list[str]:
    if len(den_segs) <= 1:
        return den_segs

    def left_val(seg: str) -> int:
        d = re.sub(r"\D", "", seg)
        if len(d) <= 2:
            return int(d or 0)
        return int(d[:-1] or 0)

    used: set[int] = set()
    out: list[str] = []
    for ns in num_segs:
        nleft = left_val(ns)
        best, best_score = -1, 10**9
        for i, ds in enumerate(den_segs):
            if i in used:
                continue
            dleft = left_val(ds)
            score = abs(dleft - nleft) + (20 if dleft < nleft else 0)
            if score < best_score:
                best_score, best = score, i
        if best >= 0:
            used.add(best)
            out.append(den_segs[best])
    for i, ds in enumerate(den_segs):
        if i not in used:
            out.append(ds)
    return out[: len(num_segs)]


def reconstruct_worked_div_fraction_chains(text: str) -> str:
    """General: glued dividend+divisor rows (÷ glyph dropped) → a÷b form."""
    if not text or not re.search(r"\d{2,4}\s*=\s*\d{1,4}", text):
        return text
    lines = text.splitlines()
    out: list[str] = []
    used: set[int] = set()
    for i, raw in enumerate(lines):
        if i in used:
            continue
        compact = re.sub(r"\s+", "", raw.strip())
        if not re.fullmatch(r"\d{2,4}(?:=\d{1,4}){1,4}", compact):
            out.append(raw)
            continue
        num_segs = [s for s in compact.split("=") if s]
        den_bits: list[str] = []
        den_idxs: list[int] = []
        for j in range(i + 1, min(i + 5, len(lines))):
            t = lines[j].strip()
            if (
                re.fullmatch(r"\d{1,6}", t)
                or re.fullmatch(r"\d{2,4}(?:\s+\d{1,4})+", t)
            ):
                den_bits.extend(re.findall(r"\d+", t))
                den_idxs.append(j)
                continue
            if den_bits:
                break
            if re.match(r"[a-z]", t, re.I):
                break
        if len(den_bits) == 1 and len(den_bits[0]) >= 5 and len(num_segs) == 2:
            g = den_bits[0]
            den_bits = [g[:-2], g[-2:]]
        if len(den_bits) < max(2, len(num_segs) - 1):
            out.append(raw)
            continue
        den_bits = _align_dens(num_segs, den_bits)
        steps_num: list[str] = []
        steps_den: list[str] = []
        for k, ns in enumerate(num_segs):
            ds = den_bits[k] if k < len(den_bits) else den_bits[-1]
            if k == len(num_segs) - 1 and len(ns) <= 2 and len(ds) <= 2:
                steps_num.append(ns)
                steps_den.append(ds)
            else:
                steps_num.append(_parse_glued_div(ns))
                steps_den.append(_parse_glued_div(ds))
        if not any("÷" in s for s in steps_num + steps_den):
            out.append(raw)
            continue
        # Emit slash-portable chain (stacked bars are restored in TS clean pass too).
        parts = [f"({a})/({b})" if "÷" in a or "÷" in b else f"{a}/{b}" for a, b in zip(steps_num, steps_den)]
        out.append(" = ".join(parts))
        used.update(den_idxs)
    return "\n".join(out).strip()


def text_from_lines_with_fractions(lines: list[dict[str, Any]]) -> str:
    composed = compose_stacked_fractions(lines)
    composed = compose_fraction_division_ops(composed)
    probe = " ".join((r.get("text") or "") for r in composed)
    divide_exercise = bool(
        re.search(r"\bdivide\b", probe, re.I)
        or len(re.findall(r"\b[a-n][.)]\b", probe, re.I)) >= 4
    )
    text = "\n".join(
        cluster_reading_lines(composed, divide_exercise=divide_exercise)
    ).strip()
    text = reconstruct_glued_example_fractions(text)
    return reconstruct_worked_div_fraction_chains(text)


def predict_structured(
    image_path: str,
    lang: str,
    *,
    _science_rec_attempted: bool = False,
) -> list[dict[str, Any]]:
    prepared = preprocess_for_ocr(image_path)
    engine = get_engine(lang, use_science_rec=not _science_rec_attempted)
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

    if not lines and _science_rec_model_dir() is not None:
        global _ENGINE, _ENGINE_KEY
        _ENGINE = None
        _ENGINE_KEY = None
        print(
            "[paddle_ocr_worker] science rec returned no lines; retrying stock English rec",
            file=sys.stderr,
        )
        return predict_structured(image_path, lang, _science_rec_attempted=True)

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
    return text_from_lines_with_fractions(lines)


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
        text = text_from_lines_with_fractions(lines)
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
                    "fractionComposed": True,
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
