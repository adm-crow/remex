"""Generate Remex Studio's brand artwork from one source of truth.

Outputs (relative to this script's directory):

  Desktop icons (consumed by Tauri/NSIS):
    icons/icon.png            1024x1024
    icons/32x32.png
    icons/64x64.png
    icons/128x128.png
    icons/128x128@2x.png      256x256
    icons/icon.ico            multi-size container (16/24/32/48/64/128/256)

  NSIS installer artwork (registered in tauri.conf.json bundle.windows.nsis):
    installer-sidebar.bmp     164x314  — Welcome / Finish pages
    installer-header.bmp      150x57   — all other installer pages

The logo geometry is rendered directly from the same quadratic Bézier path the
SVG uses (../logo.svg), so the colour gradient and shape stay in sync with
``logo.svg`` / ``studio/public/remex.svg``.

Run from anywhere — paths are resolved relative to this file:
  python studio/src-tauri/generate-installer-images.py
"""

import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_DIR   = Path(__file__).parent
ICONS_DIR = OUT_DIR / "icons"

# Brand colours — keep in sync with logo.svg / studio/public/remex.svg.
# These are the Settings → Appearance "Indigo" and "Teal" theme tokens
# (see THEME_OPTIONS in SettingsPane.tsx), so the logo gradient matches
# the user's default accent.
BRAND_START = (50, 74, 131)    # #324A83 (indigo, gradient start)
BRAND_END   = (0, 165, 134)    # #00A586 (teal,   gradient end)

BG_DARK     = (14, 18, 28)     # very dark indigo — installer sidebar background
WHITE       = (255, 255, 255)
GRAY_LIGHT  = (170, 175, 180)  # tagline grey on dark
TEXT_DARK   = (14, 18, 28)
TEXT_GRAY   = (100, 105, 110)


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
# Logo renderer
#
# SVG path (viewBox 0 0 8 16):
#   M0 0 Q0 8 8 8  Q8 0 0 0          ← top half
#   M0 8 Q8 8 8 16 Q0 16 0 8         ← bottom half (relative → absolute)
#
# Both shapes are filled with the brand gradient (BRAND_START → BRAND_END).
# ---------------------------------------------------------------------------

def _make_logo(pixel_height: int) -> Image.Image:
    """Return an RGBA image containing the Remex logo at the given height."""
    scale  = pixel_height / 16        # 16 SVG units → pixel_height px
    logo_w = round(8  * scale)
    logo_h = round(16 * scale)

    def s(lx, ly):
        return (lx * scale, ly * scale)

    # 8-bit alpha mask, antialias the shape boundaries via supersampling.
    # (Polygon fills are already aliased — for big sizes we render at 2x and
    # downsample with LANCZOS to get crisp edges.)
    ss = 2 if pixel_height < 256 else 1
    mask = Image.new("L", (logo_w * ss, logo_h * ss), 0)
    md   = ImageDraw.Draw(mask)

    def ss_pt(p):
        return (p[0] * ss, p[1] * ss)

    poly1 = [ss_pt(p) for p in (
        _qbez(s(0, 0), s(0, 8), s(8, 8)) +
        _qbez(s(8, 8), s(8, 0), s(0, 0))
    )]
    md.polygon(poly1, fill=255)

    poly2 = [ss_pt(p) for p in (
        _qbez(s(0, 8), s(8, 8),  s(8, 16)) +
        _qbez(s(8, 16), s(0, 16), s(0, 8))
    )]
    md.polygon(poly2, fill=255)

    if ss > 1:
        mask = mask.resize((logo_w, logo_h), Image.LANCZOS)

    # Diagonal gradient (matches the SVG linearGradient 0,0 → 100%,100%)
    gradient = Image.new("RGBA", (logo_w, logo_h))
    denom = max(1, logo_w + logo_h - 2)
    for row in range(logo_h):
        for col in range(logo_w):
            t     = (col + row) / denom
            color = _lerp(BRAND_START, BRAND_END, t) + (255,)
            gradient.putpixel((col, row), color)

    gradient.putalpha(mask)
    return gradient


def _make_square_icon(size: int, padding_pct: float = 0.10) -> Image.Image:
    """Square RGBA icon with the logo centred and ~10% padding.

    The logo is 8:16 (portrait), so on a square canvas it's height-constrained.
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad    = round(size * padding_pct)
    logo_h = size - 2 * pad
    logo   = _make_logo(logo_h)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


# ---------------------------------------------------------------------------
# Image builders — desktop icons
# ---------------------------------------------------------------------------

def make_app_icons():
    """Regenerate the icon set Tauri/NSIS ships on Windows."""
    ICONS_DIR.mkdir(exist_ok=True)

    # Render each size directly from SVG geometry — crisper than downsampling
    # one big rasterised source.
    sizes = {
        "icon.png":         1024,
        "128x128@2x.png":    256,
        "128x128.png":       128,
        "64x64.png":          64,
        "32x32.png":          32,
    }
    for fname, size in sizes.items():
        out = ICONS_DIR / fname
        _make_square_icon(size).save(out, format="PNG")
        print(f"  {out}")

    # Multi-size ICO — produced from the 256x256 master so all entries share
    # the same crisp source. Pillow downsamples per requested size.
    master   = _make_square_icon(256)
    ico_path = ICONS_DIR / "icon.ico"
    master.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"  {ico_path}")


# ---------------------------------------------------------------------------
# Image builders — NSIS installer artwork
# ---------------------------------------------------------------------------

def make_sidebar():
    """164x314 BMP — shown on Welcome and Finish installer pages."""
    W, H = 164, 314
    img  = Image.new("RGB", (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Brand gradient strip — left edge
    _gradient_strip(draw, 0, 0, 4, H, BRAND_START, BRAND_END)

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
    _gradient_strip(draw, 0, 0, 4, H, BRAND_START, BRAND_END)

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
    print("Generating Remex brand artwork...")
    make_app_icons()
    make_sidebar()
    make_header()
    print("Done.")
