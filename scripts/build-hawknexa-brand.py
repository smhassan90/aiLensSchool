#!/usr/bin/env python3
"""Build HawkNexa brand files from a single hawk mark so every hawk is identical."""

from __future__ import annotations

import collections
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/Users/smhassan.tahir/workspacePractice/sms")
SRC = Path(
    "/Users/smhassan.tahir/.cursor/projects/Users-smhassan-tahir-workspacePractice-sms/assets/hawknexa-mark.png"
)
ASSETS = Path(
    "/Users/smhassan.tahir/.cursor/projects/Users-smhassan-tahir-workspacePractice-sms/assets"
)
BRAND = ROOT / "portal" / "public" / "brand"
MOBILE = ROOT / "mobile" / "assets"

TEAL = (15, 118, 110, 255)  # #0f766e
AMBER = (217, 119, 6, 255)  # #d97706
WHITE = (255, 255, 255, 255)
TEAL_BG = (15, 118, 110, 255)

FONT_PATH = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"


def flood_white_to_alpha(im: Image.Image, tol: int = 26) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    queue: collections.deque[tuple[int, int]] = collections.deque()
    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))

    seen = set()

    def is_bg(c: tuple[int, int, int, int]) -> bool:
        r, g, b, _a = c
        return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or x < 0 or y < 0 or x >= w or y >= h:
            continue
        seen.add((x, y))
        if not is_bg(px[x, y]):
            continue
        r, g, b, _a = px[x, y]
        px[x, y] = (r, g, b, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def trim(im: Image.Image, pad: int = 12) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    left, top, right, bottom = bbox
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(im.width, right + pad)
    bottom = min(im.height, bottom + pad)
    return im.crop((left, top, right, bottom))


def fit_square(im: Image.Image, size: int, fill: tuple[int, int, int, int] = (0, 0, 0, 0), scale: float = 0.78) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), fill)
    target = int(size * scale)
    fitted = im.copy()
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    return canvas


def save_rgb(im: Image.Image, path: Path, bg: tuple[int, int, int, int] = WHITE) -> None:
    out = Image.new("RGBA", im.size, bg)
    out.alpha_composite(im)
    out.convert("RGB").save(path, "PNG", optimize=True)


def build_lockup(hawk: Image.Image) -> Image.Image:
    canvas_w, canvas_h = 1920, 1080
    canvas = Image.new("RGBA", (canvas_w, canvas_h), WHITE)

    hawk_h = 420
    ratio = hawk_h / hawk.height
    hawk_w = int(hawk.width * ratio)
    hawk_resized = hawk.resize((hawk_w, hawk_h), Image.Resampling.LANCZOS)

    font = ImageFont.truetype(FONT_PATH, 168)
    draw = ImageDraw.Draw(canvas)
    hawk_text = "Hawk"
    nexa_text = "Nexa"
    hawk_box = draw.textbbox((0, 0), hawk_text, font=font)
    nexa_box = draw.textbbox((0, 0), nexa_text, font=font)
    hawk_tw = hawk_box[2] - hawk_box[0]
    nexa_tw = nexa_box[2] - nexa_box[0]
    text_w = hawk_tw + nexa_tw
    text_h = max(hawk_box[3] - hawk_box[1], nexa_box[3] - nexa_box[1])

    gap = 56
    total_w = hawk_w + gap + text_w
    origin_x = (canvas_w - total_w) // 2
    origin_y = (canvas_h - hawk_h) // 2

    canvas.alpha_composite(hawk_resized, (origin_x, origin_y))

    text_x = origin_x + hawk_w + gap
    text_y = origin_y + (hawk_h - text_h) // 2 - hawk_box[1]
    draw.text((text_x, text_y), hawk_text, font=font, fill=TEAL)
    draw.text((text_x + hawk_tw, text_y), nexa_text, font=font, fill=AMBER)
    return canvas


def build_splash(hawk: Image.Image) -> Image.Image:
    size = 1284
    canvas = Image.new("RGBA", (size, size), TEAL_BG)
    plate = Image.new("RGBA", (420, 420), WHITE)
    # rounded plate
    mask = Image.new("L", (420, 420), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 419, 419), radius=72, fill=255)
    fitted = fit_square(hawk, 420, (255, 255, 255, 255), scale=0.72)
    plate = Image.composite(fitted, Image.new("RGBA", (420, 420), (0, 0, 0, 0)), mask)
    x = (size - 420) // 2
    y = (size - 420) // 2 - 40
    canvas.alpha_composite(plate, (x, y))

    font = ImageFont.truetype(FONT_PATH, 92)
    draw = ImageDraw.Draw(canvas)
    hawk_text, nexa_text = "Hawk", "Nexa"
    hawk_box = draw.textbbox((0, 0), hawk_text, font=font)
    nexa_box = draw.textbbox((0, 0), nexa_text, font=font)
    total = (hawk_box[2] - hawk_box[0]) + (nexa_box[2] - nexa_box[0])
    tx = (size - total) // 2
    ty = y + 420 + 36
    draw.text((tx, ty), hawk_text, font=font, fill=WHITE)
    draw.text((tx + hawk_box[2] - hawk_box[0], ty), nexa_text, font=font, fill=(251, 191, 36, 255))
    return canvas


def main() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    MOBILE.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)

    hawk = trim(flood_white_to_alpha(Image.open(SRC)), pad=8)
    hawk.save(BRAND / "hawk.png", "PNG")
    hawk.save(MOBILE / "hawk.png", "PNG")

    mark = fit_square(hawk, 1024, WHITE, scale=0.72)
    save_rgb(mark, BRAND / "icon.png")
    save_rgb(mark, ASSETS / "hawknexa-mark.png")
    save_rgb(mark, MOBILE / "icon.png")
    save_rgb(mark, MOBILE / "adaptive-icon.png")

    lockup = build_lockup(hawk)
    save_rgb(lockup, BRAND / "logo.png")
    save_rgb(lockup, ASSETS / "hawknexa-logo.png")

    fav = fit_square(hawk, 64, (0, 0, 0, 0), scale=0.92)
    fav.save(BRAND / "favicon.png", "PNG")
    fit_square(hawk, 48, (0, 0, 0, 0), scale=0.92).save(MOBILE / "favicon.png", "PNG")

    splash = build_splash(hawk)
    save_rgb(splash, MOBILE / "splash.png", TEAL_BG)

    print("hawk bbox", hawk.size)
    print("wrote", BRAND)
    print("wrote", MOBILE)
    print("wrote", ASSETS)


if __name__ == "__main__":
    main()
