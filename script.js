/* ==========================================================================
   Happy Birthday — pixel dog party
   Vanilla JS. All art is drawn on a single <canvas> from hand-defined
   pixel grids (2D arrays of palette-index characters), scaled by an
   integer factor. No external images.

   Sections:
     1. Palette + config
     2. SPRITE DATA (grids)
     3. Sprite drawing helpers
     4. World state (clouds, balloons, confetti, candles)
     5. Render (one frame)
     6. Animation loop + input
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. PALETTE + CONFIG
   Keep these in sync with the CSS variables in style.css.
   -------------------------------------------------------------------------- */
const PALETTE = {
  o: "#B98E78", // soft brown outline
  p: "#FFE1D1", // dog body (light peach)
  d: "#E8B99E", // dog shading
  e: "#B98E78", // ears
  n: "#7A5648", // nose / dark detail
  w: "#FFFFFF", // eye white
  k: "#4A332B", // pupil
  b: "#FFC8DD", // blush (party hat, cheeks)
  y: "#FFF1B8", // butter (hat pompom, flame)
  f: "#FF9E6B", // flame orange
  t: "#CDEFD9", // mint (frosting)
  c: "#FFD6C9", // peach (cake layer)
  s: "#D9CCF2", // lavender (cake layer)
  r: "#FF6B8A", // cherry red
  l: "#FFFFFF", // candle stick white
  ".": null,    // transparent
};

const FPS = 8;                       // retro frame rate
const FRAME_MS = 1000 / FPS;
const REDUCED_MOTION =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

/* --------------------------------------------------------------------------
   2. SPRITE DATA
   Each grid is an array of strings. One character per logical pixel,
   looked up in PALETTE. "." = transparent. All grids are hand-defined.

   DOG_BODY — 16x16, sitting dog WITH party hat. Eyes and tail are drawn
   separately (they animate), everything else is static.
   -------------------------------------------------------------------------- */
const DOG_BODY = [
  ".......yy.......",
  "......bbbb......",
  ".....bbbbbb.....",
  "....bbbbbbbb....",
  "....oppppppo....",
  ".ee.pppppppp.ee.",
  ".eeepwwppwwpeee.",
  ".eeepwwppwwpeee.",
  "..eeppppppppee..",
  "...bpppppppb....",
  "...ppppnppppp...",
  "...pppppppppp...",
  "...pppppppppp...",
  "..pppppppppppp..",
  "..pppppppppppp..",
  "..pppppppppppp..",
];

/* Eye patches (6 wide x 2 tall) — OPEN is white+pupil, CLOSED is body colour */
const EYES_OPEN = [
  "wkwwwk",
  "wkwwwk",
];
const EYES_CLOSED = [
  "pppppp",
  "pppppp",
];
const EYES_XY = [5, 6]; // draw position relative to dog origin

/* Tail (4 wide x 4 tall) — two wag poses */
const TAIL_WAG_1 = [
  "....",
  "...o",
  "..oo",
  ".oo.",
];
const TAIL_WAG_2 = [
  "..o.",
  "..oo",
  "...o",
  "....",
];
const TAIL_XY = [14, 11];

/* CAKE — 22 wide x 16 tall: three pastel layers, frosting scallops, candles */
const CAKE = [
  "....l...l...l....",
  "....l...l...l....",
  "...ttttttttttt...",
  "...ccccccccccc...",
  "...ccccccccccc...",
  "..ttttttttttttt..",
  "..sssssssssssss..",
  "..sssssssssssss..",
  "..sssssssssssss..",
  ".ttttttttttttttt.",
  ".ccccccccccccccc.",
  ".ccccccccccccccc.",
  ".ccccccccccccccc.",
  "ttttttttttttttttt",
  "ooooooooooooooooo",
  "ooooooooooooooooo",
];
/* little cherries sit on top of the top layer via this row of dots */
const CAKE_CHERRIES = [
  "..r...r...r..",
];
const CAKE_CHERRIES_XY = [3, 2];

/* BALLOON — 5 wide x 7 tall. 'B' is a placeholder colour set per balloon. */
const BALLOON = [
  "..B..",
  ".BBB.",
  "BBBBB",
  "BBBBB",
  "BBBBB",
  ".BBB.",
  "..o..",
];

/* CLOUD — 10 wide x 4 tall, drawn in white over the sky */
const CLOUD = [
  "...wwww...",
  ".wwwwwwww.",
  "wwwwwwwwww",
  ".wwwwwwww.",
];

/* STAR — tiny 3x3 sparkle */
const STAR = [
  ".w.",
  "www",
  ".w.",
];

/* Party hat as its own sprite so it sits ON TOP of the dog head.
   8 wide x 7 tall; drawn relative to dog origin. */
