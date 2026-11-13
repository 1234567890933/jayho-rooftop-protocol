"""
gen_extras.py — the second art pass: atmosphere, foregrounds, act cards.

usage: python3 gen_extras.py atmo|fg|cards|all

Adds, per scene:
  <scene>_atmo.png  additive light shafts / haze / dust — drawn with 'lighter'
  <scene>_fg.png    a dark foreground silhouette that passes in front of play

Plus five act cards (1080x1920) used behind the ACT I..V title cards.
"""
import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import artlib as A
from artlib import W, H

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "art")


def layer():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def to_np(img):
    return np.asarray(img, np.float32) / 255.0


def glow(arr, cx, cy, radius, color, power=1.0, falloff=2.2, alpha=0.8):
    x0 = max(0, int(cx - radius)); x1 = min(W, int(cx + radius))
    y0 = max(0, int(cy - radius)); y1 = min(H, int(cy + radius))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    g = np.clip(1.0 - d, 0.0, 1.0) ** falloff
    arr[y0:y1, x0:x1, :3] += g[..., None] * (np.array(color, np.float32) / 255.0) * power
    arr[y0:y1, x0:x1, 3] = np.clip(arr[y0:y1, x0:x1, 3] + g * alpha, 0, 1)


def finish(arr, name, grain=0.004, seed=1):
    rng = np.random.default_rng(seed)
    arr[:, :, :3] += rng.standard_normal((H, W, 1)).astype(np.float32) * grain
    out = np.clip(arr, 0, 1)
    p = os.path.join(OUT, name)
    Image.fromarray((out * 255).astype(np.uint8), "RGBA").save(p, "PNG", compress_level=6)
    return os.path.getsize(p)


def soft_tile(w, h, color, blur):
    t = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    d.ellipse([0, 0, w - 1, h - 1], fill=color)
    return t.filter(ImageFilter.GaussianBlur(blur))


# --------------------------------------------------------------------- ATMO
SCENE_MOOD = {
    "lane":   {"warm": (255, 176, 96), "cool": (60, 180, 220), "shafts": 5, "dust": 260, "fog": (255, 170, 110)},
    "stairs": {"warm": (255, 200, 130), "cool": (90, 130, 220), "shafts": 3, "dust": 180, "fog": (150, 160, 210)},
    "dusk":   {"warm": (255, 170, 100), "cool": (150, 90, 190), "shafts": 7, "dust": 220, "fog": (255, 160, 110)},
    "night":  {"warm": (255, 200, 130), "cool": (70, 150, 220), "shafts": 2, "dust": 300, "fog": (90, 130, 200)},
    "sky":    {"warm": (255, 220, 160), "cool": (110, 90, 200), "shafts": 4, "dust": 420, "fog": (110, 100, 190)},
}


def atmo(scene):
    mood = SCENE_MOOD[scene]
    rng = np.random.default_rng(hash(scene) % 9999)
    img, d = layer()

    # light shafts: long, soft, angled
    for i in range(mood["shafts"]):
        x = int(rng.integers(0, W))
        w = int(rng.integers(120, 340))
        length = int(H * rng.uniform(0.6, 1.15))
        col = mood["warm"] if i % 2 == 0 else mood["cool"]
        alpha = int(rng.integers(12, 30))
        poly = [(x, -60), (x + w, -60), (x + w + int(w * 0.8), length), (x - int(w * 0.4), length)]
        d.polygon(poly, fill=col + (alpha,))
    img = img.filter(ImageFilter.GaussianBlur(38))
    arr = to_np(img)

    # fog pools near the ground
    for i in range(9):
        cx = rng.integers(0, W); cy = rng.integers(int(H * 0.45), int(H * 1.02))
        glow(arr, cx, cy, rng.integers(300, 700), mood["fog"],
             float(rng.uniform(0.05, 0.13)), 2.6, 0.35)

    # suspended dust, the thing that makes a still frame feel alive
    for i in range(mood["dust"]):
        x = rng.integers(0, W); y = rng.integers(0, H)
        r = float(rng.uniform(1.5, 4.5))
        c = mood["warm"] if rng.random() < 0.6 else mood["cool"]
        glow(arr, x, y, r * 6, c, float(rng.uniform(0.10, 0.4)), 2.0, 0.5)

    # a few lens ghosts in the upper third
    for i in range(3):
        glow(arr, rng.integers(0, W), rng.integers(0, int(H * 0.4)),
             rng.integers(90, 220), mood["cool"], 0.10, 3.0, 0.25)

    return finish(arr, f"{scene}_atmo.png", 0.003, 3)


