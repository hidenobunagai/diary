from __future__ import annotations

import datetime as _dt
import os
import shutil
from collections import deque
from pathlib import Path

from PIL import Image


def _is_edge_white(r: int, g: int, b: int, a: int, thr: int) -> bool:
    # Only treat fully/mostly opaque whites as removable background.
    if a <= 0:
        return False
    return r >= 255 - thr and g >= 255 - thr and b >= 255 - thr


def _is_light_gray(
    r: int,
    g: int,
    b: int,
    a: int,
    *,
    min_value: int,
    max_delta: int,
    min_alpha: int,
) -> bool:
    if a < min_alpha:
        return False
    mn = min(r, g, b)
    mx = max(r, g, b)
    if mn < min_value:
        return False
    return (mx - mn) <= max_delta


def fill_transparent_with_color(path: Path, bg_color: tuple[int, int, int]) -> dict:
    """Fill fully transparent pixels with a specific solid color (solidifying the transparent area).
    This prevents 'white bleeding' when an image with alpha is scaled or converted.
    """
    img = Image.open(path)
    img_rgba = img.convert("RGBA")
    px = img_rgba.load()
    width, height = img_rgba.size

    filled = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (*bg_color, 0)
                filled += 1

    img_rgba.save(path, format="PNG", optimize=True)
    return {"path": str(path), "filled_pixels": filled}


