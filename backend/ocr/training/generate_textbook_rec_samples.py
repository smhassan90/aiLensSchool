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


def render_line(label: str, rng: random.Random) -> Image.Image:
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


def write_split(split: str, n: int, seed: int) -> None:
    rng = random.Random(seed)
    img_dir = DATA / split / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    gt_path = DATA / split / "rec_gt.txt"
    lines: list[str] = []
    for i in range(n):
        label = rng.choice(LABELS)
        # Duplicate with light punctuation variants
        if rng.random() < 0.15 and label.endswith("θ"):
            label = label  # keep
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
