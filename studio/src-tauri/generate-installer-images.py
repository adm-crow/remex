"""Generate NSIS installer BMP images for Remex Studio.

Outputs:
  installer-sidebar.bmp  164x314  — Welcome / Finish pages
  installer-header.bmp   150x57   — all other installer pages

Run from the repo root:
  python studio/src-tauri/generate-installer-images.py
"""

import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).parent

BRAND_GREEN  = (28, 172, 120)   # #1CAC78
BRAND_LIME   = (126, 189, 1)    # #7EBD01
BG_DARK      = (13, 22, 15)
WHITE        = (255, 255, 255)
GRAY_LIGHT   = (160, 170, 162)
TEXT_DARK    = (13, 22, 15)
TEXT_GRAY    = (100, 110, 105)


def _lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _gradient_strip(draw, x0, y0, x1, height, c_top, c_bot):
    for y in range(height):
        draw.line([(x0, y0 + y), (x1, y0 + y)], fill=_lerp_color(c_top, c_bot, y / height))


def _try_font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans{}.ttf".format("-Bold" if bold else ""),
        "/usr/share/fonts/truetype/liberation/LiberationSans{}-Regular.ttf".format("-Bold" if bold else ""),
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return None  # caller falls back to default


def _draw_logo(draw, cx, cy, unit, color_top, color_bot):
    """Draw a simplified two-arc Remex logo centred at (cx, cy).

    The original SVG is two quarter-circle arcs stacked vertically.
    We approximate them with thick arcs using PIL's arc().
    """
    r = unit
    w = max(2, unit // 3)
    # top arc: top-right quarter of a circle whose centre is at (cx, cy)
    top_box = [cx - r, cy - r, cx + r, cy]
    draw.arc(top_box,   start=-90, end=0,   fill=color_top, width=w)
    # bottom arc: bottom-left quarter, offset one unit down
    bot_box = [cx - r, cy,       cx + r, cy + r]
    draw.arc(bot_box,   start=90,  end=180, fill=color_bot, width=w)


def make_sidebar():
    """164x314 BMP — shown on Welcome and Finish installer pages."""
    W, H = 164, 314
    img  = Image.new("RGB", (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Brand gradient strip on the left edge
    _gradient_strip(draw, 0, 0, 4, H, BRAND_GREEN, BRAND_LIME)

    # Logo (two arcs, centred horizontally, upper third of the image)
    unit = 22
    _draw_logo(draw, W // 2, H // 4, unit, BRAND_GREEN, BRAND_LIME)

    # Product name
    font_title = _try_font(18, bold=True)
    font_sub   = _try_font(9)

    title = "Remex Studio"
    tag   = "Your files. Searchable with AI."

    if font_title:
        bbox = draw.textbbox((0, 0), title, font=font_title)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, H // 4 + unit + 18), title, font=font_title, fill=WHITE)
    else:
        draw.text((20, H // 4 + unit + 18), title, fill=WHITE)

    if font_sub:
        bbox = draw.textbbox((0, 0), tag, font=font_sub)
        tw = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, H // 4 + unit + 44), tag, font=font_sub, fill=GRAY_LIGHT)
    else:
        draw.text((20, H // 4 + unit + 44), tag, fill=GRAY_LIGHT)

    out = OUT_DIR / "installer-sidebar.bmp"
    img.save(out, format="BMP")
    print(f"  {out}")


def make_header():
    """150x57 BMP — shown at the top of all other installer pages."""
    W, H = 150, 57
    img  = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)

    # Brand gradient strip on the left edge
    _gradient_strip(draw, 0, 0, 4, H, BRAND_GREEN, BRAND_LIME)

    # Logo (small, left-aligned)
    unit = 10
    _draw_logo(draw, 18, H // 2, unit, BRAND_GREEN, BRAND_LIME)

    # Product name + tagline
    font_title = _try_font(13, bold=True)
    font_sub   = _try_font(8)
    x_text = 18 + unit + 10

    if font_title:
        draw.text((x_text, 10), "Remex Studio", font=font_title, fill=TEXT_DARK)
    else:
        draw.text((x_text, 10), "Remex Studio", fill=TEXT_DARK)

    if font_sub:
        draw.text((x_text, 34), "Your files. Searchable with AI.", font=font_sub, fill=TEXT_GRAY)
    else:
        draw.text((x_text, 34), "Your files. Searchable with AI.", fill=TEXT_GRAY)

    out = OUT_DIR / "installer-header.bmp"
    img.save(out, format="BMP")
    print(f"  {out}")


if __name__ == "__main__":
    try:
        from PIL import Image, ImageDraw, ImageFont  # noqa: F811
    except ImportError:
        print("Pillow not installed. Run: pip install pillow", file=sys.stderr)
        sys.exit(1)

    print("Generating installer images...")
    make_sidebar()
    make_header()
    print("Done.")
