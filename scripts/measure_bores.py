#!/usr/bin/env python3
"""Recover joint bore centres + diameters from the real STL geometry.

Method: rasterise an orthographic silhouette of a part, find enclosed
background regions (the through-holes), then map their centroids back to
model coordinates using the known orthographic scale and bounding box.
"""
import os
import glob
import sys

import numpy as np
import trimesh
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAD = os.path.join(ROOT, "Robotic+Arm+with+Servo+&+Arduino")

SIZE = 1400
MARGIN = 0.06


def raster(part, axis, flip):
    """axis: 'y' -> project to (X, Z); 'x' -> (Y, Z); 'z' -> (X, Y)."""
    mesh = trimesh.load(os.path.join(CAD, part + ".stl"), process=False)
    v = mesh.vertices
    f = mesh.faces
    if axis == "y":
        a2, b2 = v[:, 0], v[:, 2]
    elif axis == "x":
        a2, b2 = v[:, 1], v[:, 2]
    else:
        a2, b2 = v[:, 0], v[:, 1]
    lo = np.array([a2.min(), b2.min()])
    hi = np.array([a2.max(), b2.max()])
    span = max(hi - lo)
    scale = (SIZE * (1 - 2 * MARGIN)) / span
    off = np.array([SIZE / 2, SIZE / 2]) - ((lo + hi) / 2) * scale

    P = np.stack([a2, b2], axis=1) * scale + off
    A, B, C = P[f[:, 0]], P[f[:, 1]], P[f[:, 2]]
    img = np.zeros((SIZE, SIZE), dtype=bool)
    for i in range(len(A)):
        x0 = int(max(min(A[i][0], B[i][0], C[i][0]), 0)); x1 = int(min(max(A[i][0], B[i][0], C[i][0]), SIZE - 1)) + 1
        y0 = int(max(min(A[i][1], B[i][1], C[i][1]), 0)); y1 = int(min(max(A[i][1], B[i][1], C[i][1]), SIZE - 1)) + 1
        if x1 <= x0 or y1 <= y0:
            continue
        xs = np.arange(x0, x1); ys = np.arange(y0, y1)
        gx, gy = np.meshgrid(xs, ys)
        p0, p1, p2 = A[i], B[i], C[i]
        d0 = (p1[0] - p0[0]) * (gy - p0[1]) - (p1[1] - p0[1]) * (gx - p0[0])
        d1 = (p2[0] - p1[0]) * (gy - p1[1]) - (p2[1] - p1[1]) * (gx - p1[0])
        d2 = (p0[0] - p2[0]) * (gy - p2[1]) - (p0[1] - p2[1]) * (gx - p2[0])
        inside = ((d0 >= 0) & (d1 >= 0) & (d2 >= 0)) | ((d0 <= 0) & (d1 <= 0) & (d2 <= 0))
        if inside.any():
            img[y0:y1, x0:x1] |= inside
    return img, scale, off, (lo, hi)


def holes(img, min_area=12):
    """Flood fill background from the border; anything left unfilled is a hole."""
    from collections import deque
    h, w = img.shape
    seen = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not img[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not img[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not img[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                dq.append((ny, nx))
    hole = ~img & ~seen
    # label components
    lab = np.zeros((h, w), dtype=int)
    cur = 0
    out = []
    for y in range(h):
        for x in range(w):
            if hole[y, x] and lab[y, x] == 0:
                cur += 1
                dq = deque([(y, x)])
                lab[y, x] = cur
                pix = []
                while dq:
                    cy, cx = dq.popleft()
                    pix.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and hole[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = cur
                            dq.append((ny, nx))
                if len(pix) >= min_area:
                    ys = np.array([p[0] for p in pix]); xs = np.array([p[1] for p in pix])
                    out.append({"cx": xs.mean(), "cy": ys.mean(), "area": len(pix), "w": xs.max() - xs.min() + 1, "h": ys.max() - ys.min() + 1})
    return out


def run(part, axis):
    img, scale, off, (lo, hi) = raster(part, axis, False)
    res = holes(img)
    print(f"\n=== {part}  (bore axis along local {axis.upper()}) ===")
    for r in sorted(res, key=lambda r: -r["area"]):
        model_u = (r["cx"] - off[0]) / scale
        model_v = (r["cy"] - off[1]) / scale
        dia_u = r["w"] / scale
        dia_v = r["h"] / scale
        print(f"   centre=({model_u:8.2f},{model_v:8.2f})  size={dia_u:6.2f} x {dia_v:6.2f}  (px {r['w']}x{r['h']})")


if __name__ == "__main__":
    targets = [
        ("Alt_Kol", "y"), ("On_Kol", "y"), ("El", "z"), ("El_Ust", "z"),
        ("Bilek", "y"), ("Servo_Cable_Holder", "y"), ("Jack_Cover", "y"),
        ("Alt_Govde", "z"), ("Mil_1", "z"), ("Mil_2", "z"), ("Mil_3", "z"),
        ("Parmak X 2", "y"), ("Parmak_2 X 2", "y"), ("Parmak_Disli X 2", "y"),
        ("Disli", "z"), ("Mil_Disli", "z"), ("Servo_Disli", "z"),
        ("Alt_Kasa", "z"), ("Alt_Kapak", "z"), ("Tabla_Alt", "z"),
    ]
    only = sys.argv[1:]
    for part, axis in targets:
        if only and part not in only:
            continue
        try:
            run(part, axis)
        except Exception as e:  # noqa: BLE001
            print(f"\n=== {part} === FAILED {e}")
