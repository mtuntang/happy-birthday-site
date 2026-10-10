/* ==========================================================================
   LOCK SCREEN — the party is always wrapped up behind a full-screen pixel
   present in chains + a padlock; only the key box (password) opens it, and
   that is never saved, so every refresh is locked again.
   The date (UNLOCK_AT, viewer's local time) only changes the messaging:
     before -> "not yet" + countdown
     on/after -> "for the birthday star only, use the key" + arrow to the box
   If the page is open at midnight it switches over with a little sparkle.

   NOTE: this is a client-side lock (a surprise, not security). Anyone who
   changes their clock or opens the page source can get past it, and the
   asset files are reachable by URL.
   Loaded after sprites.js/font.js/audio.js and BEFORE ui.js.
   ========================================================================== */
window.HB = window.HB || {};

(function (HB) {
  "use strict";

  const UNLOCK_AT = new Date(2026, 9, 12, 0, 0, 0); // Oct 12 2026, 00:00 local (month is 0-based)
  const DATE_LABEL = "MONDAY, OCTOBER 12, 2026";

  // Early-bypass key box. The answer is stored as an FNV-1a hash so it isn't
  // sitting in plain text in view-source (still not real security).
  const ANSWER_HASH = 0x35a9fafc;
  const HINT = "THE FLAVOUR OF THE CUPCAKES I BAKED IN 2019";
  const fnv1a = (str) => {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(str)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return h;
  };
  const root = document.getElementById("lock");
  // The lock ALWAYS shows; only the key box opens it. The date just changes
  // the messaging: before UNLOCK_AT it's "not yet" + countdown, from then on
  // it's "only for the birthday star, use the key". The key-box unlock is NOT
  // saved anywhere: `bypassed` only lives for this page load.
  let bypassed = false;
  const isLocked = () => !bypassed;
  const beforeDate = () => Date.now() < UNLOCK_AT.getTime();
  HB.lock = { isLocked, beforeDate, UNLOCK_AT };

  if (!root) return;
  if (!isLocked()) { root.remove(); return; }

  const P = HB.PALETTE, font = HB.font;
  const TOUCHY = window.matchMedia("(pointer: coarse)").matches;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.getElementById("lock-canvas");
  const ctx = canvas.getContext("2d");
  const msg = document.getElementById("lock-msg");
  const countEl = document.getElementById("lock-count");

  if (TOUCHY) msg.textContent = msg.textContent.replace("CLICK IT!", "TAP IT!");

  // keep everything behind the lock unreachable (focus, clicks, screen readers)
  const behind = [document.querySelector(".scene"), document.getElementById("start")];
  behind.forEach((el) => el && (el.inert = true));

  /* ------------------------------------------------------------ layout -- */
  const LW = 120, LH = 104;
  canvas.width = LW; canvas.height = LH;
  ctx.imageSmoothingEnabled = false;
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    // height left over after the title, message and countdown (+ gaps and the
    // canvas's pixel frame), so short landscape phones don't overlap
    const others = ["lock-title", "lock-msg", "lock-count"]
      .map((id) => document.getElementById(id))
      .reduce((h, el) => h + (el && el.offsetParent ? el.offsetHeight : 0), 0);
    const maxW = Math.min(window.innerWidth * 0.9, 600);
    const maxH = Math.min(window.innerHeight * 0.62, window.innerHeight - others - 110);
    const k = Math.max(1, Math.floor(Math.min((maxW * dpr) / LW, (maxH * dpr) / LH)));
    canvas.style.width = `${(LW * k) / dpr}px`;
    canvas.style.height = `${(LH * k) / dpr}px`;
  }
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", () => setTimeout(fitCanvas, 200));
  fitCanvas();

  const BOX = { x: 34, y: 50, w: 52, h: 38 };  // box body
  const LID = { x: 30, y: 39, w: 60, h: 12 };  // lid overhangs the box

  const rand = (a, b) => a + Math.random() * (b - a);
  const rect = (x, y, w, h, c) => { ctx.fillStyle = P[c] || c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const dot = (x, y, c) => rect(x, y, 1, 1, c);

  /* ------------------------------------------------------------ state --- */
  let t = 0, shake = 0, lockBounce = 0, bubbleT = 0, breaking = false, breakT = 0;
  const sparkles = [], bits = [];

  /* ------------------------------------------------------------ drawing - */
  function drawGift(ox, oy) {
    const b = { x: BOX.x + ox, y: BOX.y + oy, w: BOX.w, h: BOX.h };
    const l = { x: LID.x + ox, y: LID.y + oy - (breaking ? Math.min(30, breakT * 60) : 0), w: LID.w, h: LID.h };

    // ground shadow
    rect(BOX.x - 2, BOX.y + BOX.h + 2, BOX.w + 4, 2, "D");

    // box: pink with left highlight / right shade, plum outline
    rect(b.x - 1, b.y, b.w + 2, b.h + 1, "K");
    rect(b.x, b.y, b.w, b.h, "p");
    rect(b.x, b.y, 3, b.h, "W");
    rect(b.x + b.w - 5, b.y, 5, b.h, "m");
    // little polka dots
    for (let yy = 6; yy < b.h - 3; yy += 9)
      for (let xx = 8 + ((yy / 9) % 2) * 5; xx < b.w - 8; xx += 10) rect(b.x + xx, b.y + yy, 2, 2, "W");
    // vertical ribbon
    const rx = b.x + b.w / 2 - 4;
    rect(rx - 1, b.y, 10, b.h, "K");
    rect(rx, b.y, 8, b.h, "S");
    rect(rx, b.y, 2, b.h, "C");
    rect(rx + 6, b.y, 2, b.h, "B");

    // lid
    rect(l.x - 1, l.y - 1, l.w + 2, l.h + 2, "K");
    rect(l.x, l.y, l.w, l.h, "p");
    rect(l.x, l.y, l.w, 2, "W");
    rect(l.x, l.y + l.h - 2, l.w, 2, "m");
    rect(l.x + l.w / 2 - 5, l.y, 10, l.h, "K");
    rect(l.x + l.w / 2 - 4, l.y, 8, l.h, "S");
    rect(l.x + l.w / 2 - 4, l.y, 2, l.h, "C");
    // bow: two loops + knot, ribbon tails
    const bx = l.x + l.w / 2, by = l.y;
    const loop = (dir) => {  // bow loop: rounded, ~12x10, lit on top
      const H = [4, 7, 9, 10, 10, 10, 10, 9, 8, 6, 4];
      H.forEach((hgt, i) => {
        const xx = dir > 0 ? bx + 3 + i : bx - 4 - i;
        const edge = i === H.length - 1;
        rect(xx, by - hgt, 1, hgt, edge ? "K" : "S");
        dot(xx, by - hgt, "K");
        if (!edge && i > 0) { dot(xx, by - hgt + 1, "C"); if (hgt > 6) dot(xx, by - 2, "B"); }
        if (!edge && i > 2 && i < 8 && hgt > 7) dot(xx, by - hgt + 4, "B"); // inner fold
      });
    };
    loop(1); loop(-1);
    rect(bx - 4, by - 7, 8, 7, "K");
    rect(bx - 3, by - 6, 6, 5, "S");
    rect(bx - 3, by - 6, 6, 1, "C");
    rect(bx + 1, by - 5, 2, 4, "B");
  }

  // a chain from (x0,y0) to (x1,y1): hollow ring links alternating with
  // edge-on bar links, 4px apart, sagging by `slack` in the middle
  function drawChain(x0, y0, x1, y1, phase, slack) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.floor(len / 4);
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = Math.round(x0 + (x1 - x0) * k);
      const y = Math.round(y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * slack);
      const glint = !REDUCED && Math.abs(((t * 0.6 + phase) % 1.6) - k) < 0.07;
      const hi = glint ? "W" : "g", lo = glint ? "C" : "P";
      if (i % 2 === 0) {
        // ring: 5x5 plum outline, steel rim lit top-left, hollow centre
        rect(x - 2, y - 2, 5, 5, "K");
        rect(x - 1, y - 1, 3, 3, hi);
        rect(x, y, 2, 2, lo);
        rect(x, y, 1, 1, "K");        // the hole
      } else {
        // edge-on link: chunky 3x3 bar
        rect(x - 1, y - 1, 3, 3, "K");
        rect(x - 1, y, 2, 1, glint ? "W" : "D");
      }
    }
  }

  function drawPadlock(cx, cy, open) {
    // shackle (pops up 4px and the left leg slips out when open)
    const sy = open ? cy - 4 : cy;
    rect(cx - 5, sy - 9, 10, 2, "K");
    rect(cx - 6, sy - 8, 2, open ? 5 : 8, "K");
    rect(cx + 4, sy - 8, 2, open ? 12 : 8, "K");
    rect(cx - 4, sy - 8, 8, 1, "g");
    rect(cx - 5, sy - 7, 1, open ? 4 : 7, "g");
    rect(cx + 4, sy - 7, 1, open ? 11 : 7, "D");
    // body
    rect(cx - 8, cy - 1, 16, 13, "K");
    rect(cx - 7, cy, 14, 11, "Y");
    rect(cx - 7, cy, 14, 2, "W");
    rect(cx + 4, cy + 1, 3, 10, "O");
    rect(cx - 7, cy + 9, 14, 2, "O");
    // heart-shaped keyhole
    dot(cx - 2, cy + 3, "K"); dot(cx + 1, cy + 3, "K");
    rect(cx - 2, cy + 4, 4, 1, "K");
    rect(cx - 1, cy + 5, 2, 3, "K");
  }

  function drawBubble(text, cx, y) {
    const w = font.measure(text) + 8, h = 11;
    const x = Math.round(Math.min(LW - w - 1, Math.max(1, cx - w / 2)));
    rect(x + 1, y, w - 2, h, "K");
    rect(x, y + 1, w, h - 2, "K");
    rect(x + 1, y + 1, w - 2, h - 2, "W");
    rect(cx - 1, y + h - 1, 3, 1, "W");
    rect(cx - 1, y + h, 3, 1, "K");
    dot(cx, y + h + 1, "K");
    font.text(ctx, text, x + 4, y + 3, { color: "m", outline: null });
  }

  /* ---------------------------------------------------- key box + key --
     Little chest on the floor to the right. Correct password => lid flips,
     key rises out, arcs over to the padlock, turns, shackle pops, unwrap. */
  const KB = { x: 97, y: 80, w: 17, h: 12 };
  const KEY = [ // 11x5, pointing RIGHT (bow on the left)
    ".KKK.......",
    "KYWYKKKKKKK",
    "KY.YYYYYYYK",
    "KYYYKKKYKYK",
    ".KKK...K.K.",
  ];
  let keyAnim = null, kbShake = 0, padOpen = false;

  function drawKeyBox(lidOpen) {
    const s = kbShake > 0 ? Math.round(Math.sin(t * 60) * 1) : 0;
    const x = KB.x + s, y = KB.y;
    rect(x - 1, y + KB.h, KB.w + 2, 1, "P");                  // shadow
    // body: peach chest, yellow metal bands, heart keyhole plate
    rect(x, y + 4, KB.w, KB.h - 4, "K");
    rect(x + 1, y + 5, KB.w - 2, KB.h - 6, "O");
    rect(x + 1, y + 5, KB.w - 2, 1, "Y");
    rect(x + KB.w - 3, y + 5, 2, KB.h - 6, "R");
    rect(x + 3, y + 4, 1, KB.h - 4, "K"); rect(x + KB.w - 4, y + 4, 1, KB.h - 4, "K");
    rect(x + 6, y + 6, 5, 4, "K"); rect(x + 7, y + 7, 3, 2, "Y"); dot(x + 8, y + 8, "K");
    if (lidOpen) { // lid flipped back: thin slab standing up behind
      rect(x, y - 3, KB.w, 4, "K");
      rect(x + 1, y - 2, KB.w - 2, 2, "R");
      rect(x + 1, y + 3, KB.w - 2, 2, "K");                   // dark inside
    } else {
      rect(x, y, KB.w, 5, "K");
      rect(x + 1, y + 1, KB.w - 2, 3, "O");
      rect(x + 1, y + 1, KB.w - 2, 1, "Y");
      rect(x + KB.w - 3, y + 1, 2, 3, "R");
    }
    // bobbing "?" invites a click (hidden once the key is on its way)
    if (!keyAnim && !breaking) {
      const by = y - 9 + (REDUCED ? 0 : Math.round(Math.sin(t * 3)));
      font.text(ctx, "?", x + KB.w / 2 - 1, by, { color: "Y", outline: "K" });
    }
  }

  // draw the key with its TIP at (tx, ty); flip = pointing left; sy squashes
  // vertically to fake the turn in the lock
  function drawKey(tx, ty, flip, sy = 1) {
    const img = HB.compileSprite(KEY);
    const h = Math.max(1, Math.round(5 * Math.abs(sy)));
    ctx.save();
    ctx.translate(Math.round(flip ? tx : tx - 11), Math.round(ty - h / 2));
    if (flip) ctx.scale(-1, 1);
    if (flip) ctx.translate(-11, 0);
    ctx.drawImage(img, 0, 0, 11, 5, 0, 0, 11, h);
    ctx.restore();
  }

  function startKey() {
    keyAnim = { t: 0, clicked: false, popped: false };
    HB.audio.sfx.unwrap();
  }
  function updateKey(dt, padX, padY) {
    const k = keyAnim;
    if (!k) return;
    k.t += dt;
    const sx = KB.x + KB.w / 2 + 5, sy0 = KB.y + 2;        // tip start, inside the box
    const hole = { x: padX + 1, y: padY + 5 };              // keyhole (tip goes here)
    if (k.t < 0.5) {                                        // rise out of the box
      const p = k.t / 0.5;
      drawKey(sx, sy0 - p * 12, true);
      if (Math.random() < 0.5) sparkles.push({ x: sx + rand(-6, 6), y: sy0 - p * 12 + rand(-3, 3), life: 0.8 });
    } else if (k.t < 1.4) {                                 // arc over to the lock
      const p = (k.t - 0.5) / 0.9, e = p * p * (3 - 2 * p);
      const x = sx + (hole.x + 5 - sx) * e;                 // stop with the tip 5px short
      const y = sy0 - 12 + (hole.y - (sy0 - 12)) * e - Math.sin(e * Math.PI) * 18;
      drawKey(x, y, true);
    } else if (k.t < 1.7) {                                 // slide into the hole
      const p = (k.t - 1.4) / 0.3;
      drawKey(hole.x + 5 - p * 5, hole.y, true);
    } else if (k.t < 2.3) {                                 // turn it
      const p = (k.t - 1.7) / 0.6;
      drawKey(hole.x, hole.y, true, Math.cos(p * Math.PI));
      if (!k.clicked && p > 0.5) { k.clicked = true; HB.audio.sfx.clank(); }
    } else {
      drawKey(hole.x, hole.y, true, -1);
      if (!k.popped) {
        k.popped = true; padOpen = true; lockBounce = 0.4;
        HB.audio.sfx.unlock();
        bubbleText = "CLICK!"; bubbleT = 1;
        setTimeout(() => unlock(mode() === "wait"), 500);
      }
    }
  }

  /* ------------------------------------------------------------ frame --- */
  function render(dt) {
    t += dt;
    shake = Math.max(0, shake - dt);
    lockBounce = Math.max(0, lockBounce - dt);
    bubbleT = Math.max(0, bubbleT - dt);
    kbShake = Math.max(0, kbShake - dt);

    // background: soft lavender with a dithered spotlight glow behind the gift
    rect(0, 0, LW, LH, "F");
    for (let y = 0; y < LH; y++)
      for (let x = (y % 2); x < LW; x += 2) {
        const d = Math.hypot((x - 60) / 1.2, y - 62);
        if (d < 46) dot(x, y, d < 32 ? "C" : "g");
      }
    rect(0, 92, LW, LH - 92, "D");

    // idle "it wants out" hop every ~3s, big rattle when clicked
    let ox = 0, oy = 0;
    if (!REDUCED) {
      const hop = t % 3;
      if (hop < 0.5) { oy = -Math.round(Math.abs(Math.sin(hop * Math.PI * 4)) * 2); ox = Math.round(Math.sin(hop * 40)); }
      if (shake > 0) { ox = Math.round(Math.sin(t * 70) * 2 * (shake / 0.6)); oy = -1; }
    }

    drawGift(ox, oy);
    if (!breaking || breakT < 0.05) {
      const slack = 1.5 + (shake > 0 ? Math.sin(t * 50) : Math.sin(t * 2) * 0.5);
      // chains wrap the present in an X plus one across the middle
      drawChain(BOX.x - 2 + ox, LID.y + 1 + oy, BOX.x + BOX.w + 2 + ox, BOX.y + BOX.h - 2 + oy, 0, slack);
      drawChain(BOX.x + BOX.w + 2 + ox, LID.y + 1 + oy, BOX.x - 2 + ox, BOX.y + BOX.h - 2 + oy, 0.8, slack);
      drawChain(BOX.x - 3 + ox, BOX.y + 12 + oy, BOX.x + BOX.w + 3 + ox, BOX.y + 12 + oy, 0.4, slack * 0.6);
      const swing = REDUCED || keyAnim ? 0 : Math.round(Math.sin(t * (shake > 0 ? 20 : 2.2)) * (shake > 0 ? 2 : 1));
      const bounce = lockBounce > 0 ? -Math.round(Math.sin((lockBounce / 0.4) * Math.PI) * 4) : 0;
      drawPadlock(60 + ox + swing, BOX.y + 15 + oy + bounce, padOpen);
    }
    drawKeyBox(!!keyAnim);
    if (!breaking || breakT < 0.05) updateKey(dt, 60 + ox, BOX.y + 15 + oy);

    // sparkles drifting up around the present
    if (!REDUCED && Math.random() < dt * 6) sparkles.push({ x: rand(22, 98), y: rand(50, 92), life: 1.4 });
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.life -= dt; s.y -= dt * 8;
      if (s.life <= 0) { sparkles.splice(i, 1); continue; }
      const c = s.life > 0.7 ? "W" : "Y";
      dot(s.x, s.y, c);
      if (s.life > 1) { dot(s.x - 1, s.y, "Y"); dot(s.x + 1, s.y, "Y"); dot(s.x, s.y - 1, "Y"); dot(s.x, s.y + 1, "Y"); }
    }
    // broken chain bits when it unlocks
    for (let i = bits.length - 1; i >= 0; i--) {
      const p = bits[i];
      p.life -= dt; p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) { bits.splice(i, 1); continue; }
      rect(p.x, p.y, 2, 2, p.c);
    }

    if (bubbleT > 0) drawBubble(bubbleText, 60, 6);
    else if (!breaking && Math.floor(t * 1.5) % 2 === 0)
      font.text(ctx, mode() === "day" ? "USE THE KEY!" : "LOCKED", 60, 10, { color: mode() === "day" ? "Y" : "W", outline: "K", align: "center" });
    // on the day: a bouncing arrow points at the key box
    if (mode() === "day" && !keyAnim && !breaking) {
      const ax = KB.x - 9 - (REDUCED ? 0 : Math.round(Math.abs(Math.sin(t * 4)) * 3)), ay = KB.y + 4;
      rect(ax, ay, 6, 3, "K"); rect(ax + 6, ay - 2, 1, 7, "K"); rect(ax + 7, ay - 1, 1, 5, "K"); rect(ax + 8, ay, 1, 3, "K"); rect(ax + 9, ay + 1, 1, 1, "K");
      rect(ax + 1, ay + 1, 6, 1, "Y"); rect(ax + 7, ay, 1, 3, "Y");
    }
  }

  /* ------------------------------------------------------------ input --- */
  const BUBBLES = {
    wait: ["NOT YET!", "OPENS OCT 12!", "NO PEEKING!", "PATIENCE...", "SOON!"],
    day:  ["VIP ONLY!", "USE THE KEY!", "ONLY FOR YOU ♥", "WHO GOES THERE?", "KEY PLEASE!"],
  };
  const MSGS = {
    wait: () => `THIS PRESENT UNLOCKS ON <b>${DATE_LABEL}</b> ♥`,
    day: [
      () => "THIS PRESENT IS FOR ONE <b>VERY SPECIAL PERSON</b> ONLY. IF THAT'S YOU, USE THE <b>KEY BOX</b> →",
      () => "SORRY, <b>BIRTHDAY STAR ONLY</b>! THE CHAINS WON'T BUDGE WITHOUT THE KEY →",
      () => "ONLY THE <b>BIRTHDAY STAR</b> KNOWS THE PASSWORD. TRY THE <b>KEY BOX</b> →",
      () => "NO KEY, NO CAKE! <b>USE THE KEY BOX</b> TO OPEN YOUR PRESENT →",
    ],
  };
  const mode = () => (Date.now() < UNLOCK_AT.getTime() ? "wait" : "day");
  let bubbleText = BUBBLES.wait[0], clicks = 0;
  function poke() {
    if (breaking) return;
    shake = 0.6; lockBounce = 0.4; bubbleT = 1.8;
    const m = mode(), list = BUBBLES[m];
    bubbleText = list[clicks % list.length];
    msg.innerHTML = m === "wait" ? MSGS.wait() : MSGS.day[clicks % MSGS.day.length]();
    clicks++;
    if (m === "day") kbShake = 0.4; // nudge attention toward the key box
    msg.classList.remove("pulse"); void msg.offsetWidth; msg.classList.add("pulse");
    HB.audio.sfx.clank();
  }
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * LW, y = ((e.clientY - r.top) / r.height) * LH;
    // preventDefault stops the canvas taking focus back from the password field
    if (x >= KB.x - 3 && x <= KB.x + KB.w + 3 && y >= KB.y - 12 && y <= KB.y + KB.h + 2) { e.preventDefault(); openKeybox(); }
    else poke();
  });
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke(); }
    if (e.key === "k" || e.key === "K") { e.preventDefault(); openKeybox(); }
  });

  /* password popup (HTML, inside the lock overlay) */
  const kbPanel = document.getElementById("keybox");
  const kbForm = document.getElementById("keybox-form");
  const kbInput = document.getElementById("keybox-input");
  const kbErr = document.getElementById("keybox-err");
  document.getElementById("keybox-hint").textContent = `HINT: ${HINT}`;
  function openKeybox() {
    if (breaking || keyAnim) return;
    HB.audio.sfx.click();
    kbShake = 0.25;
    kbPanel.hidden = false;
    kbErr.textContent = "";
    kbInput.value = "";
    kbInput.focus();
  }
  function closeKeybox() {
    kbPanel.hidden = true;
    canvas.focus({ preventScroll: true });
  }
  kbInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); kbForm.requestSubmit(); }
  });
  kbInput.addEventListener("input", () => {
    const pos = kbInput.selectionStart;
    kbInput.value = kbInput.value.toUpperCase();
    kbInput.setSelectionRange(pos, pos);
  });
  kbForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const guess = kbInput.value.trim().toUpperCase(); // exact match: "COCONUT"
    if (fnv1a(guess) === ANSWER_HASH) {
      bypassed = true;
      // iPhones only allow audio started from inside a tap/keypress; the song
      // starts ~5 s later, so unlock the audio NOW while we're in the gesture
      HB.audio.ensure();
      if (HB.ui && HB.ui.primeSong) HB.ui.primeSong();
      kbPanel.hidden = true;
      msg.innerHTML = "<b>THE KEY FITS!</b>";
      startKey();
    } else {
      kbErr.textContent = guess ? "NOPE! TRY AGAIN" : "TYPE SOMETHING FIRST";
      kbForm.classList.remove("wrong"); void kbForm.offsetWidth; kbForm.classList.add("wrong");
      kbShake = 0.5;
      HB.audio.sfx.clank();
      kbInput.select();
    }
  });
  document.getElementById("keybox-cancel").addEventListener("click", closeKeybox);
  kbPanel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeKeybox(); } });
  kbPanel.addEventListener("pointerdown", (e) => { if (e.target === kbPanel) closeKeybox(); });

  /* ------------------------------------------------------------ countdown */
  function updateCount() {
    const ms = UNLOCK_AT.getTime() - Date.now();
    if (ms <= 0) return enterDay();
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, sec = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    countEl.textContent = `OPENS IN ${d}D ${pad(h)}H ${pad(m)}M ${pad(sec)}S`;
  }

  // It's the day: the lock stays, but now it's waiting for the right person.
  let isDay = false;
  function enterDay() {
    if (isDay) return;
    const announce = document.readyState === "complete" && countEl.textContent !== ""; // ticked over while open
    isDay = true;
    clearInterval(countTimer);
    document.getElementById("lock-title").textContent = "IT'S THE BIG DAY!";
    countEl.textContent = "★ BIRTHDAY STAR ONLY ★";
    msg.innerHTML = MSGS.day[0]();
    if (announce) {
      for (let i = 0; i < 24; i++) sparkles.push({ x: rand(20, 100), y: rand(30, 90), life: rand(0.8, 1.6) });
      shake = 0.6; bubbleText = "IT'S TIME!"; bubbleT = 2;
      HB.audio.sfx.twinkle();
    }
  }

  function unlock(early) {
    if (breaking) return;
    breaking = true;
    clearInterval(countTimer);
    countEl.textContent = early ? "UNLOCKED EARLY!" : "WELCOME, BIRTHDAY STAR!";
    msg.innerHTML = "<b>HAPPY BIRTHDAY!</b> UNWRAPPING...";
    for (let i = 0; i < 30; i++) bits.push({ x: rand(32, 88), y: rand(40, 88), vx: rand(-60, 60), vy: rand(-90, -30), life: 1.5, c: i % 2 ? "g" : "P" });
    HB.audio.sfx.unwrap && HB.audio.sfx.unwrap();
    setTimeout(() => {
      // fade straight into the game: the password entry was the user gesture
      // that lets audio play, so the Press Start screen isn't needed
      const startEl = document.getElementById("start");
      if (startEl) startEl.hidden = true;
      root.classList.add("is-open");
      behind.forEach((el) => el && (el.inert = false));
      setTimeout(() => {
        root.remove();
        // transition fully done -> ui.js starts the song + goals popup timer
        window.dispatchEvent(new Event("hb:unlocked"));
      }, 600);
    }, 1400);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (breaking) breakT += dt;
    render(dt);
    if (root.isConnected) requestAnimationFrame(loop);
  }
  let countTimer = 0;
  updateCount();
  if (!isDay) countTimer = setInterval(updateCount, 1000);
  requestAnimationFrame(loop);
  // focusing is for keyboard users; on phones it just draws a focus ring
  if (!TOUCHY) canvas.focus({ preventScroll: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCanvas);
})(window.HB);
