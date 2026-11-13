"""
gen_scenes.py — paints the five scenes of ROOFTOP PROTOCOL.

usage: python3 gen_scenes.py lane|stairs|dusk|night|sky|textures

Each scene is three plates. FAR is opaque (it is the sky). MID and NEAR are
RGBA so the game can composite them with real occlusion instead of faking it
with screen blending. All plates loop seamlessly in X.
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

import artlib as A
from artlib import W, H

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "art")


# ------------------------------------------------------------------ RGBA kit
def layer():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def to_np(img):
    return np.asarray(img, np.float32) / 255.0


def glow(arr, cx, cy, radius, color, power=1.0, falloff=2.2, alpha=0.85):
    """Additive light that also punches alpha into a transparent layer."""
    x0 = max(0, int(cx - radius)); x1 = min(W, int(cx + radius))
    y0 = max(0, int(cy - radius)); y1 = min(H, int(cy + radius))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    g = np.clip(1.0 - d, 0.0, 1.0) ** falloff
    arr[y0:y1, x0:x1, :3] += g[..., None] * (np.array(color, np.float32) / 255.0) * power
    arr[y0:y1, x0:x1, 3] = np.clip(arr[y0:y1, x0:x1, 3] + g * alpha, 0, 1)


def finish_rgba(arr, path, grain=0.020, seed=1):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((H, W, 1)).astype(np.float32)
    arr[:, :, :3] += n * grain
    out = np.clip(arr, 0, 1)
    img = Image.fromarray((out * 255).astype(np.uint8), "RGBA")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", compress_level=6)
    return os.path.getsize(path)


def finish_rgb(arr, path, grain=0.020, vig=0.5):
    A.add_grain(arr, grain)
    if vig:
        A.add_vignette(arr, vig)
    out = np.clip(arr, 0, 1)
    img = Image.fromarray((out * 255).astype(np.uint8), "RGB")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", compress_level=6)
    return os.path.getsize(path)


def soft_ellipse(d, box, fill, blur=40):
    """Draw an ellipse on its own layer, blur it, paste back — cheap clouds."""
    x0, y0, x1, y1 = box
    w = max(1, int(x1 - x0)); h = max(1, int(y1 - y0))
    tile = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.ellipse([0, 0, w - 1, h - 1], fill=fill)
    tile = tile.filter(ImageFilter.GaussianBlur(blur))
    return tile


from PIL import ImageFilter  # noqa: E402  (used by soft_ellipse)


def paste_soft(img, tile, xy):
    """Alpha-weighted paste that works on both RGB and RGBA destinations."""
    img.paste(tile, (int(xy[0]), int(xy[1])), tile)


# ===================================================================== LANE
def scene_lane():
    sizes = {}

    # ---- FAR: twilight sky over a distant skyline -------------------------
    sky = A.vgrad([
        (0.00, (10, 8, 26)),
        (0.22, (30, 16, 52)),
        (0.44, (74, 28, 62)),
        (0.62, (140, 52, 56)),
        (0.76, (196, 92, 44)),
        (0.86, (232, 138, 52)),
        (0.92, (246, 176, 86)),
        (1.00, (60, 30, 26)),
    ], jitter=0.004, seed=2)

    img, d = A.pil_layer()
    rng = np.random.default_rng(4)
    # far skyline: two depth bands of very faint blocks
    A.buildings(d, rng, int(H * 0.80), 26, int(H * 0.04), int(H * 0.16),
                int(W * 0.05), int(W * 0.12), (34, 18, 40), lit_chance=0.06,
                win_w=4, win_h=6, gap_x=13, gap_y=17)
    A.buildings(d, rng, int(H * 0.82), 18, int(H * 0.06), int(H * 0.22),
                int(W * 0.07), int(W * 0.16), (22, 12, 30), lit_chance=0.09,
                win_w=5, win_h=7, gap_x=15, gap_y=19)
    sky = A.composite(sky, img, 0.85)

    # smog strata: wide, soft, additive — never hard-edged bars
    for i in range(9):
        A.add_glow(sky, float(rng.integers(-200, W + 200)),
                   float(H * (0.20 + rng.random() * 0.46)),
                   float(rng.integers(500, 1200)), (255, 170, 140),
                   float(0.035 + rng.random() * 0.045), 3.2)
    clouds, cd = A.pil_layer()
    for i in range(7):
        y = int(H * (0.16 + rng.random() * 0.48))
        x = int(rng.integers(-500, W))
        w = int(rng.integers(1400, 2600)); h = int(rng.integers(18, 46))
        t = soft_ellipse(cd, (0, 0, w, h), (255, 205, 180, int(5 + rng.random() * 7)), blur=64)
        paste_soft(clouds, t, (x, y))
    sky = A.composite(sky, clouds, 1.0)

    A.fog_band(sky, H * 0.80, H * 0.10, (255, 190, 140), 0.22)
    A.add_glow(sky, W * 0.50, H * 0.86, W * 0.85, (255, 170, 110), 0.30, 2.6)
    sizes["lane_far.png"] = finish_rgb(sky, f"{OUT}/lane_far.png", 0.004, 0.42)

    # ---- MID: the lane's facades, shutters, stall, wires -------------------
    img, d = layer()
    rng = np.random.default_rng(9)
    street = int(H * 0.815)

    # back row of taller blocks
    A.buildings(d, rng, street - int(H * 0.04), 12, int(H * 0.18), int(H * 0.34),
                int(W * 0.10), int(W * 0.20), (16, 12, 24), lit_chance=0.30,
                win_w=10, win_h=14, gap_x=14, gap_y=18)

    # shopfront row
    x = -40
    while x < W:
        bw = int(rng.integers(int(W * 0.14), int(W * 0.26)))
        bh = int(rng.integers(int(H * 0.26), int(H * 0.42)))
        top = street - bh
        body = (26, 18, 22) if rng.random() > 0.5 else (30, 22, 26)
        A.wrap_rect(d, x, top, bw, bh, body + (255,))
        A.wrap_rect(d, x - 3, top - 10, bw + 6, 12, (44, 30, 32, 255))
        # balcony
        A.wrap_rect(d, x + 6, top + int(bh * 0.30), bw - 12, 8, (52, 38, 40, 255))
        for i in range(9):
            A.wrap_line(d, [(x + 10 + i * (bw - 20) / 9, top + int(bh * 0.30)),
                            (x + 10 + i * (bw - 20) / 9, top + int(bh * 0.30) - 26)],
                        (58, 44, 46, 255), 2)
        # upper windows
        for i in range(3):
            for j in range(2):
                wx = x + 18 + i * (bw - 46) / 3
                wy = top + 26 + j * 54
                lit = rng.random() < 0.55
                col = (255, 196, 120, 255) if lit else (14, 10, 14, 255)
                A.wrap_rect(d, wx, wy, 30, 40, col)
        # ground-floor roller shutter
        sh_y = top + int(bh * 0.56)
        A.wrap_rect(d, x + 12, sh_y, bw - 24, street - sh_y, (20, 20, 24, 255))
        for i in range(0, bw - 24, 9):
            A.wrap_line(d, [(x + 12 + i, sh_y), (x + 12 + i, street)], (34, 34, 40, 255), 2)
        # hanging bulb over the shutter
        A.wrap_line(d, [(x + bw / 2, top + 4), (x + bw / 2, top + 40)], (10, 8, 10, 255), 2)
        x += bw + int(rng.integers(10, 40))

    # a chai stall with a warm lamp
    sx = int(W * 0.14)
    A.wrap_rect(d, sx, street - int(H * 0.13), int(W * 0.17), int(H * 0.13), (24, 18, 20, 255))
    A.wrap_rect(d, sx - 8, street - int(H * 0.145), int(W * 0.17) + 16, 14, (40, 28, 26, 255))
    for i in range(6):
        A.wrap_line(d, [(sx + 14 + i * 26, street - int(H * 0.13)),
                        (sx + 14 + i * 26, street)], (38, 28, 26, 255), 3)
    # hanging glasses
    for i in range(5):
        A.wrap_rect(d, sx + 20 + i * 30, street - int(H * 0.135), 12, 16, (120, 92, 60, 255))

    # awning stripes over a few shutters (cheap, huge readability win)
    for ax in (int(W * 0.05), int(W * 0.42), int(W * 0.70)):
        aw = int(W * 0.17); ah = 46; ay = street - int(H * 0.155)
        for k in range(9):
            col = (96, 34, 40, 255) if k % 2 == 0 else (206, 196, 180, 255)
            A.wrap_rect(d, ax + k * aw / 9, ay, aw / 9 + 1, ah, col)
        A.wrap_rect(d, ax, ay + ah, aw, 8, (40, 26, 28, 255))

    # AC units + cable ducts
    for i in range(7):
        ax = int(rng.integers(0, W)); ay = street - int(rng.integers(int(H * 0.20), int(H * 0.34)))
        A.wrap_rect(d, ax, ay, 74, 52, (44, 44, 48, 255))
        A.wrap_rect(d, ax + 6, ay + 8, 62, 12, (26, 26, 30, 255))
        A.wrap_rect(d, ax + 6, ay + 26, 62, 10, (26, 26, 30, 255))

    # neon shop signs (two, low, warm-cool contrast)
    for nx, ncol in ((int(W * 0.33), (34, 225, 255, 255)), (int(W * 0.83), (255, 79, 216, 255))):
        A.wrap_rect(d, nx, street - int(H * 0.235), int(W * 0.11), 62, (14, 14, 18, 255))
        A.wrap_rect(d, nx + 6, street - int(H * 0.235) + 6, int(W * 0.11) - 12, 50, ncol)

    # nameboard
    f = A.font(52)
    A.wrap_rect(d, int(W * 0.56), street - int(H * 0.255), int(W * 0.24), 74, (16, 13, 15, 255))
    for dx in (-W, 0, W):
        d.text((int(W * 0.572) + dx, street - int(H * 0.255) + 14), "MONDAL STORES",
               font=f, fill=(178, 160, 128, 255))

    # wires + antennae
    A.wires(d, rng, int(H * 0.34), 7, sag=52, color=(6, 6, 9, 255))
    A.wires(d, rng, int(H * 0.46), 4, sag=38, color=(6, 6, 9, 255))
    A.antenna(d, int(W * 0.72), street - int(H * 0.36), int(H * 0.10), (6, 7, 10, 255))

    # lamp post
    lx = int(W * 0.62)
    A.wrap_rect(d, lx, street - int(H * 0.30), 10, int(H * 0.30), (10, 10, 14, 255))
    A.wrap_line(d, [(lx + 5, street - int(H * 0.30)), (lx + 90, street - int(H * 0.305))], (10, 10, 14, 255), 6)
    A.wrap_rect(d, lx + 76, street - int(H * 0.315), 30, 16, (40, 34, 28, 255))

    # the yellow Ambassador, blurred, mid-distance
    tx = int(W * 0.30); ty = street - 120
    A.wrap_rect(d, tx, ty, 300, 92, (58, 44, 18, 255))
    A.wrap_rect(d, tx + 60, ty - 54, 170, 60, (50, 38, 16, 255))
    for wx in (tx + 40, tx + 240):
        A.wrap_rect(d, wx, ty + 62, 54, 54, (10, 10, 12, 255))

    arr = to_np(img)
    glow(arr, lx + 90, street - int(H * 0.305), 480, (255, 180, 90), 1.05, 1.9, 0.9)
    glow(arr, sx + int(W * 0.085), street - int(H * 0.13), 380, (255, 150, 70), 0.75, 2.2, 0.85)
    # neon bloom
    glow(arr, int(W * 0.385), street - int(H * 0.22), 300, (34, 225, 255), 0.55, 2.4, 0.6)
    glow(arr, int(W * 0.885), street - int(H * 0.22), 300, (255, 79, 216), 0.45, 2.4, 0.55)
    for i in range(16):
        glow(arr, float(rng.integers(0, W)), street - float(rng.integers(int(H * 0.30), int(H * 0.44))),
             110, (255, 200, 130), 0.26, 2.6, 0.5)
    # ambient sodium fill across the shopfront band
    glow(arr, W * 0.50, street - int(H * 0.02), W * 0.85, (255, 150, 95), 0.20, 2.4, 0.18)
    glow(arr, W * 0.20, street - int(H * 0.10), W * 0.45, (255, 190, 130), 0.10, 2.8, 0.12)
    sizes["lane_mid.png"] = finish_rgba(arr, f"{OUT}/lane_mid.png", 0.004, 3)

    # ---- NEAR: street, kerb, pillar, trash, the dog -----------------------
    img, d = layer()
    rng = np.random.default_rng(21)
    street = int(H * 0.815)

    arr = np.zeros((H, W, 4), np.float32)
    ground = np.zeros((H - street, W, 3), np.float32) + np.array((16, 16, 20), np.float32) / 255
    gn = rng.standard_normal((H - street, W, 1)).astype(np.float32)
    ground += gn * 0.040
    # kerb
    ground[:26] = np.array((44, 40, 40), np.float32) / 255
    ground[26:40] = np.array((26, 24, 26), np.float32) / 255
    arr[street:, :, :3] = ground
    arr[street:, :, 3] = 1.0

    img2 = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img2)

    # foreground brick pillar on the left
    A.wrap_rect(d, -20, 0, int(W * 0.11), H, (34, 20, 20, 255))
    for by in range(0, H, 26):
        A.wrap_rect(d, -20, by, int(W * 0.11), 22, (40, 24, 23, 255))
        A.wrap_line(d, [(-20, by), (int(W * 0.11) - 20, by)], (18, 12, 12, 255), 3)

    # trash bags
    for i in range(5):
        bx = int(rng.integers(int(W * 0.55), W)); by = street - int(rng.integers(30, 70))
        r = int(rng.integers(28, 52))
        d.ellipse([bx, by, bx + r * 2, by + r * 1.6], fill=(18, 20, 24, 255))
        d.ellipse([bx + 6, by + 4, bx + r * 2 - 10, by + r * 0.9], fill=(30, 34, 40, 255))

    # sleeping dog
    dx = int(W * 0.78); dy = street + 40
    d.ellipse([dx, dy, dx + 150, dy + 62], fill=(20, 16, 16, 255))
    d.ellipse([dx + 120, dy - 26, dx + 190, dy + 26], fill=(20, 16, 16, 255))
    d.ellipse([dx + 150, dy - 16, dx + 176, dy + 4], fill=(30, 24, 22, 255))

    # drain grate in the gutter
    gx0 = int(W * 0.30)
    for k in range(9):
        A.wrap_line(d, [(gx0 + k * 13, street + 6), (gx0 + k * 13, street + 54)], (8, 8, 10, 255), 4)
    A.wrap_rect(d, gx0 - 6, street + 2, 132, 58, (10, 10, 12, 255))

    arr = to_np(img2)
    # wet road: long vertical smear reflections under each light source
    for cx, col, p in ((W * 0.62, (255, 170, 90), 0.55), (W * 0.14, (255, 150, 70), 0.42),
                       (W * 0.385, (34, 225, 255), 0.30), (W * 0.885, (255, 79, 216), 0.26)):
        for k in range(5):
            glow(arr, cx + rng.integers(-40, 40), street + 40 + k * 70, 150 - k * 12,
                 col, p * 1.35 * (1 - k * 0.14), 3.0, 0.0)
    # puddles
    for i in range(4):
        px = float(rng.integers(0, W)); py = float(street + rng.integers(60, 300))
        glow(arr, px, py, float(rng.integers(90, 180)), (150, 190, 230), 0.10, 2.4, 0.0)
    # foreground shadow so the near layer reads as "in front"
    yb = np.linspace(0, 1, H - int(H * 0.94), dtype=np.float32)[:, None, None]
    arr[int(H * 0.94):, :, :3] *= (1 - yb * 0.55)
    arr[int(H * 0.94):, :, 3] = np.clip(arr[int(H * 0.94):, :, 3] + 0.5, 0, 1)
    sizes["lane_near.png"] = finish_rgba(arr, f"{OUT}/lane_near.png", 0.004, 5)
    return sizes


# =================================================================== STAIRS
def scene_stairs():
    sizes = {}
    # ---- FAR: evening facade with balconies ------------------------------
    sky = A.vgrad([
        (0.00, (12, 10, 28)),
        (0.30, (26, 20, 50)),
        (0.55, (48, 30, 62)),
        (0.75, (78, 44, 62)),
        (0.90, (108, 62, 60)),
        (1.00, (40, 26, 30)),
    ], jitter=0.004, seed=6)

    img, d = A.pil_layer()
    rng = np.random.default_rng(31)
    base = int(H * 0.95)
    A.buildings(d, rng, base, 10, int(H * 0.30), int(H * 0.58),
                int(W * 0.20), int(W * 0.34), (22, 18, 30), lit_chance=0.42,
                win_w=22, win_h=30, gap_x=26, gap_y=34)
    sky = A.composite(sky, img, 0.92)

    img2, d2 = A.pil_layer()
    # green shutters + balconies on the near facade
    for i in range(6):
        x = int(i * W / 6) + 40
        y = int(H * (0.30 + (i % 3) * 0.10))
        A.wrap_rect(d2, x, y, int(W * 0.13), int(H * 0.16), (14, 26, 20))
        for k in range(5):
            A.wrap_line(d2, [(x + 10 + k * 22, y), (x + 10 + k * 22, y + int(H * 0.16))], (26, 46, 34), 4)
        A.wrap_rect(d2, x - 8, y + int(H * 0.155), int(W * 0.145), 10, (60, 52, 44))
        for k in range(8):
            A.wrap_line(d2, [(x - 8 + k * (W * 0.145) / 8, y + int(H * 0.155)),
                             (x - 8 + k * (W * 0.145) / 8, y + int(H * 0.20))], (52, 46, 40), 3)
        # clothes on the line
        for k in range(3):
            cx = x + 30 + k * 70
            A.wrap_rect(d2, cx, y + int(H * 0.163), 46, 70, (70, 40, 46))
    sky = A.composite(sky, img2, 0.95)
    A.fog_band(sky, H * 0.62, H * 0.12, (200, 150, 190), 0.14)
    sizes["stairs_far.png"] = finish_rgb(sky, f"{OUT}/stairs_far.png", 0.004, 0.45)

    # ---- MID: the mossy staircase ---------------------------------------
    img, d = layer()
    rng = np.random.default_rng(44)
    steps = 9
    x0, y0 = int(W * 0.04), int(H * 0.96)
    x1, y1 = int(W * 0.96), int(H * 0.34)
    for i in range(steps):
        t0 = i / steps; t1 = (i + 1) / steps
        ax = x0 + (x1 - x0) * t0; ay = y0 + (y1 - y0) * t0
        bx = x0 + (x1 - x0) * t1; by = y0 + (y1 - y0) * t1
        A.wrap_poly(d, [(ax, ay), (bx, by), (bx, by + 74), (ax, ay + 74)], (58, 56, 54, 255))
        A.wrap_line(d, [(ax, ay), (bx, by)], (86, 84, 80, 255), 6)
        # riser shadow
        A.wrap_line(d, [(bx, by), (bx, by + 74)], (24, 24, 26, 255), 8)
        # moss on the tread edge
        for k in range(26):
            mx = ax + (bx - ax) * rng.random()
            my = ay + (by - ay) * (mx - ax) / max(1, (bx - ax)) + rng.random() * 10
            r = rng.integers(6, 20)
            d.ellipse([mx, my, mx + r, my + r * 0.7], fill=(28, 62, 40, 210))
    # railing
    for i in range(steps + 1):
        t = i / steps
        rx = x0 + (x1 - x0) * t; ry = y0 + (y1 - y0) * t
        A.wrap_line(d, [(rx, ry - 10), (rx, ry - 190)], (26, 26, 30, 255), 9)
    A.wrap_line(d, [(x0, y0 - 200), (x1, y1 - 200)], (30, 30, 34, 255), 12)
    # potted money plants
    for i in range(5):
        t = 0.1 + i * 0.17
        px = x0 + (x1 - x0) * t + 40; py = y0 + (y1 - y0) * t - 60
        A.wrap_rect(d, px, py, 74, 62, (60, 34, 28, 255))
        for k in range(9):
            lx = px + 8 + (k % 3) * 22; ly = py - 20 - (k // 3) * 26
            d.ellipse([lx, ly, lx + 34, ly + 22], fill=(22, 58, 38, 255))
    # hanging bulb
    bx = int(W * 0.52)
    A.wrap_line(d, [(bx, 0), (bx, int(H * 0.10))], (10, 10, 12, 255), 3)
    A.wrap_rect(d, bx - 12, int(H * 0.10), 24, 30, (60, 54, 40, 255))
    # nameplate
    f = A.font(56)
    A.wrap_rect(d, int(W * 0.66), int(H * 0.72), int(W * 0.26), 84, (30, 28, 26, 255))
    for dx in (-W, 0, W):
        d.text((int(W * 0.675) + dx, int(H * 0.725)), "BASU VILLA", font=f, fill=(214, 190, 140, 255))

    arr = to_np(img)
    glow(arr, bx, int(H * 0.105), 460, (255, 200, 120), 1.0, 2.0, 0.9)
    glow(arr, int(W * 0.66), int(H * 0.72), 260, (255, 170, 90), 0.30, 2.6, 0.5)
    sizes["stairs_mid.png"] = finish_rgba(arr, f"{OUT}/stairs_mid.png", 0.004, 8)

    # NOTE: there is no near plate for the stairs. A foreground railing drawn
    # across the whole frame read as prison bars and buried the staircase, so
    # the act walks the painted stairs on the mid plate instead.
    return sizes


# ===================================================================== DUSK
def scene_dusk():
    sizes = {}
    sky = A.vgrad([
        (0.00, (18, 8, 40)),
        (0.20, (44, 16, 62)),
        (0.40, (86, 28, 66)),
        (0.58, (150, 52, 58)),
        (0.72, (208, 98, 44)),
        (0.84, (240, 152, 66)),
        (0.94, (255, 201, 107)),
        (1.00, (120, 62, 44)),
    ], jitter=0.005, seed=12)

    img, d = A.pil_layer()
    rng = np.random.default_rng(61)
    for i in range(18):
        y = int(H * (0.10 + rng.random() * 0.55))
        x = int(rng.integers(-400, W)); w = int(rng.integers(900, 2100)); h = int(rng.integers(30, 90))
        t = soft_ellipse(d, (0, 0, w, h), (255, 190, 150, int(12 + rng.random() * 18)), blur=54)
        paste_soft(img, t, (x, y))
    sky = A.composite(sky, img, 1.0)

    img2, d2 = A.pil_layer()
    A.buildings(d2, rng, int(H * 0.92), 16, int(H * 0.03), int(H * 0.10),
                int(W * 0.04), int(W * 0.10), (60, 30, 44), lit_chance=0.2,
                win_w=5, win_h=7, gap_x=10, gap_y=12)
    sky = A.composite(sky, img2, 0.75)
    A.fog_band(sky, H * 0.80, H * 0.10, (255, 180, 130), 0.20)
    A.add_glow(sky, W * 0.30, H * 0.84, W * 0.9, (255, 170, 100), 0.28, 2.6)
    A.add_stars(sky, 320, seed=13, top=0.0, bottom=0.28, glow=0.5)
    sizes["dusk_far.png"] = finish_rgb(sky, f"{OUT}/dusk_far.png", 0.004, 0.40)

    # ---- MID: rooftop skyline with tanks and antennae -------------------
    img, d = layer()
    rng = np.random.default_rng(71)
    base = int(H * 0.88)
    A.buildings(d, rng, base, 14, int(H * 0.10), int(H * 0.26),
                int(W * 0.08), int(W * 0.18), (26, 16, 30, 255), lit_chance=0.28,
                win_w=9, win_h=12, gap_x=12, gap_y=16)
    for i in range(9):
        A.water_tank(d, int(rng.integers(0, W)), base - int(rng.integers(0, int(H * 0.14))),
                     int(rng.integers(90, 170)), int(rng.integers(80, 140)), (18, 12, 22, 255))
    for i in range(7):
        A.antenna(d, int(rng.integers(0, W)), base - int(rng.integers(int(H * 0.10), int(H * 0.22))),
                  int(rng.integers(180, 420)), (10, 8, 14, 255))
    # distant Howrah-ish truss
    ty = int(H * 0.66)
    for i in range(0, W, 120):
        A.wrap_line(d, [(i, ty), (i + 60, ty - 120)], (40, 26, 34, 255), 6)
        A.wrap_line(d, [(i + 60, ty - 120), (i + 120, ty)], (40, 26, 34, 255), 6)
    A.wrap_line(d, [(0, ty), (W, ty)], (46, 30, 38, 255), 10)
    A.wrap_line(d, [(0, ty - 120), (W, ty - 120)], (46, 30, 38, 255), 8)
    # laundry line
    A.wires(d, rng, int(H * 0.42), 3, sag=30, color=(20, 12, 20, 255))
    for i in range(8):
        cx = int(rng.integers(0, W))
        A.wrap_rect(d, cx, int(H * 0.43), 54, 86, (48, 28, 40, 255))

    arr = to_np(img)
    for i in range(10):
        glow(arr, float(rng.integers(0, W)), float(rng.integers(int(H * 0.60), int(H * 0.88))),
             150, (255, 190, 120), 0.34, 2.4, 0.45)
    sizes["dusk_mid.png"] = finish_rgba(arr, f"{OUT}/dusk_mid.png", 0.004, 14)

    # ---- NEAR: terrace tiles + parapet ---------------------------------
    img, d = layer()
    rng = np.random.default_rng(81)
    top = int(H * 0.70)
    A.wrap_rect(d, 0, top, W, H - top, (26, 24, 28, 255))
    for i in range(0, W, 128):
        A.wrap_line(d, [(i, top), (i, H)], (18, 16, 20, 255), 3)
    yy = top
    step = 46
    while yy < H:
        A.wrap_line(d, [(0, yy), (W, yy)], (18, 16, 20, 255), 3)
        yy += step
    # parapet wall along the very bottom
    A.wrap_rect(d, 0, int(H * 0.86), W, int(H * 0.14), (48, 28, 26, 255))
    for by in range(int(H * 0.86), H, 26):
        A.wrap_rect(d, 0, by, W, 22, (56, 34, 30, 255))
        A.wrap_line(d, [(0, by), (W, by)], (24, 14, 14, 255), 3)
    A.wrap_rect(d, 0, int(H * 0.855), W, 14, (72, 46, 38, 255))
    # potted plants on the ledge
    for i in range(4):
        px = int(W * (0.08 + i * 0.26))
        A.wrap_rect(d, px, int(H * 0.80), 90, 78, (58, 34, 28, 255))
        for k in range(7):
            lx = px + 6 + (k % 3) * 26; ly = int(H * 0.80) - 24 - (k // 3) * 30
            d.ellipse([lx, ly, lx + 40, ly + 26], fill=(24, 52, 34, 255))
    arr = to_np(img)
    glow(arr, W * 0.50, int(H * 0.60), W * 0.8, (255, 170, 110), 0.10, 2.8, 0.0)
    sizes["dusk_near.png"] = finish_rgba(arr, f"{OUT}/dusk_near.png", 0.004, 17)
    return sizes


# ==================================================================== NIGHT
def scene_night():
    sizes = {}
    sky = A.vgrad([
        (0.00, (3, 5, 11)),
        (0.35, (7, 10, 22)),
        (0.62, (12, 16, 34)),
        (0.82, (22, 24, 48)),
        (0.94, (38, 30, 54)),
        (1.00, (16, 12, 24)),
    ], jitter=0.006, seed=22)
    A.add_stars(sky, 3400, seed=23, top=0.0, bottom=0.72, glow=1.0)
    # milky haze
    for i in range(5):
        A.fog_band(sky, H * (0.12 + i * 0.11), H * 0.06, (120, 150, 220), 0.05)
    # moon
    A.add_glow(sky, W * 0.78, H * 0.14, 420, (200, 220, 255), 0.30, 2.4)
    img, d = A.pil_layer()
    d.ellipse([W * 0.78 - 46, H * 0.14 - 46, W * 0.78 + 46, H * 0.14 + 46], fill=(228, 236, 255))
    sky = A.composite(sky, img, 0.95)
    sizes["night_far.png"] = finish_rgb(sky, f"{OUT}/night_far.png", 0.004, 0.44)

    # ---- MID: the city, lit --------------------------------------------
    img, d = layer()
    rng = np.random.default_rng(91)
    base = int(H * 0.90)
    A.buildings(d, rng, base, 20, int(H * 0.10), int(H * 0.30),
                int(W * 0.06), int(W * 0.15), (10, 12, 20, 255), lit_chance=0.55,
                win_w=8, win_h=11, gap_x=10, gap_y=14,
                win_cols=((255, 200, 130), (200, 235, 255)), cool_chance=0.30)
    A.buildings(d, rng, base + 40, 14, int(H * 0.05), int(H * 0.16),
                int(W * 0.05), int(W * 0.12), (8, 10, 16, 255), lit_chance=0.45,
                win_w=6, win_h=8, gap_x=9, gap_y=12)
    for i in range(10):
        A.water_tank(d, int(rng.integers(0, W)), base - int(rng.integers(0, int(H * 0.12))),
                     int(rng.integers(80, 150)), int(rng.integers(70, 120)), (8, 10, 16, 255))
    for i in range(8):
        A.antenna(d, int(rng.integers(0, W)), base - int(rng.integers(int(H * 0.10), int(H * 0.24))),
                  int(rng.integers(200, 480)), (6, 8, 12, 255))
    # bridge truss
    ty = int(H * 0.70)
    for i in range(0, W, 130):
        A.wrap_line(d, [(i, ty), (i + 65, ty - 150)], (18, 20, 28, 255), 8)
        A.wrap_line(d, [(i + 65, ty - 150), (i + 130, ty)], (18, 20, 28, 255), 8)
    A.wrap_line(d, [(0, ty), (W, ty)], (22, 24, 34, 255), 12)
    A.wrap_line(d, [(0, ty - 150), (W, ty - 150)], (22, 24, 34, 255), 9)
    arr = to_np(img)
    for i in range(26):
        glow(arr, float(rng.integers(0, W)), float(rng.integers(int(H * 0.58), int(H * 0.90))),
             float(rng.integers(90, 220)), (255, 190, 120), 0.30, 2.5, 0.35)
    for i in range(6):
        glow(arr, float(rng.integers(0, W)), float(rng.integers(int(H * 0.55), int(H * 0.80))),
             180, (34, 225, 255), 0.16, 2.8, 0.25)
    sizes["night_mid.png"] = finish_rgba(arr, f"{OUT}/night_mid.png", 0.004, 19)

    # ---- NEAR: parapet + tiles -----------------------------------------
    img, d = layer()
    rng = np.random.default_rng(101)
    top = int(H * 0.72)
    A.wrap_rect(d, 0, top, W, H - top, (18, 18, 22, 255))
    for i in range(0, W, 120):
        A.wrap_line(d, [(i, top), (i, H)], (12, 12, 16, 255), 3)
    yy = top
    while yy < H:
        A.wrap_line(d, [(0, yy), (W, yy)], (12, 12, 16, 255), 3)
        yy += 52
    A.wrap_rect(d, 0, int(H * 0.87), W, int(H * 0.13), (40, 24, 24, 255))
    for by in range(int(H * 0.87), H, 26):
        A.wrap_rect(d, 0, by, W, 22, (48, 28, 26, 255))
        A.wrap_line(d, [(0, by), (W, by)], (20, 12, 12, 255), 3)
    A.wrap_rect(d, 0, int(H * 0.865), W, 12, (62, 40, 34, 255))
    arr = to_np(img)
    glow(arr, W * 0.30, int(H * 0.78), 300, (255, 190, 120), 0.16, 3.0, 0.0)
    glow(arr, W * 0.72, int(H * 0.80), 260, (34, 225, 255), 0.12, 3.0, 0.0)
    sizes["night_near.png"] = finish_rgba(arr, f"{OUT}/night_near.png", 0.004, 23)
    return sizes


# ====================================================================== SKY
def scene_sky():
    sizes = {}
    sky = A.vgrad([
        (0.00, (2, 3, 8)),
        (0.30, (5, 7, 18)),
        (0.60, (10, 12, 28)),
        (0.85, (16, 16, 38)),
        (1.00, (26, 18, 44)),
    ], jitter=0.007, seed=33)
    A.add_stars(sky, 4200, seed=34, top=0.0, bottom=0.95, glow=1.1)
    A.add_glow(sky, W * 0.30, H * 0.30, W * 0.7, (90, 60, 180), 0.22, 2.6)
    A.add_glow(sky, W * 0.74, H * 0.52, W * 0.6, (20, 120, 160), 0.18, 2.6)
    A.add_glow(sky, W * 0.50, H * 0.80, W * 0.8, (180, 120, 40), 0.12, 2.8)
    sizes["sky_far.png"] = finish_rgb(sky, f"{OUT}/sky_far.png", 0.004, 0.40)

    img, d = layer()
    rng = np.random.default_rng(111)
    for i in range(22):
        y = int(H * rng.random()); x = int(rng.integers(-500, W))
        w = int(rng.integers(700, 1800)); h = int(rng.integers(80, 320))
        col = (120, 110, 200, int(8 + rng.random() * 14))
        t = soft_ellipse(d, (0, 0, w, h), col, blur=70)
        paste_soft(img, t, (x, y))
    arr = to_np(img)
    sizes["sky_mid.png"] = finish_rgba(arr, f"{OUT}/sky_mid.png", 0.004, 29)

    img, d = layer()
    rng = np.random.default_rng(121)
    for i in range(60):
        x = int(rng.integers(0, W)); y = int(rng.integers(0, H))
        r = int(rng.integers(3, 9))
        d.ellipse([x, y, x + r, y + r], fill=(255, 200, 130, 60))
    arr = to_np(img)
    sizes["sky_near.png"] = finish_rgba(arr, f"{OUT}/sky_near.png", 0.004, 31)
    return sizes


# ================================================================= TEXTURES
def textures():
    sizes = {}
    # radial glow sprite (additive particles)
    s = 256
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    d = np.sqrt((xx - s / 2) ** 2 + (yy - s / 2) ** 2) / (s / 2)
    core = np.clip(1 - d, 0, 1) ** 1.6
    halo = np.clip(1 - d, 0, 1) ** 4.0
    a = np.clip(core + halo * 0.5, 0, 1)
    rgba = np.zeros((s, s, 4), np.uint8)
    rgba[..., 0] = 255; rgba[..., 1] = 255; rgba[..., 2] = 255
    rgba[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(f"{OUT}/tex_glow.png", "PNG", compress_level=9)
    sizes["tex_glow.png"] = os.path.getsize(f"{OUT}/tex_glow.png")

    # smoke puff (soft, tileable-ish)
    s = 512
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rng = np.random.default_rng(5)
    for i in range(26):
        r = int(rng.integers(40, 150))
        cx = int(rng.integers(80, s - 80)); cy = int(rng.integers(80, s - 80))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, int(rng.integers(14, 40))))
    img = img.filter(ImageFilter.GaussianBlur(26))
    img.save(f"{OUT}/tex_smoke.png", "PNG", compress_level=9)
    sizes["tex_smoke.png"] = os.path.getsize(f"{OUT}/tex_smoke.png")

    # film grain tile (seamless)
    s = 512
    rng = np.random.default_rng(77)
    n = rng.integers(0, 255, (s, s), dtype=np.uint8)
    rgba = np.zeros((s, s, 4), np.uint8)
    rgba[..., 0] = n; rgba[..., 1] = n; rgba[..., 2] = n
    rgba[..., 3] = 255
    Image.fromarray(rgba, "RGBA").save(f"{OUT}/tex_grain.png", "PNG", compress_level=9)
    sizes["tex_grain.png"] = os.path.getsize(f"{OUT}/tex_grain.png")

    # brick detail tile for close-ups
    s = 512
    rng = np.random.default_rng(88)
    img = Image.new("RGB", (s, s), (26, 16, 16))
    d = ImageDraw.Draw(img)
    bw, bh = 128, 52
    for r in range(s // bh + 1):
        off = (bw // 2) if r % 2 else 0
        for c in range(-1, s // bw + 2):
            x = c * bw + off; y = r * bh
            k = 0.7 + rng.random() * 0.6
            col = (int(52 * k), int(30 * k), int(28 * k))
            d.rectangle([x + 3, y + 3, x + bw - 3, y + bh - 3], fill=col)
    arr = np.asarray(img, np.float32) / 255
    arr += rng.standard_normal((s, s, 1)).astype(np.float32) * 0.03
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGB").save(
        f"{OUT}/tex_brick.png", "PNG", compress_level=9)
    sizes["tex_brick.png"] = os.path.getsize(f"{OUT}/tex_brick.png")
    return sizes


GROUPS = {
    "lane": scene_lane,
    "stairs": scene_stairs,
    "dusk": scene_dusk,
    "night": scene_night,
    "sky": scene_sky,
    "textures": textures,
}

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "textures"
    out = GROUPS[which]()
    total = 0
    for k, v in out.items():
        print(f"  {k:22s} {v/1e6:6.2f} MB")
        total += v
    print(f"  -- {which} total: {total/1e6:.2f} MB")