def peel_and_recolor_edge(
    path: Path,
    bg_color: tuple[int, int, int],
    iterations: int = 15,
    threshold: int = 130,
) -> dict:
    """A more aggressive way to remove white edges:
    1. Temporarily treat the specific background color as transparent.
    2. Peel off near-white/light-gray pixels that are adjacent to transparency.
    3. Fill transparency back with the background color.
    """
    img = Image.open(path)
    img_rgba = img.convert("RGBA")
    width, height = img_rgba.size
    px = img_rgba.load()

    # Step 1: Flood fill the background color to transparency from corners
    to_transparent: list[tuple[int, int]] = []
    visited = bytearray(width * height)
    q: deque[tuple[int, int]] = deque()

    # Corner seeds
    for start_pos in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]:
        sx, sy = start_pos
        idx = sy * width + sx
        if not visited[idx]:
            r, g, b, a = px[sx, sy]
            if (r, g, b) == bg_color:
                q.append((sx, sy))
                visited[idx] = 1

    neighbors = ((-1, 0), (1, 0), (0, -1), (0, 1))
    while q:
        cx, cy = q.popleft()
        r, g, b, a = px[cx, cy]
        px[cx, cy] = (r, g, b, 0)  # Make it transparent temporarily

        for dx, dy in neighbors:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < width and 0 <= ny < height:
                nidx = ny * width + nx
                if not visited[nidx]:
                    nr, ng, nb, na = px[nx, ny]
                    if (nr, ng, nb) == bg_color:
                        visited[nidx] = 1
                        q.append((nx, ny))

    # Step 2: Peel light gray edges
    cleared_this_step = 0
    peel_neighbors = (
        (-1, -1),
        (0, -1),
        (1, -1),
        (-1, 0),
        (1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
    )

    for _ in range(iterations):
        to_clear = []
        for y in range(height):
            for x in range(width):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue

                if r >= threshold and g >= threshold and b >= threshold:
                    for dx, dy in peel_neighbors:
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < width and 0 <= ny < height:
                            if px[nx, ny][3] == 0:
                                to_clear.append((x, y))
                                break
        if not to_clear:
            break
        for tx, ty in to_clear:
            px[tx, ty] = (*bg_color, 0)
        cleared_this_step += len(to_clear)

    # Step 3: Fill all transparency back with bg_color (solid)
    for y in range(height):
        for x in range(width):
            if px[x, y][3] == 0:
                px[x, y] = (*bg_color, 255)

    img_rgba.convert("RGB").save(path, format="PNG", optimize=True)
    return {
        "path": str(path),
        "cleared_pixels": cleared_this_step,
        "mode": "peel-and-recolor",
    }


def peel_light_gray_border_transparent(
    path: Path,
    *,
    iterations: int = 6,
    min_value: int = 160,
    max_delta: int = 80,
    min_alpha: int = 20,
    neighbor_alpha: int = 8,
) -> dict:
    """Remove a thin light-gray border by repeatedly clearing pixels that touch transparency.

    This targets faint outlines that are not a single connected component (e.g., antialiased
    rings around a logo). It only clears pixels that are both light-gray-ish and adjacent to
    already-transparent pixels.
    """

    img = Image.open(path)
    img_rgba = img.convert("RGBA")
    width, height = img_rgba.size
    px = img_rgba.load()

    # Limit work to the alpha bounding box (fast on large images)
    alpha = img_rgba.split()[3]
    bbox = alpha.getbbox()  # (left, upper, right, lower) or None
    if bbox is None:
        return {
            "path": str(path),
            "size": f"{width}x{height}",
            "cleared_pixels": 0,
            "iterations": 0,
            "min_value": min_value,
            "max_delta": max_delta,
            "min_alpha": min_alpha,
            "format": "PNG" if path.suffix.lower() != ".webp" else "WEBP",
            "mode": "peel-light-gray",
        }

    left, upper, right, lower = bbox
    # Expand by 1px so we can detect adjacency to transparency properly
    left = max(0, left - 1)
    upper = max(0, upper - 1)
    right = min(width, right + 1)
    lower = min(height, lower + 1)

    neighbors = (
        (-1, -1),
        (0, -1),
        (1, -1),
        (-1, 0),
        (1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
    )

    cleared_total = 0
    it_done = 0

    for _ in range(iterations):
        it_done += 1
        to_clear: list[tuple[int, int]] = []

        for y in range(upper, lower):
            for x in range(left, right):
                r, g, b, a = px[x, y]
                if a < min_alpha:
                    continue
                if not _is_light_gray(
                    r,
                    g,
                    b,
                    a,
                    min_value=min_value,
                    max_delta=max_delta,
                    min_alpha=min_alpha,
                ):
                    continue

                # Only peel if this pixel touches transparency
                touches_transparent = False
                for dx, dy in neighbors:
                    nx = x + dx
                    ny = y + dy
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    if px[nx, ny][3] <= neighbor_alpha:
                        touches_transparent = True
                        break

                if touches_transparent:
                    to_clear.append((x, y))

        if not to_clear:
            it_done -= 1
            break

        for x, y in to_clear:
            r, g, b, a = px[x, y]
            if a != 0:
                px[x, y] = (r, g, b, 0)
                cleared_total += 1

    # Save in-place with alpha.
    ext = path.suffix.lower()
    if ext == ".webp":
        img_rgba.save(path, format="WEBP", lossless=True, quality=100, method=6)
        out_format = "WEBP"
    else:
        img_rgba.save(path, format="PNG", optimize=True)
        out_format = "PNG"

    return {
        "path": str(path),
        "size": f"{width}x{height}",
        "cleared_pixels": cleared_total,
        "iterations": it_done,
        "min_value": min_value,
        "max_delta": max_delta,
        "min_alpha": min_alpha,
        "format": out_format,
        "mode": "peel-light-gray",
    }


def make_edge_white_transparent(path: Path, threshold: int = 10) -> dict:
    img = Image.open(path)
    img_rgba = img.convert("RGBA")
    width, height = img_rgba.size
    px = img_rgba.load()

    visited = bytearray(width * height)
    q: deque[tuple[int, int]] = deque()

    def try_push(x: int, y: int) -> None:
        idx = y * width + x
        if visited[idx]:
            return
        r, g, b, a = px[x, y]
        if _is_edge_white(r, g, b, a, threshold):
            visited[idx] = 1
            q.append((x, y))

    # Seed with edge pixels that are near-white
    for x in range(width):
        try_push(x, 0)
        try_push(x, height - 1)
    for y in range(height):
        try_push(0, y)
        try_push(width - 1, y)

    cleared = 0
    # 8-connected flood fill
    neighbors = (
        (-1, -1),
        (0, -1),
        (1, -1),
        (-1, 0),
        (1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
    )

    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        if a != 0:
            px[x, y] = (r, g, b, 0)
            cleared += 1

        for dx, dy in neighbors:
            nx = x + dx
            ny = y + dy
            if nx < 0 or nx >= width or ny < 0 or ny >= height:
                continue
            idx = ny * width + nx
            if visited[idx]:
                continue
            nr, ng, nb, na = px[nx, ny]
            if _is_edge_white(nr, ng, nb, na, threshold):
                visited[idx] = 1
                q.append((nx, ny))

    # Save in-place with alpha.
    ext = path.suffix.lower()
    if ext == ".webp":
        img_rgba.save(path, format="WEBP", lossless=True, quality=100, method=6)
    else:
        img_rgba.save(path, format="PNG", optimize=True)

    return {
        "path": str(path),
        "size": f"{width}x{height}",
        "cleared_pixels": cleared,
        "threshold": threshold,
        "format": "WEBP" if ext == ".webp" else "PNG",
    }


def make_edge_recolor_robust(
    path: Path,
    replacement_rgb: tuple[int, int, int],
    iterations: int = 15,
) -> dict:
    """Robustly remove white/light edges around a motif and fill background.

    This is designed for icons with a dark background and a central motif that might
    have an antialiased white/light ring. It makes the background transparent,
    peels the edges of the motif, then restores the background.
    """
    img = Image.open(path).convert("RGBA")
    width, height = img.size
    px = img.load()

    # 1. Flood fill background from corners to make it transparent
    visited = bytearray(width * height)
    q: deque[tuple[int, int]] = deque()

    # Target color matches
    bg_r, bg_g, bg_b = replacement_rgb

    def is_target_bg(r: int, g: int, b: int) -> bool:
        return abs(r - bg_r) < 15 and abs(g - bg_g) < 15 and abs(b - bg_b) < 15

    for x in range(width):
        for y in (0, height - 1):
            idx = y * width + x
            if not visited[idx] and is_target_bg(*px[x, y][:3]):
                visited[idx] = 1
                q.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            idx = y * width + x
            if not visited[idx] and is_target_bg(*px[x, y][:3]):
                visited[idx] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height:
                nidx = ny * width + nx
                if not visited[nidx] and is_target_bg(*px[nx, ny][:3]):
                    visited[nidx] = 1
                    q.append((nx, ny))

    # Save to path temporarily for peeling
    img.save(path)

    # 2. Peel light gray edges (including the white line) using existing function
    res = peel_light_gray_border_transparent(
        path,
        iterations=iterations,
        min_value=130,  # Capture more antialiased pixels
        max_delta=100,
    )

    # 3. Restore background
    img = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", (width, height), (*replacement_rgb, 255))
    bg.paste(img, (0, 0), img)

    # Save as RGB for iOS compatibility
    bg.convert("RGB").save(path, format="PNG", optimize=True)

    res["mode"] = "robust-recolor"
    return res


def make_edge_white_recolor_png(
    path: Path,
    replacement_rgb: tuple[int, int, int],
    threshold: int = 10,
) -> dict:
    img = Image.open(path)
    img_rgba = img.convert("RGBA")
    width, height = img_rgba.size
    px = img_rgba.load()

    visited = bytearray(width * height)
    q: deque[tuple[int, int]] = deque()

    def try_push(x: int, y: int) -> None:
        idx = y * width + x
        if visited[idx]:
            return
        r, g, b, a = px[x, y]
        if _is_edge_white(r, g, b, a, threshold):
            visited[idx] = 1
            q.append((x, y))

    for x in range(width):
        try_push(x, 0)
        try_push(x, height - 1)
    for y in range(height):
        try_push(0, y)
        try_push(width - 1, y)

    rr, rg, rb = replacement_rgb
    cleared = 0
    neighbors = (
        (-1, -1),
        (0, -1),
        (1, -1),
        (-1, 0),
        (1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
    )

    while q:
        x, y = q.popleft()
        px[x, y] = (rr, rg, rb, 255)
        cleared += 1

        for dx, dy in neighbors:
            nx = x + dx
            ny = y + dy
            if nx < 0 or nx >= width or ny < 0 or ny >= height:
                continue
            idx = ny * width + nx
            if visited[idx]:
                continue
            nr, ng, nb, na = px[nx, ny]
            if _is_edge_white(nr, ng, nb, na, threshold):
                visited[idx] = 1
                q.append((nx, ny))

    # iOS icon compatibility: save as RGB (no alpha)
    img_rgba.convert("RGB").save(path, format="PNG", optimize=True)

    return {
        "path": str(path),
        "size": f"{width}x{height}",
        "cleared_pixels": cleared,
        "threshold": threshold,
        "format": "PNG",
        "mode": "edge-recolor",
    }


def make_largest_near_white_component_transparent(
    path: Path, threshold: int = 10
) -> dict:
    img = Image.open(path)
    img_rgba = img.convert("RGBA")
    width, height = img_rgba.size
    px = img_rgba.load()

    visited = bytearray(width * height)

    # 8-connected
    neighbors = (
        (-1, -1),
        (0, -1),
        (1, -1),
        (-1, 0),
        (1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
    )

    best_component: list[int] = []

    for y in range(height):
        row_base = y * width
        for x in range(width):
            idx = row_base + x
            if visited[idx]:
                continue

            r, g, b, a = px[x, y]
            if not _is_edge_white(r, g, b, a, threshold):
                visited[idx] = 1
                continue

            q: deque[tuple[int, int]] = deque()
            q.append((x, y))
            visited[idx] = 1
            component: list[int] = [idx]

            while q:
                cx, cy = q.popleft()
                for dx, dy in neighbors:
                    nx = cx + dx
                    ny = cy + dy
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    nidx = ny * width + nx
                    if visited[nidx]:
                        continue
                    nr, ng, nb, na = px[nx, ny]
                    if _is_edge_white(nr, ng, nb, na, threshold):
                        visited[nidx] = 1
                        q.append((nx, ny))
                        component.append(nidx)
                    else:
                        visited[nidx] = 1

            if len(component) > len(best_component):
                best_component = component

    cleared = 0
    for idx in best_component:
        x = idx % width
        y = idx // width
        r, g, b, a = px[x, y]
        if a != 0:
            px[x, y] = (r, g, b, 0)
            cleared += 1

    img_rgba.save(path, format="PNG", optimize=True)

    return {
        "path": str(path),
        "size": f"{width}x{height}",
        "cleared_pixels": cleared,
        "threshold": threshold,
        "format": "PNG",
        "mode": "largest-component",
    }


def make_largest_light_gray_component_transparent(
    path: Path,
    *,
    min_value: int = 160,
    max_delta: int = 80,
    min_alpha: int = 20,
) -> dict:
    img = Image.open(path)
    img_rgba = img.convert("RGBA")
    width, height = img_rgba.size
    px = img_rgba.load()

    visited = bytearray(width * height)
    neighbors = (
        (-1, -1),
        (0, -1),
        (1, -1),
        (-1, 0),
        (1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
    )

    best_component: list[int] = []

    for y in range(height):
        row_base = y * width
        for x in range(width):
            idx = row_base + x
            if visited[idx]:
                continue

            r, g, b, a = px[x, y]
            if not _is_light_gray(
                r,
                g,
                b,
                a,
                min_value=min_value,
                max_delta=max_delta,
                min_alpha=min_alpha,
            ):
                visited[idx] = 1
                continue

            q: deque[tuple[int, int]] = deque()
            q.append((x, y))
            visited[idx] = 1
            component: list[int] = [idx]

            while q:
                cx, cy = q.popleft()
                for dx, dy in neighbors:
                    nx = cx + dx
                    ny = cy + dy
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    nidx = ny * width + nx
                    if visited[nidx]:
                        continue
                    nr, ng, nb, na = px[nx, ny]
                    if _is_light_gray(
                        nr,
                        ng,
                        nb,
                        na,
                        min_value=min_value,
                        max_delta=max_delta,
                        min_alpha=min_alpha,
                    ):
                        visited[nidx] = 1
                        q.append((nx, ny))
                        component.append(nidx)
                    else:
                        visited[nidx] = 1

            if len(component) > len(best_component):
                best_component = component

    cleared = 0
    for idx in best_component:
        x = idx % width
        y = idx // width
        r, g, b, a = px[x, y]
        if a != 0:
            px[x, y] = (r, g, b, 0)
            cleared += 1

    img_rgba.save(path, format="PNG", optimize=True)

    return {
        "path": str(path),
        "size": f"{width}x{height}",
        "cleared_pixels": cleared,
        "min_value": min_value,
        "max_delta": max_delta,
        "min_alpha": min_alpha,
        "format": "PNG",
        "mode": "largest-light-gray",
    }


def fix_alpha_bleeding(path: Path, replacement_rgb: tuple[int, int, int]) -> dict:
    """Recolor fully transparent pixels to prevent color bleeding.

    When images are scaled, the RGB values of transparent pixels can 'bleed' into
    neighboring opaque pixels. If the transparent background is white, this
    results in a faint white halo.
    """
    img = Image.open(path).convert("RGBA")
    width, height = img.size
    px = img.load()
    cleared = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a == 0:
                if (r, g, b) != replacement_rgb:
                    px[x, y] = (*replacement_rgb, 0)
                    cleared += 1
    if cleared > 0:
        img.save(path, optimize=True)
    return {
        "path": str(path),
        "size": f"{width}x{height}",
        "cleared_pixels": cleared,
        "format": "PNG",
        "mode": "alpha-bleeding-fix",
    }


def main() -> None:
    repo = Path(__file__).resolve().parents[1]

    targets: list[Path] = []

    # Source assets (used by Expo config + future regenerations)
    targets += [
        repo / "assets" / "images" / "icon.png",
        repo / "assets" / "images" / "android-icon-foreground.png",
        repo / "assets" / "images" / "splash-icon.png",
    ]

    # Generated Android resources currently used by Gradle builds
    res = repo / "android" / "app" / "src" / "main" / "res"
    targets += list(res.glob("drawable-*/splashscreen_logo.png"))
    targets += list(res.glob("mipmap-*/ic_launcher*.webp"))

    # De-dup + only existing files
    uniq: list[Path] = []
    seen: set[Path] = set()
    for p in targets:
        if p in seen:
            continue
        seen.add(p)
        if p.exists() and p.is_file():
            uniq.append(p)

    if not uniq:
        raise SystemExit("No target images found.")

    backup_root = (
        repo / "tools" / "iconfix-backup" / _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    )
    backup_root.mkdir(parents=True, exist_ok=True)

    print(f"Found {len(uniq)} images. Backing up to: {backup_root}")

    for p in uniq:
        rel = p.relative_to(repo)
        dst = backup_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dst)

    print("Backup complete. Applying edge-white fixes...")

    results: list[dict] = []
    bg_color = (0x1F, 0x29, 0x37)  # #1f2937

    for p in uniq:
        try:
            # Always fix alpha bleeding first for RGBA images
            img_test = Image.open(p)
            if img_test.mode == "RGBA":
                results.append(fix_alpha_bleeding(p, bg_color))

            if p == (repo / "assets" / "images" / "icon.png"):
                results.append(make_edge_recolor_robust(p, bg_color, iterations=15))
                continue
            if p == (repo / "assets" / "images" / "splash-icon.png"):
                # The unwanted white border is often NOT edge-connected; remove the largest near-white component.
                results.append(make_largest_light_gray_component_transparent(p))
                results.append(peel_light_gray_border_transparent(p, iterations=15))
                continue
            if p == (repo / "assets" / "images" / "android-icon-foreground.png"):
                # Foreground should also be peeled robustly
                results.append(
                    peel_light_gray_border_transparent(p, iterations=15, min_value=130)
                )
                continue
            if p.name == "splashscreen_logo.png":
                results.append(make_largest_light_gray_component_transparent(p))
                results.append(peel_light_gray_border_transparent(p, iterations=15))
            else:
                results.append(make_edge_white_transparent(p, threshold=10))
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"Failed processing: {p}") from e

    for r in results:
        mode = r.get("mode", "edge-fill")
        print(
            f"- {os.path.relpath(r['path'], repo)}: {r['format']} {r['size']} cleared={r['cleared_pixels']} ({mode})"
        )

    print("Done.")


def main_new() -> None:
    repo = Path(__file__).resolve().parents[1]
    bg_color = (31, 41, 55)

    icon_path = repo / "assets" / "images" / "icon.png"
    foreground_path = repo / "assets" / "images" / "android-icon-foreground.png"

    if icon_path.exists():
        # Test with lower threshold to see if anything is caught
        res = peel_and_recolor_edge(icon_path, bg_color, threshold=50)
        print(f"Fixed icon.png: {res['cleared_pixels']} pixels cleared.")

    if foreground_path.exists():
        res = fill_transparent_with_color(foreground_path, bg_color)
        print(f"Fixed foreground: {res['filled_pixels']} pixels color-filled.")


if __name__ == "__main__":
    main_new()
