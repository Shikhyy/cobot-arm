#!/usr/bin/env python3
"""High-res canonical renders of the CAD assembly with a 10 mm grid + axes.

Purpose: recover the true kinematic layout (which part belongs to which link,
where each joint pivot sits, and which axis it turns about) so the WebGL
assembly can be built with real joint pivots instead of guessed ones.
"""
import os
import struct
import sys
import glob

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAD = os.path.join(ROOT, "Robotic+Arm+with+Servo+&+Arduino")
OUT = os.path.join(ROOT, ".cad-inspect")

PALETTE = {
    "Alt_Kasa": (60, 66, 78), "Alt_Kapak": (206, 44, 32), "Tabla_Alt": (120, 66, 40),
    "Alt_Govde": (232, 118, 34), "Alt_Kol": (150, 190, 70), "On_Kol": (54, 130, 200),
    "Bilek": (200, 90, 170), "El": (242, 180, 48), "El_Ust": (120, 100, 210),
    "Mil_1": (200, 200, 205), "Mil_2": (170, 170, 180), "Mil_3": (230, 230, 235),
    "Disli": (240, 200, 120), "Mil_Disli": (150, 200, 220), "Servo_Disli": (110, 170, 120),
    "Parmak X 2": (210, 130, 90), "Parmak_2 X 2": (90, 130, 160), "Parmak_Disli X 2": (180, 150, 90),
    "Jack_Cover": (100, 180, 180), "Servo_Cable_Holder": (160, 160, 170),
}


def load_stl(path):
    with open(path, "rb") as fh:
        head = fh.read(84)
        count = struct.unpack("<I", head[80:84])[0]
        data = fh.read()
    tris = np.zeros((count, 3, 3), dtype=np.float64)
    for i in range(count):
        off = i * 50
        v = struct.unpack("<12f", data[off:off + 48])
        tris[i] = (v[3:6], v[6:9], v[9:12])
    return tris


def look_at(eye, target, up=(0, 0, 1)):
    eye = np.array(eye, dtype=float)
    target = np.array(target, dtype=float)
    up = np.array(up, dtype=float)
    f = target - eye
    f /= np.linalg.norm(f)
    s = np.cross(f, up)
    if np.linalg.norm(s) < 1e-6:
        s = np.cross(f, np.array([0.0, 1.0, 0.0]))
    s /= np.linalg.norm(s)
    u = np.cross(s, f)
    R = np.stack([s, u, -f])
    return R, np.linalg.norm(eye - target)


def render(parts, eye, target, size=1100, grid=10.0, ghost=None, up=(0, 0, 1)):
    R, dist = look_at(eye, target, up)
    center = np.array(target, dtype=float)
    fov = np.deg2rad(38)
    scale = (size * 0.5) / (dist * np.tan(fov / 2))

    def project(v):
        # Orthographic: no perspective divide, so nothing can blow up behind the camera.
        p = (v - center) @ R.T
        sx = p[..., 0] * scale + size / 2
        sy = -p[..., 1] * scale + size / 2
        # Negated so that SMALLER == closer to camera (standard depth buffer).
        return sx, sy, -p[..., 2]

    img = np.zeros((size, size, 3), dtype=np.float64)
    img[:] = (11, 11, 13)
    zbuf = np.full((size, size), np.inf)

    # ground grid removed: bounding-rect fill was not quad-accurate.

    light = np.array([0.4, 0.5, 0.76])
    light /= np.linalg.norm(light)

    def draw(geom, color, bright=1.0, alpha=1.0):
        v = geom.reshape(-1, 3)
        a, b, c = v[0::3], v[1::3], v[2::3]
        n = np.cross(b - a, c - a)
        ln = np.linalg.norm(n, axis=1)
        ln[ln == 0] = 1
        n = n / ln[:, None]
        lam = np.abs(n @ light)
        shade = (0.16 + 0.84 * lam)[:, None]
        col = np.clip(np.array(color, dtype=float)[None, :] * shade * bright, 0, 255)
        sa, ta, za = project(a)
        sb, tb, zb = project(b)
        sc, tc, zc = project(c)
        for i in range(len(a)):
            x0 = int(min(sa[i], sb[i], sc[i])); x1 = int(max(sa[i], sb[i], sc[i])) + 1
            y0 = int(min(ta[i], tb[i], tc[i])); y1 = int(max(ta[i], tb[i], tc[i]) + 1)
            x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, size); y1 = min(y1, size)
            if x1 <= x0 or y1 <= y0:
                continue
            xs = np.arange(x0, x1); ys = np.arange(y0, y1)
            gx2, gy2 = np.meshgrid(xs, ys)
            p0, p1, p2 = np.array([sa[i], ta[i]]), np.array([sb[i], tb[i]]), np.array([sc[i], tc[i]])
            d00 = (p1[0] - p0[0]) * (gy2 - p0[1]) - (p1[1] - p0[1]) * (gx2 - p0[0])
            d01 = (p2[0] - p1[0]) * (gy2 - p1[1]) - (p2[1] - p1[1]) * (gx2 - p1[0])
            d02 = (p0[0] - p2[0]) * (gy2 - p2[1]) - (p0[1] - p2[1]) * (gx2 - p2[0])
            inside = ((d00 >= 0) & (d01 >= 0) & (d02 >= 0)) | ((d00 <= 0) & (d01 <= 0) & (d02 <= 0))
            if not inside.any():
                continue
            den = d00 + d01 + d02
            den = np.where(np.abs(den) < 1e-12, 1e-12, den)
            z = (d01 / den) * za[i] + (d02 / den) * zb[i] + (1 - d01 / den - d02 / den) * zc[i]
            sub = zbuf[y0:y1, x0:x1]
            upd = inside & (z < sub)
            if not upd.any():
                continue
            if alpha >= 1.0:
                sub[upd] = z[upd]
                img[y0:y1, x0:x1][upd] = col[i]
            else:
                sub[upd] = z[upd]
                img[y0:y1, x0:x1][upd] = img[y0:y1, x0:x1][upd] * (1 - alpha) + col[i] * alpha

    for name, tris in ghost or []:
        draw(tris, (40, 40, 48), bright=1.0, alpha=0.45)
    for name, tris in parts:
        draw(tris, PALETTE.get(name, (150, 150, 150)))

    im = Image.fromarray(img.astype(np.uint8))
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
    for name, tris in parts:
        c = tris.reshape(-1, 3).mean(axis=0)
        sx, sy, _ = project(np.array([c]))
        d.ellipse([sx[0] - 6, sy[0] - 6, sx[0] + 6, sy[0] + 6], fill=PALETTE.get(name, (200, 200, 200)), outline=(255, 255, 255))
        d.text((sx[0] + 10, sy[0] - 12), name, fill=(255, 255, 255), font=font)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(CAD, "*.stl")))
    parts = [(os.path.splitext(os.path.basename(f))[0], load_stl(f)) for f in files]
    target = np.array([0.0, 0.0, 40.0])

    views = {
        "front": (np.array([0.0, -420.0, 120.0]), target, (0, 0, 1)),     # looking along +Y
        "right": (np.array([420.0, 0.0, 120.0]), target, (0, 0, 1)),      # looking along -X
        "iso": (np.array([330.0, -330.0, 260.0]), target, (0, 0, 1)),
        "top": (np.array([0.0, 0.0, 460.0]), target, (0, 1, 0)),
    }
    for name, (eye, tgt, upv) in views.items():
        im = render(parts, eye, tgt, up=upv)
        im.save(os.path.join(OUT, f"canon_{name}.png"))
        print("wrote", name, flush=True)


if __name__ == "__main__":
    main()