const HAT = [
  "..y.....",
  ".bbb....",
  "..bbb...",
  "..bbbb..",
  "...bbb..",
  "...bbbb.",
  "....bb..",
];
const HAT_XY = [4, -6]; // negative y = above the dog grid

/* WOOF speech bubble — text drawn with the pixel font instead */
const BUBBLE_W = 44; // logical pixels
const BUBBLE_H = 16;

/* --------------------------------------------------------------------------
   3. SPRITE DRAWING HELPERS
   drawSprite paints a grid at world (x, y); one world pixel = `px`
   real canvas pixels. `swaps` remaps characters (e.g. balloon colours).
   -------------------------------------------------------------------------- */
function drawSprite(grid, x, y, swaps = {}) {
  for (let row = 0; row < grid.length; row++) {
    const line = grid[row];
    for (let col = 0; col < line.length; col++) {
      let ch = line[col];
      ch = swaps[ch] || ch;
      const color = PALETTE[ch];
      if (!color) continue; // transparent
      ctx.fillStyle = color;
      ctx.fillRect(
        Math.round((x + col) * px),
        Math.round((y + row) * px),
        px,
        px
      );
    }
  }
}

/* Rounded-ish bubble rect in world pixels */
function drawBubble(x, y, text) {
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = PALETTE.o;
  ctx.lineWidth = 2;
  const rx = x * px, ry = y * px;
  ctx.fillRect(rx, ry, BUBBLE_W * px, BUBBLE_H * px);
  ctx.strokeRect(rx, ry, BUBBLE_W * px, BUBBLE_H * px);
  // tail
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(rx + 4 * px, ry + BUBBLE_H * px, 3 * px, 3 * px);
  ctx.fillStyle = PALETTE.n;
  ctx.font = `${Math.max(8, 4 * px)}px "Press Start 2P", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, rx + (BUBBLE_W / 2) * px, ry + (BUBBLE_H / 2) * px);
}

/* --------------------------------------------------------------------------
   4. WORLD STATE
   -------------------------------------------------------------------------- */
let W = 0, H = 0, px = 4;      // canvas size + integer pixel scale
let dogX = 0, dogY = 0;        // dog origin in world pixels
let frame = 0;                 // animation frame counter

const clouds  = Array.from({ length: 4 }, () => makeCloud());
const stars   = Array.from({ length: 12 }, () => makeStar());
const balloons = Array.from({ length: 5 }, (_, i) => makeBalloon(i));
const confetti = [];           // {x, y, vx, vy, colorChar, life}
const BURST_COLORS = ["b", "y", "t", "s", "c", "r", "p"];

function makeCloud() {
  return {
    x: Math.random() * 90,
    y: 2 + Math.random() * 18,
    speed: 0.04 + Math.random() * 0.06,
  };
}
function makeStar() {
  return { x: Math.random() * 95, y: Math.random() * 45, on: Math.random() > 0.5 };
}
function makeBalloon(i) {
  const colors = ["b", "y", "t", "s", "c"];
  return {
    x: 8 + i * 16 + Math.random() * 4,
    y: 20 + Math.random() * 35,
    speed: 0.06 + Math.random() * 0.08,
    sway: Math.random() * Math.PI * 2,
    color: colors[i % colors.length],
  };
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  // Multiply by devicePixelRatio? No — we want chunky pixels, so use CSS
  // pixels directly and let integer scaling keep everything crisp.
  W = Math.floor(rect.width);
  H = Math.floor(rect.height);
  canvas.width = W;
  canvas.height = H;
  // Integer scale that fits a ~48x40 world comfortably
  px = Math.max(3, Math.floor(Math.min(W / 60, H / 44)));
  dogX = Math.floor(W / px / 2 - 22);     // left-ish of centre
  dogY = Math.floor(H / px) - 20;         // near the bottom
}
window.addEventListener("resize", resize);
resize();

/* --------------------------------------------------------------------------
   5. RENDER — draws one frame of the whole scene
   -------------------------------------------------------------------------- */
function spawnBurst(cx, cy, count = 40) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.3 + Math.random() * 0.9;
    confetti.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      color: BURST_COLORS[(Math.random() * BURST_COLORS.length) | 0],
      life: 60 + Math.random() * 40,
    });
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);

  const worldW = Math.ceil(W / px);
  const worldH = Math.ceil(H / px);

  // --- background: stars + drifting clouds ---
  for (const s of stars) {
    if (s.on) drawSprite(STAR, s.x, s.y, { w: "#FFFFFF" });
  }
  for (const c of clouds) {
    drawSprite(CLOUD, c.x, c.y, { w: "rgba(255,255,255,0.85)" });
  }

  // --- balloons (float up, wrap at top) ---
  for (const b of balloons) {
    const swayX = Math.sin(frame * 0.05 + b.sway) * 1.5;
    drawSprite(BALLOON, b.x + swayX, b.y, { B: PALETTE[b.color] });
  }

  // --- dog (with hat, eyes, tail) ---
  const eyes = (frame % 24 < 2) ? EYES_CLOSED : EYES_OPEN; // blink every ~3s
  const tail = (frame % 4 < 2) ? TAIL_WAG_1 : TAIL_WAG_2;  // wag ~2Hz
  drawSprite(DOG_BODY, dogX, dogY);
  drawSprite(eyes, dogX + EYES_XY[0], dogY + EYES_XY[1]);
  drawSprite(tail, dogX + TAIL_XY[0], dogY + TAIL_XY[1]);
  drawSprite(HAT, dogX + HAT_XY[0], dogY + HAT_XY[1]);

  // bark bubble on the beat of each loop
  if (frame % 48 < 12) {
    drawBubble(dogX + 20, dogY + HAT_XY[1] - 4, "WOOF!");
  }

  // --- cake (right of the dog) with flickering candle flames ---
  const cakeX = dogX + 22;
  const cakeY = dogY + 2;
  drawSprite(CAKE, cakeX, cakeY);
  drawSprite(CAKE_CHERRIES, cakeX + CAKE_CHERRIES_XY[0], cakeY + CAKE_CHERRIES_XY[1]);
  // flames flicker: draw over each candle wick with alternating colour
  const flicker = frame % 4;
  const flameColor = flicker < 2 ? PALETTE.y : PALETTE.f;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = flameColor;
    const fx = (cakeX + 4 + i * 5) * px;
    const fy = (cakeY - 1) * px;
    ctx.fillRect(fx, fy, px, px + (flicker === 3 ? -1 : 0));
  }

  // --- confetti: falling ambient + burst particles ---
  for (const c of confetti) {
    ctx.fillStyle = PALETTE[c.color] || PALETTE.r;
    ctx.fillRect(Math.round(c.x * px), Math.round(c.y * px), px, px);
  }
}

/* --------------------------------------------------------------------------
   6. ANIMATION LOOP + INPUT
   -------------------------------------------------------------------------- */
function update() {
  const worldW = Math.ceil(W / px);
  const worldH = Math.ceil(H / px);

  for (const c of clouds) {
    c.x += c.speed;
    if (c.x > worldW) Object.assign(c, makeCloud(), { x: -12 });
  }
  for (const b of balloons) {
    b.y -= b.speed;
    if (b.y < -8) {
      b.y = worldH + 4;
      b.x = Math.random() * (worldW - 8);
    }
  }

  // gentle ambient confetti snow
  if (confetti.length < 60 && Math.random() < 0.4) {
    confetti.push({
      x: Math.random() * worldW,
      y: -1,
      vx: (Math.random() - 0.5) * 0.2,
      vy: 0.15 + Math.random() * 0.2,
      color: BURST_COLORS[(Math.random() * BURST_COLORS.length) | 0],
      life: 400,
    });
  }

  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.01;          // gravity
    c.vx *= 0.99;
    c.life--;
    if (c.life <= 0 || c.y > worldH + 2) confetti.splice(i, 1);
  }

  // stars twinkle
  if (frame % 8 === 0) {
    const s = stars[(Math.random() * stars.length) | 0];
    s.on = !s.on;
  }
}

let lastFrame = 0;
function loop(timestamp) {
  if (timestamp - lastFrame >= FRAME_MS) {
    lastFrame = timestamp;
    if (!REDUCED_MOTION) {
      frame++;
      update();
    }
    render();
  }
  requestAnimationFrame(loop);
}

// Click / tap the dog -> confetti burst from the dog's head
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / px;
  const cy = (e.clientY - rect.top) / px;
  const inDog =
    cx >= dogX && cx <= dogX + 16 && cy >= dogY + HAT_XY[1] && cy <= dogY + 16;
  if (REDUCED_MOTION || inDog) {
    spawnBurst(dogX + 8, dogY + 2, 40);
    render(); // burst visible immediately even at low fps
  }
});

// Name from the URL: ?name=Sam -> "Happy Birthday, Sam!"
(function setName() {
  const params = new URLSearchParams(window.location.search);
  const name = (params.get("name") || "").trim().slice(0, 20);
  if (name) {
    document.getElementById("greeting").textContent =
      `Happy Birthday, ${name}!`;
    document.title = `Happy Birthday, ${name}!`;
  }
})();

// Kick things off
if (REDUCED_MOTION) {
  render(); // single static frame, no loop
} else {
  requestAnimationFrame(loop);
}
