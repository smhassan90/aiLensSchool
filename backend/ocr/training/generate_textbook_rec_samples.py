#!/usr/bin/env python3
"""
Generate recognition training crops that look like Pakistan/board textbook pages:
cream/parchment/blue/green washes + serif/sans formula lines containing λ, θ, π, √, …

Output (PaddleOCR rec format):
  ocr/training/data/train/images/*.png
  ocr/training/data/train/rec_gt.txt   # relative_path\\tlabel
  ocr/training/data/val/...

This is the training signal — not post-hoc wording replace in TypeScript.
"""

from __future__ import annotations

import argparse
import random
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"

# Formula / science lines the recognizer must learn to emit (not invent later).
LABELS = [
    "λ is the distance between two consecutive crests",
    "v = f × λ",
    "λ = 8.0 m",
    "mg sin θ",
    "mg cos θ",
    "small angle θ",
    "angular displacement θ",
    "T = 2π√(L/g)",
    "π ≅ 22/7",
    "π² ≅ 9.86",
    "f = 1/T",
    "a ∝ -x",
    "∞",
    "√(L/g)",
    "F = k q₁ q₂ / r²",
    "E = F / Q",
    "C = Q / V",
    "1.6 × 10⁻¹⁹ C",
    "8.85 × 10⁻¹² C²/N·m²",
    "q = n · e",
    "Like charges repel each other",
    "Opposite charges attract each other",
    "Electric charge is a scalar quantity",
    "wavelength λ and frequency f",
    "sin θ and cos θ",
    "θ = 0 at equilibrium",
    "μF",
    "ε₀",
]

# Heavy ÷ / √ practice — Paddle English often drops these (84 ÷ 4 = 21 → 844=21).
# Slash-form labels for stacked textbook fractions (3 over 4 → 3/4).
FRACTION_LABELS = [
    "3/4, 8/11, 6/4, 9/5, 10/7",
    "1/3, 2/3, 7/3, 8/3",
    "3/5, 7/9, 11/14, 8/13",
    "1/2 = 2/4 = 3/6 = 5/10",
    "2 1/6, 7 11/13, 9 2/11",
    "Example: 3/4, 8/11",
    "3/4",
    "8/11",
    "10/7",
    "11/14",
    "proper, improper, and mixed fractions",
    "like and unlike fractions",
    "equivalent fractions",
]


def random_fraction_labels(rng: random.Random, n: int = 80) -> list[str]:
    """Procedural ÷ / mixed / slash labels so the model learns patterns, not one page."""
    out: list[str] = []
    for _ in range(n):
        kind = rng.choice(["div_eq", "div_stack", "mixed", "mixed_sum", "slash", "reduce"])
        if kind == "div_eq":
            a, b = rng.randint(12, 96), rng.randint(2, 9)
            if a % b != 0:
                a = a - (a % b) or b * rng.randint(2, 12)
            out.append(f"{a} ÷ {b} = {a // b}")
        elif kind == "div_stack":
            num, den, d = rng.randint(12, 90), rng.randint(12, 90), rng.choice([2, 3, 4, 5])
            num = num - (num % d) or d * 6
            den = den - (den % d) or d * 8
            out.append(f"({num}÷{d})/({den}÷{d}) = {num // d}/{den // d}")
        elif kind == "mixed":
            w, n, den = rng.randint(1, 12), rng.randint(1, 9), rng.randint(2, 12)
            out.append(f"{w} {n}/{den}")
        elif kind == "mixed_sum":
            w1, n1, d1 = rng.randint(1, 9), rng.randint(1, 8), rng.randint(2, 10)
            w2, n2, d2 = rng.randint(1, 9), rng.randint(1, 8), rng.randint(2, 10)
            out.append(f"{w1} {n1}/{d1} + {w2} {n2}/{d2}")
        elif kind == "slash":
            out.append(f"{rng.randint(1, 15)}/{rng.randint(2, 20)}")
        else:
            n, d = rng.randint(10, 60), rng.randint(10, 60)
            out.append(f"Reduce {n}/{d} to the lowest term")
    return out

MATH_OP_LABELS = [
    "84 ÷ 4 = 21",
    "36 ÷ 6 = 6",
    "100 ÷ 5 = 20",
    "48 ÷ 8 = 6",
    "72 ÷ 9 = 8",
    "56 ÷ 7 = 8",
    "144 ÷ 12 = 12",
    "25 ÷ 5 = 5",
    "81 ÷ 9 = 9",
    "64 ÷ 8 = 8",
    "15 ÷ 3 = 5",
    "42 ÷ 6 = 7",
    "96 ÷ 4 = 24",
    "120 ÷ 10 = 12",
    "Let us check",
    "Let us check:",
    "√16 = 4",
    "√25 = 5",
    "√36 = 6",
    "√49 = 7",
    "√64 = 8",
    "√81 = 9",
    "√100 = 10",
    "√9 = 3",
    "√4 = 2",
    "√(16) = 4",
    "√(25) = 5",
    "√(L/g)",
    "T = 2π√(L/g)",
    "√a × √b = √(ab)",
    "√(a/b) = √a / √b",
    "find √144",
    "square root of 36 is 6",
    "84 ÷ 4",
    "divide 84 by 4",
    "a. 16495  b. 1703760  c. 704",
    "3. Which of these numbers is not divisible by 5?",
    # Inline slash form (stacked print → recognizer should emit this)
    "3/4",
    "8/11",
    "6/4",
    "9/5",
    "10/7",
    "2 1/6",
    "7 11/13",
    "9 2/11",
    "1/3",
    "2/3",
    "7/3",
    "8/3",
    "3/5",
    "7/9",
    "11/14",
    "8/13",
    "1/2 = 2/4 = 3/6 = 5/10",
    "Example: 3/4, 8/11, 6/4, 9/5, 10/7",
    "Example: 1/3, 2/3, 7/3, 8/3, 3/5, 7/9",
    "about proper, improper, and mixed fractions",
    "about like and unlike fractions",
    "are equivalent fractions",
]

