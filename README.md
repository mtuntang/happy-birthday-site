# Happy Birthday Site 🎂🐶

A cute, pastel, pixel-art birthday party in a single page. Plain HTML + CSS +
vanilla JavaScript: no frameworks, no build step. Every sprite is a
hand-drawn pixel grid in `js/sprites.js`; the only images are the reward
collage photos in `assets/collage/`.

## Open it

The site is always behind a **lock screen**: a chained-up pixel present.
Only the key box opens it, and nothing is saved, so every refresh (or the
**Relock** button in the game) locks it again. The date in `UNLOCK_AT` at the
top of `js/lock.js` (Oct 12 2026, visitor's local time) only changes the
messaging: before it, "not yet" plus a countdown; on and after it, "IT'S THE
BIG DAY!", "for one very special person only", and an arrow to the key box.
It's a client-side surprise, not real security.

**Unlocking:** click the little key box next to the present (or press K)
and enter the password (hint: the flavour of the cupcakes baked in 2019).
Input is upper-cased; the answer must match exactly (no spaces). A key flies out, unlocks the
padlock and the present unwraps. Nothing is saved: every refresh shows the
lock again until the real date. The answer is stored as an FNV-1a
hash (`ANSWER_HASH` in `js/lock.js`), so it isn't plain text in the source.

Double-click `index.html` (works from `file://`) or host the folder anywhere
static (GitHub Pages, Netlify...). After the key box unlocks the present, the
page fades straight into the party. Once that transition has fully finished,
the welcome song (`kojima-bday-mgsv-pp.m4a`) plays once, and 3 s later the
party-goals popup opens. Use **♪ Replay song** in the toolbar to hear it
again. (Typing the password is the click browsers require before audio can
play.)

## Personalise it

    index.html?name=Sam&age=7&msg=Love%20you!&from=Alex

| param  | effect                                                         |
|--------|----------------------------------------------------------------|
| `name` | heading, title screen, and some balloon wishes (max 20 chars)   |
| `age`  | 1–7 → that many candles; 8+ → number candles ("30")            |
| `msg`  | message on the wish card (max 240 chars)                       |
| `from` | signature on the wish card                                     |

## Things to do

- Pop balloons for wishes (rare golden ones are a jackpot)
- Pet the pup (hearts + jumps); tap the grass and it trots over
- Open the three presents: a bone (the pup runs over and eats it),
  a crown (the pup becomes royalty), and a balloon surprise
- Tap the sky for sparkle bursts
- Blow out the candles: the button, or click each flame
- An F-14 Tomcat flies by towing a "HAPPY BIRTHDAY <name>!" banner, leaving
  a pastel smoke trail (once after the goals popup is closed, during the celebration,
  every ~1 min, or via the **F-14 flyby** button / J key). Tap it for a
  barrel roll
- Tap the ball to play fetch: the pup chases it, carries it back and drops it
- Go quiet for ~20 s and the pup naps (tap it, or throw the ball, to wake it)
- 7 party goals (★ button). The goal list pops up 3 s after you enter the party
  to explain that finishing **all** of them unlocks the reward: a photo +
  GIF collage in a pixel photo frame. After unlocking, **♥ Open reward**
  reopens it
- Tap the sun a few times for a little surprise
- Keyboard: ←/→ walk, Space/↑ jump, F sparkle burst, J jet flyby. There's also a classic
  cheat code for party mode
- **Snapshot** downloads a crisp 6× PNG of the scene

**Phones:** the layout adapts to portrait and landscape. In portrait the
canvas grows taller with extra sky (the world stays the same, sparkles and
the F-14 use the extra sky), the toolbar becomes a 3-column grid, tap targets
are enlarged for fingers, and the password field won't trigger iOS zoom.
Because iPhones only allow audio started from a tap, the password entry also
"primes" the song; if a phone still blocks it, **♪ Replay song** wiggles.

`prefers-reduced-motion` is respected: ambient motion (rising balloons,
clouds, butterflies, twinkling) stops; things you trigger still respond.

## How it's built

| file            | what                                                            |
|-----------------|-----------------------------------------------------------------|
| `js/sprites.js` | palette, all sprite grids, sprite compiler/cache                |
| `js/font.js`    | 3×5 bitmap font for crisp in-canvas text                        |
| `js/audio.js`   | WebAudio chiptune SFX + "Happy Birthday" tune for the wish      |
| `js/ui.js`      | URL params, title screen + welcome song, buttons, dialogs       |
| `js/party.js`   | the scene: layout, pup state machine, particles, render loop    |
| `style.css`     | pastel page styling, pixel buttons/frames, reward photo frame   |
| `assets/collage/` | reward collage: web-ready JPEGs + GIFs (generated, see below) |

The scene renders at a tiny logical resolution (120 px tall, 160–256 px wide
depending on screen shape). The browser upscales it by an **integer** factor
with `image-rendering: pixelated`, so pixels stay perfectly square. Logic
runs at a fixed 60 Hz, while sprites animate at slower hand-animated rates.

### Palette

18 bright pastels arranged as hue-shifted ramps (butter → peach → salmon →
rose → mauve; ice → baby blue → cornflower; pistachio → mint → sea-mint).
Outlines use a soft plum (`#4b3b57`), never black. Light comes from the
top-left (the sun) on every sprite. To retheme, edit `PALETTE` in
`js/sprites.js` and the matching CSS variables in `style.css`.

### Editing sprites

Each sprite is an array of equal-length strings; each character is a
`PALETTE` key and `.` is transparent. Lowercase `a/b/c/r/s` are per-instance
colour slots (balloons, gifts, flags). Mismatched row widths log a console
warning on load.

### Collage media

`resources/` holds the original photos/videos (HEIC/MOV). Browsers other
than Safari can't show HEIC, so they were converted:

- photos → JPEG, max 900 px, EXIF rotation applied (Pillow + pillow-heif)
- videos → looping GIFs, 200 px wide, 10 fps, 96-colour palette (ffmpeg
  `palettegen`/`paletteuse`)

To change the collage, add the converted file to `assets/collage/` and list
it in `COLLAGE` in `js/ui.js` (`wide: true` makes a tile span two columns).

### Animated card GIF ("⬇ Save as GIF")

The collage popup's **Save as GIF** button downloads
`assets/happy-birthday-card.gif`: a 480×600, 6 s looping card with a pixel
frame, a wavy "HAPPY BIRTHDAY!" title, polaroids where the clips play and
photos swap, confetti, the party pup and balloons. It is pre-rendered (no
GIF encoder runs in the browser). Rebuild it after changing the media:

    uv run --with pillow python tools/make_card_gif.py            # generic
    uv run --with pillow python tools/make_card_gif.py --name Sam # adds a name line

The script reads the palette, font and sprites from `js/` so the card matches
the site, and needs ffmpeg. It also writes `happy-birthday-card.gif.js`
(base64 copy). Browsers won't force-download from `file://`, so the button
uses that copy when the page is opened by double-click. Hosted sites use the
plain `.gif`.

Only `assets/` is needed at runtime; `resources/` doesn't need to be
deployed.

## Deploy on GitHub Pages

1. Push this folder to a GitHub repo.
2. Settings → Pages → Deploy from a branch → `main`, `/ (root)`.
3. Share `https://<you>.github.io/<repo>/?name=Sam&age=7`.
