"""
artlib.py — procedural plate painter for THE JAYHO CHRONICLES: ROOFTOP PROTOCOL

Every background in the game is a hand-authored *generator*, not a stock image.
Each scene is painted as three parallax plates (far / mid / near) at 2048x2731
RGB, then written as PNG. Everything is seamless in X so the game can scroll it
forever: elements that cross an edge are stamped three times (x-W, x, x+W).

The visual language is "cinematic silhouette": deep ink blacks, neon rim light,
amber sodium lamps, and a fine film grain baked into every plate.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Plate resolution is a build-time knob: 2048 is the standard profile, 2731
# (about 2.4x the pixels) is the "max" profile used for the large APK build.
import os as _os
W = int(_os.environ.get("PLATE_W", "2048"))
H = int(round(W * 2731 / 2048))

INK      = (5, 7, 12)
INK_2    = (10, 14, 22)
INDIGO   = (18, 22, 46)
VIOLET   = (42, 24, 66)
PLUM     = (92, 38, 66)
RUST     = (168, 66, 42)
AMBER    = (255, 179, 71)
GOLD     = (255, 201, 107)
CYAN     = (34, 225, 255)
MAGENTA  = (255, 79, 216)
EMBER    = (255, 107, 53)
MINT     = (80, 240, 190)
WARM_WIN = (255, 196, 120)

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]


def font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# ----------------------------------------------------------------- primitives
def canvas(color=INK):
    return np.zeros((H, W, 3), np.float32) + (np.array(color, np.float32) / 255.0)


def vgrad(stops, jitter=0.0, seed=0):
    """Vertical gradient from [(pos0..1, (r,g,b)), ...]."""
    ys = np.linspace(0.0, 1.0, H, dtype=np.float32)
    pos = np.array([s[0] for s in stops], np.float32)
    cols = np.array([s[1] for s in stops], np.float32) / 255.0
    col = np.empty((H, 3), np.float32)
    for c in range(3):
        col[:, c] = np.interp(ys, pos, cols[:, c])
    out = np.repeat(col[:, None, :], W, axis=1)
    if jitter > 0:
        rng = np.random.default_rng(seed)
        out += (rng.standard_normal((H, W, 1)).astype(np.float32) * jitter)
    return out


def add_glow(arr, cx, cy, radius, color, power=1.0, falloff=2.2):
    """Additive radial light. Operates only on the bounding box."""
    x0 = max(0, int(cx - radius)); x1 = min(W, int(cx + radius))
    y0 = max(0, int(cy - radius)); y1 = min(H, int(cy + radius))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    g = np.clip(1.0 - d, 0.0, 1.0) ** falloff
    arr[y0:y1, x0:x1] += g[..., None] * (np.array(color, np.float32) / 255.0) * power


def add_grain(arr, amount=0.022, seed=7):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((H, W, 1)).astype(np.float32)
    arr += n * amount


def add_vignette(arr, strength=0.55, power=2.0):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (xx - W / 2) / (W / 2)
    dy = (yy - H / 2) / (H / 2)
    d = np.sqrt(dx * dx + dy * dy) / 1.414
    arr *= (1.0 - strength * np.clip(d, 0, 1) ** power)[..., None]


def add_stars(arr, count=2600, seed=3, top=0.0, bottom=0.75, glow=0.9):
    rng = np.random.default_rng(seed)
    n = count
    xs = rng.integers(0, W, n)
    ys = (rng.power(1.5, n) * (bottom - top) + top) * H
    ys = np.clip(ys, 0, H - 1).astype(int)
    mag = rng.power(2.4, n)
    cols = np.array([1.0, 0.98, 0.94], np.float32)
    for i in range(n):
        x, y = int(xs[i]), int(ys[i])
        r = 1.0 + mag[i] * 3.0
        c = cols * (0.35 + mag[i])
        tint = rng.random()
        if tint < 0.18:
            c = c * np.array([0.55, 0.95, 1.15], np.float32)
        elif tint < 0.30:
            c = c * np.array([1.15, 0.95, 0.62], np.float32)
        _splat(arr, x, y, r, c, glow)


def _splat(arr, x, y, r, color, glow=0.9):
    ri = int(r * 3 + 2)
    x0 = max(0, x - ri); x1 = min(W, x + ri)
    y0 = max(0, y - ri); y1 = min(H, y + ri)
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
    core = np.clip(1.0 - d / max(r, 0.8), 0, 1) ** 1.2
    halo = np.clip(1.0 - d / (r * 3.2), 0, 1) ** 3.0
    arr[y0:y1, x0:x1] += (core[..., None] + halo[..., None] * glow * 0.55) * color


def pil_layer():
    """Return (PIL RGB image, draw handle) over a black canvas."""
    img = Image.new("RGB", (W, H), (0, 0, 0))
    return img, ImageDraw.Draw(img)


def composite(base, img, alpha=1.0):
    """Screen-composite a PIL layer (drawn on black) onto a float canvas."""
    a = np.asarray(img, np.float32) / 255.0
    return base + a * alpha


def fog_band(arr, y, height, color=(180, 160, 200), power=0.16):
    y0 = max(0, int(y - height)); y1 = min(H, int(y + height))
    ys = np.linspace(-1, 1, y1 - y0, dtype=np.float32)
    prof = np.exp(-(ys ** 2) * 3.0)[:, None, None]
    arr[y0:y1] += prof * (np.array(color, np.float32) / 255.0) * power


def wrap_rect(d, x, y, w, h, fill):
    for dx in (-W, 0, W):
        d.rectangle([x + dx, y, x + dx + w, y + h], fill=fill)


def wrap_poly(d, pts, fill):
    for dx in (-W, 0, W):
        d.polygon([(p[0] + dx, p[1]) for p in pts], fill=fill)


def wrap_line(d, pts, fill, width=2):
    for dx in (-W, 0, W):
        d.line([(p[0] + dx, p[1]) for p in pts], fill=fill, width=width)


# ------------------------------------------------------------------ elements
def buildings(d, rng, base_y, count, hmin, hmax, wmin, wmax, body, lit_chance=0.35,
              win_w=9, win_h=14, gap_x=6, gap_y=10, win_cols=(WARM_WIN, (255, 225, 180)),
              cool_chance=0.18):
    """A row of facades with window grids, drawn seamless in X."""
    x = 0
    while x < W:
        bw = int(rng.integers(wmin, wmax))
        bh = int(rng.integers(hmin, hmax))
        top = base_y - bh
        wrap_rect(d, x, top, bw, bh + 4, body)
        # parapet lip
        wrap_rect(d, x - 2, top, bw + 4, 8, _shade(body, 1.25))
        # windows
        gx = x + gap_x
        while gx + win_w < x + bw - gap_x:
            gy = top + 18
            while gy + win_h < base_y - 14:
                lit = rng.random()
                if lit < lit_chance:
                    c = win_cols[0] if rng.random() > cool_chance else (150, 220, 255)
                    c = _shade(c, 0.7 + rng.random() * 0.6)
                    wrap_rect(d, gx, gy, win_w, win_h, c)
                else:
                    wrap_rect(d, gx, gy, win_w, win_h, _shade(body, 0.55))
                gy += win_h + gap_y
            gx += win_w + gap_x
        x += bw + int(rng.integers(2, 14))
    return x


def _shade(c, k):
    return tuple(int(np.clip(v * k, 0, 255)) for v in c)


def wires(d, rng, y, count=5, sag=40, color=(8, 8, 12)):
    for _ in range(count):
        y0 = y + int(rng.integers(-60, 120))
        x0 = int(rng.integers(-200, W))
        span = int(rng.integers(W * 0.4, W * 1.1))
        pts = []
        for i in range(0, span, 24):
            t = i / span
            pts.append((x0 + i, y0 + int(np.sin(t * np.pi) * sag * (0.6 + rng.random()))))
        if len(pts) > 1:
            wrap_line(d, pts, color, width=int(rng.integers(2, 5)))


def antenna(d, x, base_y, h, color=(6, 7, 10)):
    wrap_line(d, [(x, base_y), (x, base_y - h)], color, 3)
    for i in range(4):
        yy = base_y - h * (0.35 + i * 0.17)
        wrap_line(d, [(x - 22 - i * 6, yy), (x + 22 + i * 6, yy)], color, 2)


def water_tank(d, x, base_y, w, h, body=(14, 16, 22)):
    wrap_rect(d, x, base_y - h, w, h, body)
    wrap_rect(d, x - 4, base_y - h - 8, w + 8, 10, _shade(body, 1.4))
    for i in range(3):
        wrap_line(d, [(x + 6 + i * w / 3, base_y - h + 10), (x + 6 + i * w / 3, base_y - 4)], _shade(body, 0.7), 2)


def bricks(arr, y0, y1, base=(52, 30, 28), mortar=(24, 16, 16), seed=11, bw=64, bh=26):
    """Brick wall band with per-brick colour variation and grime."""
    rng = np.random.default_rng(seed)
    region = np.zeros((y1 - y0, W, 3), np.float32)
    region += np.array(mortar, np.float32) / 255.0
    rows = (y1 - y0) // bh + 1
    for r in range(rows):
        off = (bw // 2) if r % 2 else 0
        yy = r * bh
        for c in range(-1, W // bw + 2):
            x = c * bw + off
            k = 0.72 + rng.random() * 0.62
            col = np.array(base, np.float32) / 255.0 * k
            col += (rng.standard_normal(3).astype(np.float32) * 0.02)
            xa = max(0, x + 2); xb = min(W, x + bw - 2)
            ya = max(0, yy + 2); yb = min(y1 - y0, yy + bh - 2)
            if xb > xa and yb > ya:
                region[ya:yb, xa:xb] = np.clip(col, 0, 1)
    # grime blotches
    for _ in range(220):
        cx = rng.integers(0, W); cy = rng.integers(0, y1 - y0)
        rad = rng.integers(20, 130)
        yy, xx = np.mgrid[max(0, cy - rad):min(y1 - y0, cy + rad), max(0, cx - rad):min(W, cx + rad)]
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / rad
        m = np.clip(1 - d, 0, 1) ** 2 * 0.30
        region[max(0, cy - rad):min(y1 - y0, cy + rad), max(0, cx - rad):min(W, cx + rad)] *= (1 - m[..., None])
    arr[y0:y1] = arr[y0:y1] * 0.15 + region * 0.85


def asphalt(arr, y0, y1, base=(16, 16, 20), seed=5):
    rng = np.random.default_rng(seed)
    band = np.zeros((y1 - y0, W, 3), np.float32) + np.array(base, np.float32) / 255.0
    n = rng.standard_normal((y1 - y0, W, 1)).astype(np.float32)
    band += n * 0.035
    # wet reflection streaks
    for _ in range(26):
        cx = rng.integers(0, W); w = rng.integers(40, 220)
        col = np.array([0.10, 0.16, 0.22], np.float32) * (0.5 + rng.random())
        xa = max(0, cx - w // 2); xb = min(W, cx + w // 2)
        prof = np.linspace(1, 0.2, y1 - y0, dtype=np.float32)[:, None, None]
        band[:, xa:xb] += col * prof * 0.35
    arr[y0:y1] = band


def save(arr, path, grain=0.020, vignette=0.5):
    add_grain(arr, grain)
    if vignette:
        add_vignette(arr, vignette)
    out = np.clip(arr, 0, 1)
    img = Image.fromarray((out * 255).astype(np.uint8), "RGB")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", compress_level=6, optimize=False)
    return os.path.getsize(path)