# Textbook-like page washes (RGB)
BACKGROUNDS = [
    (245, 236, 214),  # cream parchment
    (252, 248, 235),  # light paper
    (232, 242, 248),  # pale blue sidebar page
    (235, 245, 235),  # pale green
    (250, 240, 230),  # warm tint
    (255, 255, 255),  # white
    (240, 230, 245),  # light lilac (some covers)
]


def pick_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/times.ttf",
        "C:/Windows/Fonts/timesbd.ttf",
        "C:/Windows/Fonts/georgia.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _parse_simple_fraction(label: str) -> tuple[str, str, str | None] | None:
    """Return (num, den, whole?) for labels like 3/4 or 2 1/6."""
    m = re.match(r"^(?:(\d{1,2})\s+)?(\d{1,3})/(\d{1,3})$", label.strip())
    if not m:
        return None
    return m.group(2), m.group(3), m.group(1)


def render_stacked_fraction(label: str, rng: random.Random) -> Image.Image | None:
    """Paint numerator / vinculum / denominator like a textbook, label stays 3/4."""
    parsed = _parse_simple_fraction(label)
    if not parsed:
        return None
    num, den, whole = parsed
    bg = rng.choice(BACKGROUNDS)
    w = rng.randint(120, 280)
    h = rng.randint(90, 130)
    im = Image.new("RGB", (w, h), bg)
    draw = ImageDraw.Draw(im)
    font = pick_font(rng.randint(22, 34))
    ink = (20, 20, 20)
    # optional whole number to the left
    x0 = 12
    if whole:
        draw.text((x0, h // 2 - 14), whole, fill=ink, font=font)
        wb = draw.textbbox((0, 0), whole, font=font)
        x0 += (wb[2] - wb[0]) + 6
    nb = draw.textbbox((0, 0), num, font=font)
    db = draw.textbbox((0, 0), den, font=font)
    fw = max(nb[2] - nb[0], db[2] - db[0], 18)
    draw.text((x0 + (fw - (nb[2] - nb[0])) // 2, 10), num, fill=ink, font=font)
    bar_y = 10 + (nb[3] - nb[1]) + 4
    draw.line((x0, bar_y, x0 + fw + 4, bar_y), fill=ink, width=2)
    draw.text((x0 + (fw - (db[2] - db[0])) // 2, bar_y + 6), den, fill=ink, font=font)
    if rng.random() < 0.3:
        im = im.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.2, 0.7)))
    return im


def render_line(label: str, rng: random.Random) -> Image.Image:
    # ~half of simple a/b labels are drawn stacked (as in Math Flash examples).
    if _parse_simple_fraction(label) and rng.random() < 0.55:
        stacked = render_stacked_fraction(label, rng)
        if stacked is not None:
            return stacked

    bg = rng.choice(BACKGROUNDS)
    # Slight noise wash
    w = rng.randint(420, 920)
    h = rng.randint(48, 88)
    im = Image.new("RGB", (w, h), bg)
    draw = ImageDraw.Draw(im)

    # Soft vignette / paper grain
    if rng.random() < 0.7:
        grain = Image.effect_noise((w, h), rng.uniform(8, 22)).convert("L")
        tint = Image.merge("RGB", (grain, grain, grain))
        im = Image.blend(im, tint, rng.uniform(0.04, 0.12))
        draw = ImageDraw.Draw(im)

    font = pick_font(rng.randint(22, 36))
    ink = rng.choice(
        [
            (20, 20, 20),
            (30, 40, 80),  # navy print
            (10, 10, 10),
            (40, 20, 20),
        ]
    )
    # Center-ish text
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = max(8, (w - tw) // 2 + rng.randint(-12, 12))
    y = max(4, (h - th) // 2 + rng.randint(-6, 6))
    draw.text((x, y), label, fill=ink, font=font)

    if rng.random() < 0.35:
        im = im.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.2, 0.9)))
    if rng.random() < 0.4:
        im = im.resize(
            (max(64, int(w * rng.uniform(0.85, 1.15))), max(32, int(h * rng.uniform(0.9, 1.1)))),
            Image.Resampling.LANCZOS,
        )
    return im


def pick_label(rng: random.Random, procedural: list[str] | None = None) -> str:
    roll = rng.random()
    # Heavy practice for symbols OCR drops on textbook pages.
    if roll < 0.22:
        return rng.choice(MATH_OP_LABELS)
    if roll < 0.38:
        return rng.choice(FRACTION_LABELS)
    if roll < 0.58 and procedural:
        return rng.choice(procedural)
    return rng.choice(LABELS)


def render_stacked_fraction_strip(rng: random.Random) -> tuple[Image.Image, str]:
    """Draw numerator / bar / denominator columns; label is slash or ÷ form."""
    mode = rng.choice(["simple", "div", "mixed"])
    bg = rng.choice(BACKGROUNDS)
    ink = (20, 20, 20)
    font = pick_font(rng.randint(18, 26))
    if mode == "mixed":
        whole, num, den = rng.choice([(4, 2, 5), (7, 1, 10), (11, 1, 2), (2, 1, 6), (9, 2, 11)])
        label = f"{whole} {num}/{den}"
        w, h = rng.randint(160, 220), rng.randint(90, 120)
        im = Image.new("RGB", (w, h), bg)
        draw = ImageDraw.Draw(im)
        wb = draw.textbbox((0, 0), str(whole), font=font)
        draw.text((12, (h - (wb[3] - wb[1])) // 2), str(whole), fill=ink, font=font)
        cx = 12 + (wb[2] - wb[0]) + 28
        for y, s in ((12, str(num)), (h // 2 + 8, str(den))):
            bb = draw.textbbox((0, 0), s, font=font)
            draw.text((cx - (bb[2] - bb[0]) // 2, y), s, fill=ink, font=font)
        draw.line((cx - 16, h // 2, cx + 16, h // 2), fill=ink, width=2)
        return im, label
    if mode == "div":
        d = rng.choice([2, 3, 4, 5])
        a = d * rng.randint(4, 20)
        b = d * rng.randint(4, 24)
        label = f"({a}÷{d})/({b}÷{d})"
        ns, ds = f"{a}÷{d}", f"{b}÷{d}"
        w, h = rng.randint(200, 280), rng.randint(90, 120)
        im = Image.new("RGB", (w, h), bg)
        draw = ImageDraw.Draw(im)
        for y, s in ((12, ns), (h // 2 + 8, ds)):
            bb = draw.textbbox((0, 0), s, font=font)
            draw.text(((w - (bb[2] - bb[0])) // 2, y), s, fill=ink, font=font)
        draw.line((40, h // 2, w - 40, h // 2), fill=ink, width=2)
        return im, label
    pairs = rng.sample(
        [(3, 4), (8, 11), (6, 4), (9, 5), (10, 7), (1, 3), (2, 3), (7, 9), (11, 14), (5, 10)],
        k=rng.randint(3, 5),
    )
    label = ", ".join(f"{a}/{b}" for a, b in pairs)
    col_w = rng.randint(52, 72)
    w = col_w * len(pairs) + 40
    h = rng.randint(90, 120)
    im = Image.new("RGB", (w, h), bg)
    draw = ImageDraw.Draw(im)
    for i, (num, den) in enumerate(pairs):
        cx = 20 + i * col_w + col_w // 2
        ns, ds = str(num), str(den)
        nb = draw.textbbox((0, 0), ns, font=font)
        db = draw.textbbox((0, 0), ds, font=font)
        draw.text((cx - (nb[2] - nb[0]) // 2, 12), ns, fill=ink, font=font)
        bar_w = max(nb[2] - nb[0], db[2] - db[0]) + 8
        y_bar = h // 2
        draw.line((cx - bar_w // 2, y_bar, cx + bar_w // 2, y_bar), fill=ink, width=2)
        draw.text((cx - (db[2] - db[0]) // 2, y_bar + 8), ds, fill=ink, font=font)
    return im, label


def write_split(split: str, n: int, seed: int) -> None:
    rng = random.Random(seed)
    img_dir = DATA / split / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    gt_path = DATA / split / "rec_gt.txt"
    procedural = random_fraction_labels(rng, n=max(60, n // 3))
    lines: list[str] = []
    for i in range(n):
        if rng.random() < 0.2:
            im, label = render_stacked_fraction_strip(rng)
        else:
            label = pick_label(rng, procedural)
            im = render_line(label, rng)
        name = f"{split}_{i:05d}.png"
        im.save(img_dir / name)
        # Paddle rec_gt uses path\tlabel (tab)
        rel = f"images/{name}"
        lines.append(f"{rel}\t{label}")
    gt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {n} samples -> {gt_path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=int, default=800)
    ap.add_argument("--val", type=int, default=120)
    ap.add_argument("--seed", type=int, default=14)
    args = ap.parse_args()
    write_split("train", args.train, args.seed)
    write_split("val", args.val, args.seed + 1)
    charset = ROOT / "science_charset.txt"
    print(f"Charset: {charset} ({len(charset.read_text(encoding='utf-8').splitlines())} chars)")
    print("Next: python ocr/training/train_science_rec.py")


if __name__ == "__main__":
    main()
