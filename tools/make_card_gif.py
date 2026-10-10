"""Render the reward collage as an animated "Happy Birthday" card GIF.

    uv run --with pillow python tools/make_card_gif.py [--name Sam]

Reads the palette, bitmap font and pup/balloon sprites straight from the
site's JS (js/sprites.js, js/font.js) so the card matches the page, takes the
photos/clips from assets/collage/, and writes assets/happy-birthday-card.gif.
Needs ffmpeg on PATH (used for the final palette + GIF encode).

Every animated thing is periodic over LOOP frames, so the GIF loops seamlessly.
"""
import argparse
import base64
import math
import random
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
COLLAGE = ROOT / "assets" / "collage"
OUT = ROOT / "assets" / "happy-birthday-card.gif"

W, H = 480, 600
FPS = 10
LOOP = 60  # frames (6 s)

# ------------------------------------------------------------ read the JS --
sprites_js = (ROOT / "js" / "sprites.js").read_text(encoding="utf-8")
font_js = (ROOT / "js" / "font.js").read_text(encoding="utf-8")

PAL = dict(re.findall(r'^\s+(\w): "(#[0-9a-fA-F]{6})"', sprites_js, re.M))


def rgb(key):
    h = PAL.get(key, key)
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def block(name, src=sprites_js):
    """Strings inside `const NAME = [ ... ];` (or `name: [ ... ]`)."""
    m = re.search(rf"(?:const {name} =|\b{name}:) \[(.*?)\n\s*\]", src, re.S)
    return re.findall(r'"([^"]*)"', m.group(1))


DOG_TOP = block("DOG_TOP")
LEGS = block("stand")
TAIL = block("TAIL")
TAIL = [TAIL[:5], TAIL[5:10]]
HAT = block("HAT")
HEART = re.search(r"const HEART = \[(.*?)\];", sprites_js).group(1)
HEART = re.findall(r'"([^"]*)"', HEART)
BALLOON = block("BALLOON")

GLYPHS = {}
for key, body in re.findall(r'^\s+("[^"]+"|\w):\s*\[(.*?)\],', font_js, re.M):
    rows = re.findall(r'"([^"]*)"', body)
    if len(rows) == 5:
        GLYPHS[key.strip('"')] = rows


# ------------------------------------------------------------- drawing ----
def sprite(img, grid, x, y, scale=1, swaps=None):
    d = ImageDraw.Draw(img)
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            ch = (swaps or {}).get(ch, ch)
            if ch in PAL:
                d.rectangle([x + c * scale, y + r * scale, x + (c + 1) * scale - 1, y + (r + 1) * scale - 1], fill=rgb(ch))


def text_width(s, scale):
    return (len(s) * 4 - 1) * scale


