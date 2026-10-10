# Happy Birthday Site 🎂🐶

A single-page, pixel-art "Happy Birthday" website. Plain HTML + CSS + vanilla
JavaScript, no frameworks, no build step. All art is drawn on a `<canvas>`
from hand-defined pixel grids — no images.

## Open it

Just open `index.html` in any browser (double-click it, or drag it into a
browser window). Everything runs locally.

Tip: to personalise it, add `?name=Sam` to the URL:

    index.html?name=Sam      ->  "Happy Birthday, Sam!"

The name is read from the `name` query parameter (max 20 characters).

## What's animated

- Pixel dog with a party hat: tail wag, blinking eyes, "WOOF!" bubble (~8 fps)
- Cake with flickering candle flames
- Balloons floating up, clouds drifting, twinkling stars
- Ambient confetti falling; **click/tap the dog** for a confetti burst
- `prefers-reduced-motion` is respected: a single static frame is shown

## Change the colours

Two places, kept in sync:

1. `style.css` — the `:root` block has the palette as CSS variables
   (`--peach`, `--mint`, `--lavender`, ...). Edit these to retheme the page
   background, text and heading shadow.
2. `script.js` — the `PALETTE` object at the top maps sprite characters
   (like `p`, `b`, `y`) to hex colours. Edit these to retheme the sprites.

## Change the sprites

All sprite art lives in the clearly-labelled **SPRITE DATA** section of
`script.js`. Each sprite is an array of strings; each character is one
"pixel" looked up in `PALETTE` (`.` = transparent). Redraw the grids with
any characters from the palette to make new art.

## Deploy on GitHub Pages

1. Create a new repo on GitHub (e.g. `happy-birthday-site`).
2. Push this folder:
       git remote add origin https://github.com/<you>/happy-birthday-site.git
       git push -u origin main
3. On GitHub: **Settings → Pages → Build and deployment**.
   Under "Source" pick **Deploy from a branch**, branch `main`, folder
   `/ (root)`, then Save.
4. In a minute or two the site is live at
   `https://<you>.github.io/happy-birthday-site/`.

To share a personalised link, just append the query string:
`https://<you>.github.io/happy-birthday-site/?name=Sam`.

## Files

- `index.html` — the page (heading + canvas + font link)
- `style.css`  — palette variables, checker background, layout
- `script.js`  — sprite data, canvas rendering, animation loop
