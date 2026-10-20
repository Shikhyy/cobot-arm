#!/usr/bin/env python3
"""Software-render each STL part to PNG so the assembly can be inspected offline.

Pure numpy + Pillow. Flat shading with a z-buffer, three orthographic-ish
viewpoints (front / side / iso). Used to work out how the individual
3D-printed parts fit together before the GLB assembly is authored.
"""
import os
import struct
import sys
import glob

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAD = os.path.join(ROOT, "Robotic+Arm+with+Servo+&+Arduino")
OUT = os.path.join(ROOT, ".cad-inspect")


def load_stl(path):
    with open(path, "rb") as fh:
        head = fh.read(84)
        count = struct.unpack("<I", head[80:84])[0]
        data = fh.read()
    tris = np.zeros((count, 3, 3), dtype=np.float64)
    for i in range(count):
        off = i * 50
        vals = struct.unpack("<12f", data[off:off + 48])
        n = np.array(vals[0:3], dtype=np.float64)
        a = np.array(vals[3:6], dtype=np.float64)
        b = np.array(vals[6:9], dtype=np.float64)
        c = np.array(vals[9:12], dtype=np.float64)
        tris[i] = (a, b, c)
    return tris, n


def rotate(v, yaw, pitch):
    cy, sy = np.cos(yaw), np.sin(yaw)
    cz, sz = np.cos(pitch), np.sin(pitch)
    x = v[..., 0] * cy - v[..., 1] * sy
    y = v[..., 0] * sy + v[..., 1] * cy
    z = v[..., 2]
    x2 = x * cz - z * sz
    z2 = x * sz + z * cz
    return np.stack([x2, y, z2], axis=-1)


def render(tris, size=420, yaw=0.6, pitch=0.45, bg=(12, 12, 14)):
    v = rotate(tris, yaw, pitch)
    lo = v.reshape(-1, 3).min(axis=0)
    hi = v.reshape(-1, 3).max(axis=0)
    span = np.maximum(hi - lo, 1e-6)
    scale = (size * 0.82) / span.max()
    center = (lo + hi) / 2
    p = (v - center) * scale
    p[..., 1] *= -1
    p[..., 0] += size / 2
    p[..., 1] += size / 2

    img = np.zeros((size, size, 3), dtype=np.float64)
    img[:] = bg
    zbuf = np.full((size, size), np.inf)

    a, b, c = p[:, 0], p[:, 1], p[:, 2]
    e1 = b - a
    e2 = c - a
    n = np.cross(e1, e2)
    ln = np.linalg.norm(n, axis=1)
    ln[ln == 0] = 1
    n = n / ln[:, None]

    light = np.array([0.4, 0.75, 0.55])
    light = light / np.linalg.norm(light)
    lam = np.abs(n @ light)
    base = np.array([196, 44, 34])
    shade = (0.22 + 0.78 * lam)[:, None]
    color = np.clip(base[None, :] * shade, 0, 255)

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
        w0 = d01 / den
        w1 = d02 / den
        w2 = 1 - w0 - w1
        z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
        sub = zbuf[y0:y1 + 1, x0:x1 + 1]
        upd = inside & (z < sub)
        if not upd.any():
            continue
        sub[upd] = z[upd]
        img[y0:y1 + 1, x0:x1 + 1][upd] = color[i]

    return Image.fromarray(img.astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(CAD, "*.stl")))
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        if only and not any(o.lower() in name.lower() for o in only):
            continue
        tris, _ = load_stl(f)
        views = [("front", 0.0, 0.0), ("side", 1.5708, 0.0), ("iso", 0.7, 0.45)]
        imgs = [render(tris, yaw=y, pitch=p) for _, y, p in views]
        sheet = Image.new("RGB", (sum(i.width for i in imgs), max(i.height for i in imgs)), (12, 12, 14))
        x = 0
        for im in imgs:
            sheet.paste(im, (x, 0))
            x += im.width
        sheet.save(os.path.join(OUT, f"{name}.png"))
        print("wrote", name, sheet.size)


if __name__ == "__main__":
    main()