def text(img, s, x, y, scale, color, outline="K", shadow=None, wave=None):
    """Pixel text; `wave(i)` returns a per-letter y offset."""
    d = ImageDraw.Draw(img)
    b = max(2, scale // 2)  # outline thickness
    for pass_ in ("shadow", "outline", "fill"):
        if pass_ == "shadow" and not shadow:
            continue
        for i, ch in enumerate(s.upper()):
            g = GLYPHS.get(ch, GLYPHS[" "])
            oy = wave(i) if wave else 0
            for r in range(5):
                for c in range(3):
                    if g[r][c] != "#":
                        continue
                    px, py = x + (i * 4 + c) * scale, y + r * scale + oy
                    if pass_ == "shadow":  # hard drop shadow behind the outline
                        o = b + 2
                        d.rectangle([px - b + o, py - b + o, px + scale - 1 + b + o, py + scale - 1 + b + o], fill=rgb(shadow))
                    elif pass_ == "outline":
                        d.rectangle([px - b, py - b, px + scale - 1 + b, py + scale - 1 + b], fill=rgb(outline))
                    else:
                        d.rectangle([px, py, px + scale - 1, py + scale - 1], fill=rgb(color))


def rect(img, box, color):
    ImageDraw.Draw(img).rectangle(box, fill=rgb(color))


# --------------------------------------------------------- static layers --
def background():
    img = Image.new("RGB", (W, H), rgb("p"))
    d = ImageDraw.Draw(img)
    cream = rgb("W")
    tint = tuple(int(a * 0.45 + b * 0.55) for a, b in zip(cream, rgb("p")))
    for y in range(0, H, 24):  # gingham, like the page background
        d.rectangle([0, y, W, y + 11], fill=tint)
    for x in range(0, W, 24):
        for y in range(0, H, 24):
            d.rectangle([x, y + 12, x + 11, y + 23], fill=tint)
        for y in range(0, H, 24):
            d.rectangle([x, y, x + 11, y + 11], fill=cream)

    # pixel photo frame: plum / butter moulding w/ bevel / salmon / plum / mat
    o = 12
    rect(img, [o + 8, o + 8, W - o + 7, H - o + 7], "P")             # drop shadow
    rect(img, [o, o, W - o - 1, H - o - 1], "K")
    rect(img, [o + 4, o + 4, W - o - 5, H - o - 5], "Y")
    rect(img, [o + 4, o + 4, W - o - 5, o + 7], "W")                  # bevel light
    rect(img, [o + 4, o + 4, o + 7, H - o - 5], "W")
    rect(img, [o + 4, H - o - 8, W - o - 5, H - o - 5], "O")          # bevel shade
    rect(img, [W - o - 8, o + 4, W - o - 5, H - o - 5], "O")
    rect(img, [o + 20, o + 20, W - o - 21, H - o - 21], "R")
    rect(img, [o + 24, o + 24, W - o - 25, H - o - 25], "K")
    rect(img, [o + 28, o + 28, W - o - 29, H - o - 29], "W")          # mat
    rect(img, [o + 32, o + 32, W - o - 33, o + 35], "p")              # mat inner trim
    rect(img, [o + 32, H - o - 36, W - o - 33, H - o - 33], "p")
    return img


MAT = (40, 40, W - 41, H - 41)

# polaroid slots: 3 x 2, slight vertical stagger for a hand-placed look
TILE_W, TILE_H, IMG_W, IMG_H = 112, 140, 100, 112
GAP = 14
GRID_X = (W - (3 * TILE_W + 2 * GAP)) // 2
GRID_Y = 118
STAGGER = [0, 8, 2, 6, 0, 8]
TAPE = ["p", "S", "Y", "S", "Y", "p"]


def slot_xy(i):
    c, r = i % 3, i // 3
    return GRID_X + c * (TILE_W + GAP), GRID_Y + r * (TILE_H + GAP + 4) + STAGGER[i]


def fit(im):
    return ImageOps.fit(im.convert("RGB"), (IMG_W, IMG_H), Image.LANCZOS, centering=(0.5, 0.35))


def load_clip(name):
    with Image.open(COLLAGE / name) as g:
        return [fit(f.copy()) for f in ImageSequence.Iterator(g)]


# slot -> content. Clips play; photo slots swap halfway through the loop.
PHOTO_SETS = {
    0: ["photo-3182.jpg", "photo-8694.jpg"],
    2: ["lp_image.jpg", "photo-9395.jpg"],
    4: ["photo-3211.jpg", "photo-2258.jpg"],
}
CLIP_SLOTS = {1: "clip-1.gif", 3: "clip-2.gif", 5: "clip-3.gif"}


def polaroid(img, i, content, bob, flash=0):
    x, y = slot_xy(i)
    y += bob
    rect(img, [x + 5, y + 5, x + TILE_W + 4, y + TILE_H + 4], "g")   # soft shadow
    rect(img, [x - 3, y - 3, x + TILE_W + 2, y + TILE_H + 2], "K")
    rect(img, [x, y, x + TILE_W - 1, y + TILE_H - 1], "W")
    img.paste(content, (x + 6, y + 6))
    if flash:  # quick white "snap" when a photo slot swaps
        overlay = Image.new("RGB", (IMG_W, IMG_H), rgb("W"))
        img.paste(Image.blend(content, overlay, flash), (x + 6, y + 6))
    tx = x + TILE_W // 2 - 20
    rect(img, [tx - 2, y - 9, tx + 41, y + 4], "K")                   # washi tape
    rect(img, [tx, y - 7, tx + 39, y + 2], TAPE[i])
    if i in CLIP_SLOTS:
        sprite(img, HEART, x + TILE_W - 18, y + TILE_H - 16, 2)


def pup(img, x, y, f, scale=3):
    buf = Image.new("RGBA", (34, 30), (0, 0, 0, 0))
    breath = 1 if (f // 6) % 2 else 0
    sprite(buf, DOG_TOP, 5, 10 + breath)
    sprite(buf, LEGS, 5, 24)
    sprite(buf, TAIL[(f // 2) % 2], 2, 15 + breath)
    sprite(buf, HAT, 16, 3 + breath)
    if f % 30 in (20, 21):  # blink
        for ex in (11, 15):
            rect(buf, [5 + ex, 14 + breath, 5 + ex + 1, 14 + breath], "O")
    big = buf.resize((34 * scale, 30 * scale), Image.NEAREST)
    img.paste(big, (x, y), big)


# ------------------------------------------------------------ animation --
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="", help="optional name line under the title")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    rnd = random.Random(7)
    bg = background()
    photos = {i: [fit(Image.open(COLLAGE / n)) for n in names] for i, names in PHOTO_SETS.items()}
    clips = {i: load_clip(n) for i, n in CLIP_SLOTS.items()}

    confetti = [
        dict(x=rnd.uniform(16, W - 16), y=rnd.uniform(0, H), cycles=rnd.choice([1, 1, 2]),
             sway=rnd.uniform(4, 10), ph=rnd.uniform(0, 6.28), col=rnd.choice("YpCLOSmD"),
             wide=rnd.random() < 0.5)
        for _ in range(46)
    ]

    title = "HAPPY BIRTHDAY!"
    name = args.name.strip().upper()[:14]
    tmp = Path(tempfile.mkdtemp(prefix="hbcard-"))
    try:
        for f in range(LOOP):
            t = f / LOOP
            img = bg.copy()

            # corner hearts twinkle
            for (hx, hy) in [(4, 4), (W - 24, 4), (4, H - 24), (W - 24, H - 24)]:
                sprite(img, HEART, hx, hy, 4, {"W": "W" if f % 10 < 5 else "p"})

            # title: letters ride a wave that travels across the line
            s = 5
            tx = (W - text_width(title, s)) // 2
            text(img, title, tx, 58, s, "Y", shadow="m",
                 wave=lambda i: 2 * round(math.sin(2 * math.pi * (t * 2 - i / 15)) * 1.5))
            if name:
                text(img, name, (W - text_width(name, 3)) // 2, 98, 3, "m", outline="W")

            # polaroids gently bob (two bob phases so neighbours differ)
            for i in range(6):
                bob = round(math.sin(2 * math.pi * (t * 2 + i * 0.37)) * 2)
                if i in clips:
                    frames = clips[i]
                    content = frames[f % len(frames)]
                    flash = 0
                else:
                    half = LOOP // 2
                    content = photos[i][0 if f < half else 1]
                    d = min(f % half, half - (f % half))  # frames from a swap
                    flash = {0: 0.85, 1: 0.45, 2: 0.15}.get(d, 0) if (f % half) <= 2 else 0
                polaroid(img, i, content, bob, flash)

            # bottom: pup + message + bobbing balloons
            base = MAT[3] - 116
            pup(img, MAT[0] + 4, base - 8, f, scale=4)
            msg1, msg2 = "HAVE THE", "BEST DAY ♥"
            text(img, msg1, 172, base + 34, 4, "m", outline="W")
            text(img, msg2, 172, base + 64, 4, "m", outline="W")
            for k, (bx, col) in enumerate([(MAT[2] - 84, "S"), (MAT[2] - 48, "Y")]):
                by = base - 2 + round(math.sin(2 * math.pi * (t + k * 0.5)) * 3)
                ramp = {"S": ("B", "S", "C"), "Y": ("O", "Y", "W")}[col]
                sprite(img, BALLOON, bx, by, 4, dict(a=ramp[0], b=ramp[1], c=ramp[2]))
                for q in range(10):  # string
                    rect(img, [bx + 16 + (q % 2), by + 36 + q * 4, bx + 17 + (q % 2), by + 39 + q * 4], "D")

            # floating hearts above the pup (looping)
            for k in range(3):
                p = (t + k / 3) % 1
                hx = MAT[0] + 70 + round(math.sin(2 * math.pi * (p * 2 + k)) * 6) + k * 8
                hy = base - 2 - round(p * 22)
                if p < 0.85:
                    sprite(img, HEART, hx, hy, 2)

            # confetti: integer cycles per loop => seamless
            d = ImageDraw.Draw(img)
            for c in confetti:
                y = (c["y"] + t * c["cycles"] * H) % H
                x = c["x"] + math.sin(2 * math.pi * t * c["cycles"] + c["ph"]) * c["sway"]
                flip = math.sin(2 * math.pi * t * 4 + c["ph"]) > 0
                w = 6 if (c["wide"] and flip) else 3
                d.rectangle([round(x), round(y), round(x) + w - 1, round(y) + 2], fill=rgb(c["col"]))

            img.save(tmp / f"f{f:03d}.png")

        out = Path(args.out)
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(tmp / "f%03d.png"),
            "-vf", "split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];"
                   "[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
            "-loop", "0", str(out),
        ], check=True)
        print(f"wrote {out} ({out.stat().st_size // 1024} KB, {LOOP} frames @ {FPS} fps, {W}x{H})")
        # file:// pages can't force-download a file via <a download> or fetch(),
        # but they can load a <script>. This copy lets the "Save as GIF" button
        # build the download itself when the site is opened by double-click.
        js_out = out.with_suffix(".gif.js")
        b64 = base64.b64encode(out.read_bytes()).decode("ascii")
        js_out.write_text(f'window.HB_CARD_GIF = "data:image/gif;base64,{b64}";\n', encoding="ascii")
        print(f"wrote {js_out} ({js_out.stat().st_size // 1024} KB, used only when opened from file://)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
