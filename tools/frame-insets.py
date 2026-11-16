#!/usr/bin/env python3
"""Measure the transparent right padding of the sprite frames.

The client shifts a frame to the right by the hero's inset so the character stands next to
the window edge instead of floating on the frame's transparent margin. This script prints
the percentiles per hero; the 80th percentile is what `SPRITE_INSETS` in `client.js` uses
(most frames then sit 2-8 px from the edge, only the widest poses are clipped a little).

Usage:
    python tools/frame-insets.py
"""

from __future__ import annotations

import glob
import os

from PIL import Image

FRAME_WIDTH = 420
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "assets", "pet")


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    return ordered[min(len(ordered) - 1, int(len(ordered) * fraction))]


def main() -> int:
    for hero in sorted(os.listdir(ROOT)):
        directory = os.path.join(ROOT, hero)
        if not os.path.isdir(directory):
            continue
        pads: list[float] = []
        for path in glob.glob(os.path.join(directory, "*.png")):
            with Image.open(path) as opened:
                box = opened.convert("RGBA").getbbox()
            if box:
                pads.append((FRAME_WIDTH - box[2]) / FRAME_WIDTH)
        if not pads:
            continue
        print(
            f"{hero:6} frames={len(pads):3}  p50={percentile(pads, 0.5):.3f}  "
            f"p80={percentile(pads, 0.8):.3f}  p90={percentile(pads, 0.9):.3f}  "
            f"min={min(pads):.3f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