# --------------------------------------------------------------- FOREGROUND
def fg(scene):
    rng = np.random.default_rng((hash(scene) + 7) % 9999)
    img, d = layer()
    ink = (4, 5, 9, 255)

    if scene in ("lane", "stairs"):
        # a dark pillar/lamp on the left edge and cables across the top
        d.rectangle([-30, 0, int(W * 0.055), H], fill=ink)
        d.rectangle([int(W * 0.055) - 8, 0, int(W * 0.055), H], fill=(10, 10, 14, 255))
        for i in range(3):
            y = int(H * (0.10 + i * 0.05))
            d.line([(-40, y), (W + 40, y + int(rng.integers(-60, 60)))], fill=(6, 6, 10, 255),
                   width=int(rng.integers(4, 9)))
        # bottom shadow band
        d.rectangle([0, int(H * 0.93), W, H], fill=(3, 4, 7, 235))

    if scene in ("dusk", "night"):
        # parapet plants + a cable + a bucket, hugging the bottom corners
        d.rectangle([0, int(H * 0.945), W, H], fill=(3, 4, 7, 240))
        for px in (int(W * 0.02), int(W * 0.88)):
            d.rectangle([px, int(H * 0.80), px + 130, int(H * 0.90)], fill=ink)
            for k in range(7):
                lx = px + 6 + (k % 3) * 40
                ly = int(H * 0.80) - 40 - (k // 3) * 44
                d.ellipse([lx, ly, lx + 64, ly + 40], fill=(6, 10, 8, 255))
        for i in range(2):
            y = int(H * (0.06 + i * 0.04))
            d.line([(-40, y), (W + 40, y + int(rng.integers(-50, 50)))], fill=(5, 6, 10, 255), width=6)

    if scene == "sky":
        # almost nothing: a soft vignette edge and a few close embers
        for i in range(70):
            x = rng.integers(0, W); y = rng.integers(0, H)
            r = int(rng.integers(2, 7))
            d.ellipse([x, y, x + r, y + r], fill=(255, 190, 120, int(rng.integers(20, 60))))

    arr = to_np(img)
    if scene == "sky":
        for i in range(40):
            glow(arr, rng.integers(0, W), rng.integers(0, H), rng.integers(20, 60),
                 (255, 190, 120), 0.15, 2.0, 0.2)
    return finish(arr, f"{scene}_fg.png", 0.003, 11)


# ---------------------------------------------------------------- ACT CARDS
def card(n, title, kicker, accent):
    cw, ch = 1080, 1920
    img = Image.new("RGB", (cw, ch), (5, 7, 12))
    d = ImageDraw.Draw(img)

    # vertical wash
    for y in range(ch):
        t = y / ch
        col = (
            int(6 + 26 * (1 - t) * (1 - t)),
            int(8 + 14 * (1 - t)),
            int(14 + 40 * (1 - t) * (1 - t)),
        )
        d.line([(0, y), (cw, y)], fill=col)

    # accent glow
    ov = Image.new("RGB", (cw, ch), (0, 0, 0))
    od = ImageDraw.Draw(ov)
    od.ellipse([cw * 0.1, ch * 0.28, cw * 0.9, ch * 0.72], fill=tuple(int(c * 0.22) for c in accent))
    ov = ov.filter(ImageFilter.GaussianBlur(160))
    img = Image.blend(img, Image.blend(img, ov, 0.55), 0.9)
    d = ImageDraw.Draw(img)

    # the numeral, enormous and barely there
    f_big = A.font(760)
    txt = ["I", "II", "III", "IV", "V"][n - 1]
    d.text((cw / 2, ch * 0.46), txt, font=f_big, fill=tuple(int(c * 0.30) for c in accent), anchor="mm")

    # hairline frame
    d.rectangle([48, 48, cw - 48, ch - 48], outline=tuple(int(c * 0.35) for c in accent), width=2)

    # No typography here: the act card's words are drawn by the HUD so they
    # stay crisp at any DPI and can be localised. This plate is atmosphere.
    d.text((cw / 2, ch * 0.46), txt, font=f_big, fill=tuple(int(c * 0.10) for c in accent), anchor="mm")

    arr = np.asarray(img, np.float32) / 255.0
    arr += np.random.default_rng(n).standard_normal((ch, cw, 1)).astype(np.float32) * 0.004
    out = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGB")
    p = os.path.join(OUT, f"card_{n}.png")
    out.save(p, "PNG", compress_level=6)
    return os.path.getsize(p)


CARDS = [
    (1, "The Run", "ACT I", (255, 201, 107)),
    (2, "The Climb", "ACT II", (34, 225, 255)),
    (3, "The Setup", "ACT III", (255, 79, 216)),
    (4, "The Launch", "ACT IV", (255, 107, 53)),
    (5, "The Sky", "ACT V", (255, 231, 168)),
]


def cards():
    return {f"card_{n}.png": card(n, t, k, a) for (n, t, k, a) in CARDS}


def title_art():
    """A wide key-art plate for the title screen, layered behind the DOM."""
    cw, ch = W, H
    img = Image.new("RGB", (cw, ch), (4, 6, 11))
    d = ImageDraw.Draw(img)
    for y in range(ch):
        t = y / ch
        d.line([(0, y), (cw, y)], fill=(int(4 + 18 * (1 - t)), int(6 + 12 * (1 - t)), int(12 + 34 * (1 - t))))
    # city silhouette
    rng = np.random.default_rng(5)
    x = 0
    while x < cw:
        bw = int(rng.integers(70, 180)); bh = int(rng.integers(120, 520))
        d.rectangle([x, ch - bh - 380, x + bw, ch - 380], fill=(7, 9, 15))
        for wy in range(ch - bh - 360, ch - 400, 46):
            for wx in range(x + 12, x + bw - 14, 34):
                if rng.random() < 0.35:
                    d.rectangle([wx, wy, wx + 14, wy + 20], fill=(255, 200, 130))
        x += bw + int(rng.integers(6, 30))
    d.rectangle([0, ch - 380, cw, ch], fill=(4, 5, 9))
    arr = np.asarray(img, np.float32) / 255.0
    arr += rng.standard_normal((ch, cw, 1)).astype(np.float32) * 0.004
    p = os.path.join(OUT, "title_bg.png")
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGB").save(p, "PNG", compress_level=6)
    return os.path.getsize(p)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    out = {}
    if which in ("atmo", "all"):
        for s in ("lane", "stairs", "dusk", "night", "sky"):
            out[f"{s}_atmo.png"] = atmo(s)
    if which in ("fg", "all"):
        for s in ("lane", "stairs", "dusk", "night", "sky"):
            out[f"{s}_fg.png"] = fg(s)
    if which in ("cards", "all"):
        out.update(cards())
        out["title_bg.png"] = title_art()
    total = 0
    for k, v in out.items():
        print(f"  {k:22s} {v/1e6:6.2f} MB")
        total += v
    print(f"  -- {which} total: {total/1e6:.2f} MB")
