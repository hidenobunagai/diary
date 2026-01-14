from PIL import Image


def analyze_file(filename, mode="RGB"):
    print(f"\nAnalyzing {filename} ({mode})")
    img = Image.open(filename).convert(mode)
    w, h = img.size
    px = img.load()

    visible_white = []
    transparent_white = []
    for y in range(h):
        for x in range(w):
            r, g, b = (0, 0, 0)
            a = 255
            if mode == "RGBA":
                r, g, b, a = px[x, y]
            else:
                r, g, b = px[x, y]

            if r > 120 and g > 120 and b > 120:
                if a > 0:
                    visible_white.append((x, y, (r, g, b, a)))
                else:
                    transparent_white.append((x, y, (r, g, b, a)))

    print(f"Visible white pixels: {len(visible_white)}")
    if visible_white:
        for i in range(min(5, len(visible_white))):
            print(f"  {visible_white[i]}")
    print(f"Transparent white pixels: {len(transparent_white)}")
    if transparent_white:
        for i in range(min(5, len(transparent_white))):
            print(f"  {transparent_white[i]}")


if __name__ == "__main__":
    analyze_file("assets/images/icon.png", "RGB")
    analyze_file("assets/images/android-icon-foreground.png", "RGBA")
