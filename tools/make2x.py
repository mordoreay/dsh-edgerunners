#!/usr/bin/env python3
"""Build @2x WebP variants for the sprite frames.

The original mod ships 420x372 PNG frames. On HiDPI screens and at 200-400 % scale the
browser has to upscale them, which looks soft. This script produces a 2x WebP next to
every PNG (`<frame>@2x.webp`), which the client requests through `srcset` only when the
screen actually needs it — the PNG stays the canonical asset and the fallback.

Usage:
    python tools/make2x.py [--quality 80] [--force] [--root assets/pet]
"""

from __future__ import annotations

import argparse
import glob
import os
import sys

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))


def build_one(source: str, quality: int, method: int, force: bool) -> tuple[bool, int]:
    target = source[:-4] + "@2x.webp"
    if not force and os.path.exists(target) and os.path.getmtime(target) >= os.path.getmtime(source):
        return False, 0
    with Image.open(source) as opened:
        image = opened.convert("RGBA")
    size = (image.width * 2, image.height * 2)
    upscaled = image.resize(size, Image.LANCZOS)
    upscaled = upscaled.filter(ImageFilter.UnsharpMask(radius=1.2, percent=55, threshold=2))
    upscaled.save(target, "WEBP", quality=quality, method=method)
    return True, os.path.getsize(target)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build @2x WebP sprite variants")
    parser.add_argument("--root", default=os.path.join(HERE, "..", "assets", "pet"))
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--method", type=int, default=4, help="WebP encoder effort 0-6")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    frames = sorted(glob.glob(os.path.join(root, "*", "*.png")))
    if not frames:
        print(f"no PNG frames under {root}", file=sys.stderr)
        return 1

    made = 0
    skipped = 0
    added = 0
    for source in frames:
        if source.endswith("@2x.png"):
            continue
        built, size = build_one(source, args.quality, args.method, args.force)
        if built:
            made += 1
            added += size
        else:
            skipped += 1

    print(f"frames: {len(frames)}, built: {made}, skipped: {skipped}, added: {added / 1048576:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
