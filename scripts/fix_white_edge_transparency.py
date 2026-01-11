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
    for p in uniq:
        try:
            if p == (repo / "assets" / "images" / "icon.png"):
                results.append(
                    make_edge_white_recolor_png(p, (0x1F, 0x29, 0x37), threshold=10)
                )
                continue
            if p == (repo / "assets" / "images" / "splash-icon.png"):
                # The unwanted white border is often NOT edge-connected; remove the largest near-white component.
                results.append(make_largest_light_gray_component_transparent(p))
                results.append(peel_light_gray_border_transparent(p))
                continue
            if p.name == "splashscreen_logo.png":
                results.append(make_largest_light_gray_component_transparent(p))
                results.append(peel_light_gray_border_transparent(p))
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


if __name__ == "__main__":
    main()
