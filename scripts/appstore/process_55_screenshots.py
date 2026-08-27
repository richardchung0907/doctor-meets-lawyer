#!/usr/bin/env python3
"""
Process & Resize Raw Screenshots for App Store 5.5" Display (1242 x 2208 px)
=============================================================================
Uses Pillow (PIL) LANCZOS resampling to convert all raw screenshots from appScreenshots/raw/
into exact 1242x2208 PNG images in appScreenshots/processed_55/ with zero distortion.
"""

import os
import sys
from PIL import Image, ImageOps

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)

if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

RAW_DIR = os.path.join("appScreenshots", "raw")
OUT_DIR = os.path.join("appScreenshots", "processed_55")
os.makedirs(OUT_DIR, exist_ok=True)

# App Store 5.5" display target resolution: 1242 x 2208
TARGET_SIZE = (1242, 2208)

def main():
    print("==========================================================")
    print("  Processing Raw Screenshots -> 5.5\" Display (1242x2208) ")
    print("==========================================================\n")

    files = [f for f in os.listdir(RAW_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    files.sort()

    processed_paths = []
    for filename in files:
        raw_path = os.path.join(RAW_DIR, filename)
        out_filename = os.path.splitext(filename)[0] + ".png"
        out_path = os.path.join(OUT_DIR, out_filename)

        with Image.open(raw_path) as img:
            img = img.convert("RGB")
            orig_w, orig_h = img.size

            processed_img = ImageOps.fit(
                img,
                TARGET_SIZE,
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5)
            )

            processed_img.save(out_path, format="PNG", quality=95)
            file_size = os.path.getsize(out_path)

            print(f" ✓ Processed '{filename}' ({orig_w}x{orig_h}) -> '{out_filename}' ({TARGET_SIZE[0]}x{TARGET_SIZE[1]} PNG, {file_size} bytes)")
            processed_paths.append(out_path)

    print(f"\nSuccessfully generated {len(processed_paths)} high-res 5.5\" screenshot(s) in {OUT_DIR}.")

if __name__ == "__main__":
    main()
