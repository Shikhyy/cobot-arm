#!/usr/bin/env python3
"""Render the whole STL set together, in their raw exported coordinates.

If the parts were exported from an assembly, they will line up. Each part gets
its own colour so the layout is readable.
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

PALETTE = [
    (206, 44, 32), (232, 118, 34), (242, 180, 48), (150, 190, 70),
    (60, 170, 150), (54, 130, 200), (120, 100, 210), (200, 90, 170),
    (120, 120, 128), (90, 94, 104), (200, 200, 205), (60, 62, 70),
    (240, 200, 120), (150, 200, 220), (210, 130, 90), (110, 170, 120),
    (180, 180, 190), (90, 130, 90), (170, 110, 90), (70, 110, 160),
]


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


def rotate(v, yaw, pitch):
    cy, sy = np.cos(yaw), np.sin(yaw)
    cp, sp = np.cos(pitch), np.sin(pitch)
    x = v[..., 0] * cy - v[..., 1] * sy
    y = v[..., 0] * sy + v[..., 1] * cy
    z = v[..., 2]
    x2 = x * cp - z * sp
    z2 = x * sp + z * cp
    return np.stack([x2, y, z2], axis=-1)


def render(parts, size=760, yaw=0.0, pitch=0.0, center=None, span=None, bg=(10, 10, 12), labels=False):
    v_all = []
    for _, tris, _ in parts:
        v_all.append(rotate(tris, yaw, pitch).reshape(-1, 3))
    allv = np.concatenate(v_all, axis=0)
    if center is None:
        center = (allv.min(axis=0) + allv.max(axis=0)) / 2
    if span is None:
        span = max(allv.max(axis=0) - allv.min(axis=0))
    scale = (size * 0.80) / span

    img = np.zeros((size, size, 3), dtype=np.float64)
    img[:] = bg
    zbuf = np.full((size, size), np.inf)

    light = np.array([0.35, 0.55, 0.76])
    light /= np.linalg.norm(light)

    for pi, (name, tris, color) in enumerate(parts):
        v = rotate(tris, yaw, pitch)
        p = (v - center) * scale
        p[..., 0] += size / 2
        p[..., 1] += size / 2
        a, b, c = p[:, 0], p[:, 1], p[:, 2]
        n = np.cross(b - a, c - a)
        ln = np.linalg.norm(n, axis=1)
        ln[ln == 0] = 1
        n = n / ln[:, None]
        lam = np.abs(n @ light)
        shade = (0.18 + 0.82 * lam)[:, None]
        col = np.clip(np.array(color, dtype=np.float64)[None, :] * shade, 0, 255)

        minx = np.clip(np.floor(p[:, :, 0].min(axis=1)), 0, size - 1).astype(int)
        maxx = np.clip(np.ceil(p[:, :, 0].max(axis=1)), 0, size - 1).astype(int)
        miny = np.clip(np.floor(p[:, :, 1].min(axis=1)), 0, size - 1).astype(int)
        maxy = np.clip(np.ceil(p[:, :, 1].max(axis=1)), 0, size - 1).astype(int)
        order = np.argsort(-(p[:, :, 2].mean(axis=1)))
        for i in order:
            x0, x1, y0, y1 = minx[i], maxx[i], miny[i], maxy[i]
            if x1 <= x0 or y1 <= y0:
                continue
            xs = np.arange(x0, x1 + 1)
            ys = np.arange(y0, y1 + 1)
            gx, gy = np.meshgrid(xs, ys)
            p0, p1, p2 = a[i], b[i], c[i]
            d00 = (p1[0] - p0[0]) * (gy - p0[1]) - (p1[1] - p0[1]) * (gx - p0[0])
            d01 = (p2[0] - p1[0]) * (gy - p1[1]) - (p2[1] - p1[1]) * (gx - p1[0])
            d02 = (p0[0] - p2[0]) * (gy - p2[1]) - (p0[1] - p2[1]) * (gx - p2[0])
            inside = ((d00 >= 0) & (d01 >= 0) & (d02 >= 0)) | ((d00 <= 0) & (d01 <= 0) & (d02 <= 0))
            if not inside.any():
                continue
            den = d00 + d01 + d02
            den = np.where(np.abs(den) < 1e-12, 1e-12, den)
            z = (d01 / den) * p0[2] + (d02 / den) * p1[2] + (1 - d01 / den - d02 / den) * p2[2]
            sub = zbuf[y0:y1 + 1, x0:x1 + 1]
            upd = inside & (z < sub)
            if not upd.any():
                continue
            sub[upd] = z[upd]
            img[y0:y1 + 1, x0:x1 + 1][upd] = col[i]

    im = Image.fromarray(img.astype(np.uint8))
    if labels:
        d = ImageDraw.Draw(im)
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
        except Exception:
            font = ImageFont.load_default()
        for pi, (name, tris, color) in enumerate(parts):
            v = rotate(tris, yaw, pitch)
            c = v.reshape(-1, 3).mean(axis=0)
            p = (c - center) * scale
            sx = p[0] + size / 2
            sy = -p[1] + size / 2
            d.ellipse([sx - 5, sy - 5, sx + 5, sy + 5], fill=color, outline=(255, 255, 255))
            d.text((sx + 8, sy - 7), f"{pi}:{name[:16]}", fill=(255, 255, 255), font=font)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(CAD, "*.stl")))
    parts = []
    for i, f in enumerate(files):
        parts.append((os.path.splitext(os.path.basename(f))[0], load_stl(f), PALETTE[i % len(PALETTE)]))

    views = [
        ("iso-a", 0.85, 0.42),
        ("iso-b", -0.9, 0.35),
        ("top", 0.0, 1.5708),
        ("front-xz", 0.0, 0.0),
        ("side-yz", 1.5708, 0.0),
    ]
    for name, yaw, pitch in views:
        im = render(parts, yaw=yaw, pitch=pitch, labels=True)
        im.save(os.path.join(OUT, f"assembly_{name}.png"))
        print("wrote", name)


if __name__ == "__main__":
    main()
