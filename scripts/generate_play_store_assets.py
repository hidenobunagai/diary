from __future__ import annotations

from pathlib import Path

from PIL import Image


def _resize_square(input_path: Path, output_path: Path, size: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(input_path) as im:
        # Ensure consistent output (Play Console accepts PNG/JPEG)
        im = im.convert("RGBA")

        # High quality downscale
        im = im.resize((size, size), resample=Image.Resampling.LANCZOS)

        # Keep alpha if present
        im.save(output_path, format="PNG", optimize=True)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]

    src_icon = repo_root / "assets" / "images" / "icon.png"
    out_icon = repo_root / "store" / "assets" / "play-icon-512.png"

    if not src_icon.exists():
        raise SystemExit(f"Not found: {src_icon}")

    _resize_square(src_icon, out_icon, 512)

    size_kb = out_icon.stat().st_size / 1024
    print(f"Wrote: {out_icon} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
