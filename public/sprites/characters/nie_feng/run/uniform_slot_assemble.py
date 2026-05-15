#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from PIL import Image

DEFAULT_DIRECTIONS = [
    "south",
    "south-east",
    "east",
    "north-east",
    "north",
    "north-west",
    "west",
    "south-west",
]


def parse_hex(value: str) -> tuple[int, int, int]:
    raw = value.strip().lstrip("#")
    return tuple(int(raw[i : i + 2], 16) for i in (0, 2, 4))


def dist(color: tuple[int, int, int], key: tuple[int, int, int]) -> float:
    return math.sqrt(sum((color[i] - key[i]) ** 2 for i in range(3)))


def remove_edge_key(image: Image.Image, key: tuple[int, int, int], threshold: float) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    seen = bytearray(w * h)
    stack: list[tuple[int, int]] = []
    for x in range(w):
        stack.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        stack.extend([(0, y), (w - 1, y)])
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if seen[idx]:
            continue
        seen[idx] = 1
        r, g, b, a = pixels[x, y]
        if a <= 8 or dist((r, g, b), key) > threshold:
            continue
        pixels[x, y] = (r, g, b, 0)
        if x:
            stack.append((x - 1, y))
        if x + 1 < w:
            stack.append((x + 1, y))
        if y:
            stack.append((x, y - 1))
        if y + 1 < h:
            stack.append((x, y + 1))
    return rgba


def fit_cell(slot: Image.Image, cell: int, key: tuple[int, int, int], residue_threshold: float) -> Image.Image:
    cleaned = remove_edge_key(slot, key, 105.0)
    bbox = cleaned.getbbox()
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    if not bbox:
        return out
    crop = cleaned.crop(bbox)
    margin = max(2, cell // 16)
    scale = min((cell - margin) / crop.width, (cell - margin) / crop.height, 1.0)
    if scale != 1.0:
        crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.NEAREST)
    out.alpha_composite(crop, ((cell - crop.width) // 2, (cell - crop.height) // 2))
    px = out.load()
    for y in range(cell):
        for x in range(cell):
            r, g, b, a = px[x, y]
            if a > 0 and dist((r, g, b), key) <= residue_threshold:
                px[x, y] = (r, g, b, 0)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--action", required=True)
    parser.add_argument("--directions", default=",".join(DEFAULT_DIRECTIONS))
    parser.add_argument("--columns", type=int, default=6)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--key-color", default="#00ff00")
    parser.add_argument("--residue-threshold", type=float, default=72.0)
    args = parser.parse_args()

    key = parse_hex(args.key_color)
    directions = [part.strip() for part in args.directions.split(",") if part.strip()]
    input_dir = Path(args.input_dir)
    frames_dir = Path(args.frames_dir)
    atlas = Image.new("RGBA", (args.columns * args.cell, len(directions) * args.cell), (0, 0, 0, 0))
    metadata = {"cell": args.cell, "columns": args.columns, "rows": len(directions), "action": args.action, "directions": directions, "rows_meta": []}

    for row, direction in enumerate(directions):
        source = input_dir / f"{args.action}-{direction}.png"
        with Image.open(source) as image:
            rgba = image.convert("RGBA")
            slot_width = rgba.width // args.columns
            row_dir = frames_dir / f"{args.action}-{direction}"
            row_dir.mkdir(parents=True, exist_ok=True)
            for col in range(args.columns):
                slot = rgba.crop((col * slot_width, 0, (col + 1) * slot_width, rgba.height))
                frame = fit_cell(slot, args.cell, key, args.residue_threshold)
                frame.save(row_dir / f"{col:02d}.png")
                atlas.alpha_composite(frame, (col * args.cell, row * args.cell))
        metadata["rows_meta"].append({"row": row, "action": args.action, "direction": direction, "frames": args.columns})

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output)
    Path(args.metadata).write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
