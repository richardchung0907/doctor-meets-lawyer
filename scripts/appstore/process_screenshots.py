#!/usr/bin/env python3
"""
Process & Resize Raw Screenshots for App Store 6.5" Display (1242 x 2688 px)
=============================================================================
Uses Pillow (PIL) to convert and fit all raw screenshots from appScreenshots/raw/
into 1242x2688 PNG images in appScreenshots/processed_65/ with zero distortion.
"""

import os
import sys
from PIL import Image, ImageOps

# Bootstrap directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)

# Fix Windows console UTF-8 printing
if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

RAW_DIR = os.path.join("appScreenshots", "raw")
OUT_DIR = os.path.join("appScreenshots", "processed_65")
os.makedirs(OUT_DIR, exist_ok=True)

# App Store 6.5" display target resolution: 1242 x 2688
TARGET_SIZE = (1242, 2688)

def process_images():
    print("==========================================================")
    print("  Processing Raw Screenshots -> 6.5\" Display (1242x2688) ")
    print("==========================================================\n")

    files = [f for f in os.listdir(RAW_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    files.sort()

    processed_paths = []
    for filename in files:
        raw_path = os.path.join(RAW_DIR, filename)
        out_filename = os.path.splitext(filename)[0] + ".png"
        out_path = os.path.join(OUT_DIR, out_filename)

        with Image.open(raw_path) as img:
            # Convert to RGB if needed
            img = img.convert("RGB")
            orig_w, orig_h = img.size
            
            # Use ImageOps.fit with LANCZOS resampling to fit exact 1242x2688 without stretching or distortion
            processed_img = ImageOps.fit(
                img,
                TARGET_SIZE,
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5)
            )
            
            # Save as PNG
            processed_img.save(out_path, format="PNG", quality=95)
            file_size = os.path.getsize(out_path)
            
            print(f" ✓ Processed '{filename}' ({orig_w}x{orig_h}) -> '{out_filename}' ({TARGET_SIZE[0]}x{TARGET_SIZE[1]} PNG, {file_size} bytes)")
            processed_paths.append(out_path)

    print(f"\nSuccessfully generated {len(processed_paths)} high-res 6.5\" screenshot(s) in {OUT_DIR}.")
    return processed_paths

if __name__ == "__main__":
    process_images()
