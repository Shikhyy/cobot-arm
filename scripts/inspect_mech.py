#!/usr/bin/env python3
"""Render the arm mechanism with the enclosure hidden, to expose the joint chain."""
import os
import sys
import glob

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_canon import load_stl, render, CAD  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".cad-inspect")

HIDE = {"Alt_Kasa", "Alt_Kapak", "Tabla_Alt"}


def main():
    files = sorted(glob.glob(os.path.join(CAD, "*.stl")))
    allparts = [(os.path.splitext(os.path.basename(f))[0], load_stl(f)) for f in files]

    mechanisms = [p for p in allparts if p[0] not in HIDE]
    small = [p for p in allparts if np.linalg.norm(p[1].reshape(-1, 3).mean(axis=0)) < 45]

    jobs = [
        ("mech_front", mechanisms, (0.0, -420.0, 40.0), (0, 0, 40.0), (0, 0, 1), 1100),
        ("mech_iso", mechanisms, (330.0, -330.0, 230.0), (0, 0, 40.0), (0, 0, 1), 1100),
        ("cluster_iso", small, (170.0, -170.0, 120.0), (0, 0, 0), (0, 0, 1), 1100),
        ("cluster_front", small, (0.0, -220.0, 0.0), (0, 0, 0), (0, 0, 1), 1100),
    ]
    for name, parts, eye, tgt, up, size in jobs:
        im = render(parts, eye, tgt, size=size, up=up)
        im.save(os.path.join(OUT, f"{name}.png"))
        print("wrote", name, flush=True)


if __name__ == "__main__":
    main()
