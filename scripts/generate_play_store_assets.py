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


def _generate_feature_graphic(
    icon_path: Path,
    bg_path: Path,
    output_path: Path,
    width: int = 1024,
    height: int = 500,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(bg_path) as bg, Image.open(icon_path) as icon:
        bg = bg.convert("RGBA")
        icon = icon.convert("RGBA")

        # Resize background to 1024x500 (cover style)
        bg_ratio = bg.width / bg.height
        target_ratio = width / height

        if bg_ratio > target_ratio:
            # Source is wider, crop left/right
            new_width = int(bg.height * target_ratio)
            offset = (bg.width - new_width) // 2
            bg = bg.crop((offset, 0, offset + new_width, bg.height))
        else:
            # Source is taller, crop top/bottom
            new_height = int(bg.width / target_ratio)
            offset = (bg.height - new_height) // 2
            bg = bg.crop((0, offset, bg.width, offset + new_height))

        bg = bg.resize((width, height), resample=Image.Resampling.LANCZOS)

        # Resize icon to fit in the feature graphic (e.g., 40% of height)
        icon_size = int(height * 0.5)
        icon = icon.resize((icon_size, icon_size), resample=Image.Resampling.LANCZOS)

        # Paste icon in the center
        pos = ((width - icon_size) // 2, (height - icon_size) // 2)
        bg.alpha_composite(icon, pos)

        # Save as PNG (Play Console allows up to 15MB)
        bg.save(output_path, format="PNG", optimize=True)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]

    src_icon = repo_root / "assets" / "images" / "icon.png"
    src_bg = repo_root / "assets" / "images" / "android-icon-background.png"
    out_icon = repo_root / "store" / "assets" / "play-icon-512.png"
    out_feature = repo_root / "store" / "assets" / "play-feature-1024x500.png"

    if not src_icon.exists():
        raise SystemExit(f"Not found: {src_icon}")

    # Generate 512x512 icon
    _resize_square(src_icon, out_icon, 512)
    size_kb = out_icon.stat().st_size / 1024
    print(f"Wrote: {out_icon} ({size_kb:.1f} KB)")

    # Generate feature graphic
    if src_bg.exists():
        _generate_feature_graphic(src_icon, src_bg, out_feature)
        size_kb = out_feature.stat().st_size / 1024
        print(f"Wrote: {out_feature} ({size_kb:.1f} KB)")
    else:
        print(f"Skipped feature graphic: {src_bg} not found")


if __name__ == "__main__":
    main()
