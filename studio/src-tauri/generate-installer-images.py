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

# Brand colours
BRAND_GREEN = (28, 172, 120)    # #1CAC78
BRAND_LIME  = (126, 189, 1)     # #7EBD01
BG_DARK     = (13, 22, 15)
WHITE       = (255, 255, 255)
GRAY_LIGHT  = (160, 170, 162)
TEXT_DARK   = (13, 22, 15)
TEXT_GRAY   = (100, 110, 105)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def _qbez(p0, p1, p2, steps=120):
    """Sample `steps` points on the quadratic Bézier p0→p1→p2."""
    pts = []
    for i in range(steps + 1):
        t  = i / steps
        mt = 1 - t
        x  = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
        y  = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def _gradient_strip(draw, x0, y0, x1, height, c_top, c_bot):
    for y in range(height):
        draw.line([(x0, y0 + y), (x1, y0 + y)], fill=_lerp(c_top, c_bot, y / height))


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
    return None


# ---------------------------------------------------------------------------
# Actual Remex logo renderer
#
# SVG path (viewBox 0 0 8 16):
#   M0 0 Q0 8 8 8  Q8 0 0 0          ← shape 1, top half
#   M0 8 Q8 8 8 16 Q0 16 0 8         ← shape 2, bottom half (relative → absolute)
#
# Both shapes are filled with the brand gradient (#1CAC78 → #7EBD01).
# ---------------------------------------------------------------------------

def _make_logo(pixel_height: int) -> Image.Image:
    """Return an RGBA image containing the Remex logo at the given height."""
    scale     = pixel_height / 16          # 16 SVG units → pixel_height px
    logo_w    = round(8  * scale)
    logo_h    = round(16 * scale)

    def s(lx, ly):
        return (lx * scale, ly * scale)

    # --- build a 1-bit mask for each shape via polygon ---
    mask = Image.new("L", (logo_w, logo_h), 0)
    md   = ImageDraw.Draw(mask)

    # Shape 1: M(0,0) Q(0,8)(8,8) Q(8,0)(0,0)
    poly1 = (
        _qbez(s(0,0), s(0,8), s(8,8)) +
        _qbez(s(8,8), s(8,0), s(0,0))
    )
    md.polygon(poly1, fill=255)

    # Shape 2 (absolute coords): M(0,8) Q(8,8)(8,16) Q(0,16)(0,8)
    poly2 = (
        _qbez(s(0,8), s(8,8),  s(8,16)) +
        _qbez(s(8,16), s(0,16), s(0,8))
    )
    md.polygon(poly2, fill=255)

    # --- diagonal gradient (matches the SVG linearGradient 0%→100%) ---
    gradient = Image.new("RGBA", (logo_w, logo_h))
    gd       = ImageDraw.Draw(gradient)
    for row in range(logo_h):
        for col in range(logo_w):
            t     = (col + row) / (logo_w + logo_h - 2) if (logo_w + logo_h) > 2 else 0
            color = _lerp(BRAND_GREEN, BRAND_LIME, t) + (255,)
            gradient.putpixel((col, row), color)

    # Apply the shape mask as the alpha channel
    gradient.putalpha(mask)
    return gradient


# ---------------------------------------------------------------------------
# Image builders
# ---------------------------------------------------------------------------

def make_sidebar():
    """164x314 BMP — shown on Welcome and Finish installer pages."""
    W, H = 164, 314
    img  = Image.new("RGB", (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Brand gradient strip — left edge
    _gradient_strip(draw, 0, 0, 4, H, BRAND_GREEN, BRAND_LIME)

    # Remex logo — centred horizontally, upper third of the image
    logo_h  = 72                        # px tall — 16 SVG units
    logo    = _make_logo(logo_h)
    logo_x  = (W - logo.width)  // 2
    logo_y  = H // 5
    img.paste(logo, (logo_x, logo_y), logo)

    # Text
    font_title = _try_font(17, bold=True)
    font_sub   = _try_font(9)

    ty = logo_y + logo_h + 18

    title = "Remex Studio"
    tag   = "Your files. Searchable with AI."

    if font_title:
        bbox = draw.textbbox((0, 0), title, font=font_title)
        tw   = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, ty), title, font=font_title, fill=WHITE)
        ty  += bbox[3] - bbox[1] + 8
    else:
        draw.text((20, ty), title, fill=WHITE)
        ty += 22

    if font_sub:
        bbox = draw.textbbox((0, 0), tag, font=font_sub)
        tw   = bbox[2] - bbox[0]
        draw.text(((W - tw) // 2, ty), tag, font=font_sub, fill=GRAY_LIGHT)
    else:
        draw.text((20, ty), tag, fill=GRAY_LIGHT)

    out = OUT_DIR / "installer-sidebar.bmp"
    img.save(out, format="BMP")
    print(f"  {out}")


def make_header():
    """150x57 BMP — shown at the top of all other installer pages."""
    W, H = 150, 57
    img  = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)

    # Brand gradient strip — left edge
    _gradient_strip(draw, 0, 0, 4, H, BRAND_GREEN, BRAND_LIME)

    # Remex logo — left side, vertically centred
    logo_h = 36
    logo   = _make_logo(logo_h)
    logo_x = 12
    logo_y = (H - logo.height) // 2
    img.paste(logo, (logo_x, logo_y), logo)

    # Text — right of logo
    font_title = _try_font(13, bold=True)
    font_sub   = _try_font(8)
    x_text = logo_x + logo.width + 10

    if font_title:
        draw.text((x_text, 11), "Remex Studio", font=font_title, fill=TEXT_DARK)
    else:
        draw.text((x_text, 11), "Remex Studio", fill=TEXT_DARK)

    if font_sub:
        draw.text((x_text, 35), "Your files. Searchable with AI.", font=font_sub, fill=TEXT_GRAY)
    else:
        draw.text((x_text, 35), "Your files. Searchable with AI.", fill=TEXT_GRAY)

    out = OUT_DIR / "installer-header.bmp"
    img.save(out, format="BMP")
    print(f"  {out}")


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Generating installer images...")
    make_sidebar()
    make_header()
    print("Done.")
