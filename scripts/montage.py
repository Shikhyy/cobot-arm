#!/usr/bin/env python3
"""Montage the per-part inspection renders into a couple of contact sheets."""
import os
import glob
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".cad-inspect")
OUT = os.path.join(ROOT, ".cad-inspect")

files = sorted(glob.glob(os.path.join(SRC, "*.png")))
files = [f for f in files if not os.path.basename(f).startswith("assembly")]
print(len(files), "parts")

COLS = 2
W = 900
CH = 260
for page in range(0, len(files), 6):
    chunk = files[page:page + 6]
    rows = (len(chunk) + COLS - 1) // COLS
    sheet = Image.new("RGB", (W, CH * rows), (18, 18, 20))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
    except Exception:
        font = ImageFont.load_default()
    for i, f in enumerate(chunk):
        im = Image.open(f).convert("RGB").resize((W, CH))
        r, c = divmod(i, COLS)
        sheet.paste(im, (0, r * CH))
        d.text((8, r * CH + 6), os.path.basename(f)[:-4], fill=(255, 220, 120), font=font)
    out = os.path.join(OUT, f"sheet_{page // 6}.png")
    sheet.save(out)
    print("wrote", out)
