#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "extension" / "icons"
BLUE = "#0B4F9C"
BLUE_LIGHT = "#1769B5"
ORANGE = "#ED6B24"
WHITE = "#FFFFFF"


def create_icon(size: int) -> Image.Image:
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(left: float, top: float, right: float, bottom: float) -> tuple[int, int, int, int]:
        return tuple(round(value * canvas_size) for value in (left, top, right, bottom))

    inset = round(canvas_size * 0.035)
    draw.rounded_rectangle(
        (inset, inset, canvas_size - inset, canvas_size - inset),
        radius=round(canvas_size * 0.22),
        fill=BLUE,
    )
    draw.rounded_rectangle(
        box(0.09, 0.09, 0.91, 0.48),
        radius=round(canvas_size * 0.16),
        fill=BLUE_LIGHT,
    )

    stroke = max(scale * 2, round(canvas_size * 0.075))
    draw.line(box(0.28, 0.23, 0.28, 0.75), fill=WHITE, width=stroke)
    draw.arc(box(0.24, 0.22, 0.61, 0.52), start=-90, end=90, fill=WHITE, width=stroke)
    draw.arc(box(0.24, 0.46, 0.64, 0.77), start=-90, end=90, fill=WHITE, width=stroke)

    arrow_stroke = max(scale * 2, round(canvas_size * 0.065))
    draw.line(box(0.74, 0.28, 0.74, 0.70), fill=ORANGE, width=arrow_stroke)
    draw.polygon(
        [
            (round(canvas_size * 0.59), round(canvas_size * 0.63)),
            (round(canvas_size * 0.89), round(canvas_size * 0.63)),
            (round(canvas_size * 0.74), round(canvas_size * 0.82)),
        ],
        fill=ORANGE,
    )

    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        create_icon(size).save(OUTPUT / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
