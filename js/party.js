/* ==========================================================================
   THE PARTY SCENE
   --------------------------------------------------------------------------
   Renders at a tiny logical resolution (LH = 120 px tall, width adapts to
   the screen) and lets the browser upscale by an integer factor with
   `image-rendering: pixelated` — so every sprite pixel is a crisp square.

   Simulation runs at a fixed 60 Hz step; sprite animation frames run at
   their own slower rates (6–10 fps) for that hand-animated feel.

   Sections:
     1. setup + helpers          5. pup (state machine)
     2. state + layout           6. update
     3. background (baked)       7. render
     4. actions (pop, blow...)   8. input, loop, public API
   ========================================================================== */
(function (HB) {
  "use strict";

  /* ------------------------------------------------------------------ 1 */
  const P = HB.PALETTE, S = HB.SPRITES, draw = HB.draw, font = HB.font;
  const sfx = HB.audio.sfx;
  const params = HB.params || {};
  const ui = HB.ui || {};

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const LH = 120;              // logical WORLD height (fixed; everything is laid out in it)
  let SKY = 0;                 // extra sky rows above the world on tall (portrait) screens
  let CH = LH;                 // canvas height = LH + SKY
  // fingers are less precise than mice: grow tap boxes on touch screens
  const TOUCH = window.matchMedia("(pointer: coarse)").matches ? 3 : 0;
  let LW = 200;                // logical width (adapts to aspect ratio)
  const GROUND = LH - 20;      // first grass row
  const FEET = GROUND + 6;     // where things "stand"

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dot = (c, x, y, col) => { c.fillStyle = P[col] || col; c.fillRect(Math.round(x), Math.round(y), 1, 1); };
  function seeded(seed) { // mulberry32 — stable scenery across resizes
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  /* ------------------------------------------------------------------ 2 */
  const GOALS = [
    { id: "wish",  name: "MAKE A WISH",  desc: "Blow out every candle" },
    { id: "pop",   name: "POP STAR",     desc: "Pop 10 balloons" },
    { id: "pet",   name: "GOOD PUP",     desc: "Pet the pup 5 times" },
    { id: "gifts", name: "UNWRAPPED",    desc: "Open every present" },
    { id: "fw",    name: "SKY PAINTER",  desc: "Launch 5 sky sparkles" },
    { id: "fetch", name: "FETCH!",       desc: "Throw the ball for the pup 3 times" },
    { id: "topgun", name: "TOP GUN",     desc: "Make the Tomcat do a barrel roll" },
  ];

  const nameOk = params.name && font.supports(params.name);
  const WISHES = [
    "YAY!", "BEST DAY EVER", "STAY AWESOME", "MORE CAKE!", "WOOF WOOF",
    "LEVEL UP!", "HUGS!", "YOU ROCK", "SO LOVED", "PARTY TIME", "WISH BIG",
    "HIP HIP HOORAY", "♥ ♥ ♥", "CAKE O'CLOCK",
  ].concat(nameOk ? [`HI ${params.name}!`, `GO ${params.name}!`] : []);

  const state = {
    t: 0, lastInput: 0,
    pops: 0, pets: 0, fireworks: 0,
    goals: new Set(),
    partyT: 0, autoFwT: 0,
    sunClicks: 0, sunCool: false,
    celebrated: false, legend: false, rewarded: false,
    fetches: 0,
    jetT: Infinity, // countdown to the next automatic F-14 flyby
  };

  let clouds = [], butterflies = [], flags = [];
  const balloons = [], particles = [], floaters = [], rockets = [];
  const paws = [], treats = [], banners = [], flyers = [];
  let candles = [], gifts = [];
  const L = {}; // layout: table, plate, cake, sun

  const dog = {
    x: 30, jy: 0, vy: 0, facing: 1, state: "idle",
    anim: 0, idleT: 3, blinkT: 3, happyT: 0, mouthT: 0,
    target: null, run: false, eatT: 0, zT: 0,
    bubble: null, bubbleT: 0, hat: "party", manual: 0,
  };
  const dogY = () => FEET - 16 + dog.jy;
  const DOG_W = 24;
  const headX = () => dog.x + (dog.facing > 0 ? 14 : DOG_W - 14); // centre of the pup's face

  function layout() {
    L.table = { x: LW - 36 - 6, y: FEET - 12 };
    L.plate = { x: L.table.x + 4, y: L.table.y - 2 };
    L.cake = { x: L.table.x + 6, y: L.plate.y - 12 };
    L.sun = { x: Math.round(LW * 0.12), y: 22 };
    L.dogMin = 2;
    L.dogMax = LW - 26;

    const giftDefs = [
      { kind: "bone",     sw: { a: "B", b: "S", c: "C", r: "Y", s: "O" }, x: L.table.x - 13 },
      { kind: "crown",    sw: { a: "m", b: "p", c: "W", r: "S", s: "B" }, x: L.table.x - 26 },
      { kind: "balloons", sw: { a: "T", b: "G", c: "L", r: "m", s: "P" }, x: LW - 14 },
    ];
    if (!gifts.length) {
      gifts = giftDefs.map((g) => ({ ...g, y: FEET - 11, open: false, lid: null }));
    } else {
      gifts.forEach((g, i) => { g.x = giftDefs[i].x; });
    }
    buildCandles();

    const r = seeded(7);
    const prevX = clouds.map((c) => c.x);
    clouds = Array.from({ length: Math.max(3, Math.round(LW / 55)) + Math.round(SKY / 30) }, (_, i) => ({
      x: r() * LW, y: 6 + Math.floor(r() * 34) - Math.floor(r() * SKY * 0.85), small: i % 2 === 1, speed: 1.5 + r() * 2.5,
    }));
    clouds.forEach((c, i) => { if (prevX[i] != null) c.x = prevX[i]; }); // no jump on resize

    flags = [];
    const flagCols = [["p", "m"], ["Y", "O"], ["S", "B"], ["L", "G"], ["g", "D"]];
    for (let x = 3, i = 0; x < LW - 3; x += 8, i++) flags.push({ x, y: wireY(x + 2), sw: { b: flagCols[i % 5][0], a: flagCols[i % 5][1] }, i });

    if (!butterflies.length)
      butterflies = Array.from({ length: 4 }, (_, i) => ({
        x: rand(0, LW), y: rand(70, 94), ph: rand(0, 6), vx: rand(6, 12) * (i % 2 ? 1 : -1),
        sw: { b: ["p", "Y", "S", "D"][i] },
      }));

    dog.x = clamp(dog.x, L.dogMin, L.dogMax);
    bakeBackground();
  }

  function wireY(x) {
    const half = LW / 2, u = (x - half) / half;
    return Math.round(3 + 13 * (1 - u * u));
  }

  function buildCandles() {
    const prev = candles;
    const age = params.age;
    const cx = L.cake.x, cy = L.cake.y;
    candles = [];
    if (age && age >= 8) {
      // number candles, one per digit
      const digits = String(age).slice(0, 3).split("");
      const w = digits.length * 8 - 2;
      const x0 = Math.round(cx + 12 - w / 2);
      digits.forEach((d, i) => candles.push({ kind: "digit", ch: d, x: x0 + i * 8, y: cy - 10, w: 6, color: i % 2 ? "p" : "S", lit: true }));
    } else {
      const n = age || 5;
      const stripes = ["S", "p", "L", "Y", "C", "O", "m"];
      const slot = 22 / n;
      for (let i = 0; i < n; i++) {
        candles.push({ kind: "stick", x: cx + 1 + Math.floor(slot * (i + 0.5)) - 1, y: cy - 6, w: 2, color: stripes[i % stripes.length], lit: true });
      }
    }
    candles.forEach((c, i) => { if (prev[i]) c.lit = prev[i].lit; c.ph = Math.random() * 3; });
  }

  /* ------------------------------------------------------------------ 3 */
  const bg = document.createElement("canvas");
  function bakeBackground() {
    bg.width = LW; bg.height = LH;
    const b = bg.getContext("2d");
    const r = seeded(42);

    // sky: pastel day bands with ordered-dither transitions
    const bands = [[0, "N"], [20, "S"], [44, "C"], [62, "p"], [72, "Y"]];
    for (let y = 0; y < GROUND; y++) {
      for (let x = 0; x < LW; x++) {
        let col = bands[0][1];
        for (let i = 0; i < bands.length; i++) {
          const [by, c] = bands[i];
          if (y >= by + 3) col = c;
          else if (y >= by - 3 && i > 0) {
            const t = (y - (by - 3)) / 6; // 0..1 through the transition
            col = BAYER[y & 3][x & 3] < t * 16 ? c : bands[i - 1][1];
            break;
          } else break;
        }
        dot(b, x, y, col);
      }
    }

    // secret rainbow, drawn into the sky before the hills cover its feet
    if (state.sunCool) {
      const cx = LW * 0.55, cy = GROUND + 6, cols = ["m", "R", "O", "Y", "L", "S", "D"];
      for (let y = 0; y < GROUND; y++) for (let x = 0; x < LW; x++) {
        const k = Math.floor((Math.hypot(x - cx, (y - cy) * 1.15) - 48) / 2);
        if (k >= 0 && k < cols.length) dot(b, x, y, cols[k]);
      }
    }

    // far hills + tiny village of pastel cottages
    const farY = (x) => Math.round(72 + 4 * Math.sin(x * 0.045 + 0.5) + 2 * Math.sin(x * 0.11));
    for (let x = 0; x < LW; x++) for (let y = farY(x); y < GROUND; y++) dot(b, x, y, "F");
    for (let i = 0; i < Math.max(2, LW / 60); i++) {
      const hx = Math.floor(10 + r() * (LW - 20)), hy = farY(hx);
      b.fillStyle = P.W;
      b.fillRect(hx - 2, hy - 3, 5, 4);
      b.fillStyle = P[["m", "S", "R"][Math.floor(r() * 3)]];
      b.fillRect(hx - 3, hy - 4, 7, 1);
      b.fillRect(hx - 2, hy - 5, 5, 1);
      b.fillRect(hx - 1, hy - 6, 3, 1);
      dot(b, hx - 1, hy - 2, "S");
      dot(b, hx + 1, hy - 1, "P");
    }
    // near hills
    const nearY = (x) => Math.round(84 + 3 * Math.sin(x * 0.06 + 2) + 1.5 * Math.sin(x * 0.17));
    for (let x = 0; x < LW; x++) {
      const ny = nearY(x);
      for (let y = ny; y < GROUND; y++) dot(b, x, y, y === ny ? "G" : "T");
    }
    // ground: lit top edge, dithered fade to teal
    for (let y = GROUND; y < LH; y++) {
      for (let x = 0; x < LW; x++) {
        let col = y === GROUND ? "L" : "G";
        const d = y - (GROUND + 8);
        if (d >= 0) col = BAYER[y & 3][x & 3] < Math.min(16, d * 3) ? "T" : "G";
        dot(b, x, y, col);
      }
    }
    // grass tufts + flowers
    for (let i = 0; i < LW / 4; i++) {
      const x = Math.floor(r() * LW), y = GROUND + Math.floor(r() * 14);
      if (y === GROUND) { dot(b, x, y - 1, "L"); dot(b, x + 2, y - 1, "L"); }
      else if (r() < 0.25) { dot(b, x, y, pick(["p", "Y", "W"])); dot(b, x, y + 1, "T"); }
      else dot(b, x, y, "L");
    }
    // bunting string
    for (let x = 0; x < LW; x++) dot(b, x, wireY(x), "D");
  }

  /* ------------------------------------------------------------------ 4 */
  function burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle != null ? opts.angle + rand(-opts.spread, opts.spread) : rand(0, Math.PI * 2);
      const sp = rand(opts.min || 15, opts.max || 50);
      particles.push({
        kind: "confetti", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 20),
        g: 60, drag: 1.5, life: rand(1.6, 2.6), max: 2.6, color: pick(opts.colors || HB.CONFETTI), ph: rand(0, 6),
      });
    }
  }

  function floatText(text, x, y, color = "W", opts = {}) {
    floaters.push({ text, x, y, vy: opts.vy || -14, life: opts.life || 1.6, max: opts.life || 1.6, color, scale: opts.scale || 1 });
  }
  function hearts(x, y, n = 3) {
    for (let i = 0; i < n; i++) floaters.push({ sprite: S.HEART, x: x + rand(-6, 6), y: y + rand(-2, 2), vy: rand(-16, -10), life: 1.2 + i * 0.15, max: 1.4 });
  }
  function banner(text, color = "Y", dur = 2.4, big = false) {
    banners.push({ text, color, t: 0, dur, big });
    if (ui.announce) ui.announce(text.replace(/\*/g, "").trim());
  }
  function say(text, dur = 1.1) { dog.bubble = text; dog.bubbleT = dur; }

  function unlock(id) {
    if (state.goals.has(id)) return;
    state.goals.add(id);
    const g = GOALS.find((x) => x.id === id);
    banner(`* ${g.name} *`, "Y", 2.6);
    sfx.unlock();
    if (ui.updateGoals) ui.updateGoals(GOALS, state.goals);
    if (state.goals.size === GOALS.length && !state.rewarded) {
      state.rewarded = true;
      state.legend = true;
      setTimeout(() => { banner("REWARD UNLOCKED!", "p", 3.5, true); party(8); }, 1800);
      setTimeout(() => ui.unlockReward && ui.unlockReward(), 4500);
    }
  }

  function spawnBalloon(opts = {}) {
    const ramps = Object.keys(HB.BALLOON_RAMPS);
    const gold = !opts.color && Math.random() < 0.08;
    const ramp = gold ? HB.BALLOON_RAMPS.yellow : HB.BALLOON_RAMPS[opts.color || pick(ramps)];
    balloons.push({
      x: opts.x != null ? opts.x : rand(4, LW - 13),
      y: opts.y != null ? opts.y : (REDUCED ? rand(20, 70) : LH + rand(4, 40)),
      vy: rand(-13, -7), ph: rand(0, 6), gold,
      sw: { a: ramp[0], b: ramp[1], c: ramp[2] }, ambient: opts.ambient !== false,
    });
  }

  function popBalloon(b) {
    const i = balloons.indexOf(b);
    if (i < 0) return;
    balloons.splice(i, 1);
    const bx = b.x + Math.sin(state.t * 1.2 + b.ph) * 2;
    particles.push({ kind: "sprite", grid: S.POP, x: bx, y: b.y, life: 0.15, max: 0.15 });
    for (let k = 0; k < 8; k++) {
      const a = rand(0, Math.PI * 2);
      particles.push({ kind: "pix", x: bx + 4, y: b.y + 4, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, g: 120, drag: 2, life: 0.8, max: 0.8, color: pick([b.sw.a, b.sw.b]) });
    }
    sfx.pop();
    state.pops++;
    if (b.gold) {
      floatText("JACKPOT!", bx + 4, b.y, "Y", { scale: 1, life: 2 });
      burst(bx + 4, b.y + 4, 30, { colors: ["Y", "O", "W"] });
      for (let k = 0; k < 3; k++) setTimeout(() => launch(rand(20, LW - 20), rand(14, 40)), k * 250);
    } else {
      floatText(pick(WISHES), bx + 4, b.y, pick(["W", "Y", "C", "p", "L"]));
    }
    if (state.pops >= 10) unlock("pop");
    if (dog.state === "idle" && Math.abs(bx - dog.x - 12) < 40 && Math.random() < 0.5) {
      dog.facing = bx > dog.x + 12 ? 1 : -1;
      bark("!");
    }
    if (b.ambient && !REDUCED) setTimeout(() => spawnBalloon(), rand(800, 3000));
  }

  function launch(tx, ty, rampName) {
    const ramp = HB.FIRE_RAMPS[rampName || pick(Object.keys(HB.FIRE_RAMPS))];
    rockets.push({ x: tx + rand(-6, 6), sx: tx, y: GROUND + 2, tx, ty, ramp });
    sfx.launch();
  }
  function explode(r) {
    sfx.boom();
    const n = 34;
    const ring = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.08, 0.08);
      const sp = ring ? rand(30, 36) : rand(8, 38);
      particles.push({ kind: "spark", layer: "sky", x: r.tx, y: r.ty, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 22, drag: 1.4, life: rand(1, 1.6), max: 1.6, ramp: r.ramp, trail: [] });
    }
    particles.push({ kind: "flash", layer: "sky", x: r.tx, y: r.ty, life: 0.1, max: 0.1 });
    if (dog.state === "idle" && Math.random() < 0.3) bark(pick(["WOW!", "!", "OOH"]));
  }

  function blowCandle(c) {
    if (!c || !c.lit) return false;
    c.lit = false;
    for (let k = 0; k < 6; k++) {
      particles.push({ kind: "smoke", x: c.x + c.w / 2, y: c.y - 2, vx: rand(-2, 4), vy: rand(-14, -8), g: 0, drag: 0.5, life: rand(1, 1.8), max: 1.8, ph: rand(0, 6) });
    }
    sfx.fizz();
    if (candles.every((x) => !x.lit)) setTimeout(celebrate, 400);
    return true;
  }
  function wind() {
    for (let k = 0; k < 10; k++) {
      particles.push({ kind: "pix", x: L.cake.x - rand(20, 40), y: L.cake.y - rand(2, 14), vx: rand(60, 90), vy: rand(-4, 4), g: 0, drag: 0, life: 0.6, max: 0.6, color: pick(["W", "g"]) });
    }
  }
  function blowAll() {
    const lit = candles.filter((c) => c.lit);
    if (!lit.length) { banner("ALL OUT! RELIGHT?", "W", 1.6); return; }
    sfx.blow();
    wind();
    lit.forEach((c, i) => setTimeout(() => blowCandle(c), 120 + i * 110));
  }
  function relight() {
    candles.forEach((c) => { c.lit = true; });
    gifts.forEach((g) => { g.open = false; g.lid = null; });
    state.celebrated = false;
    sfx.relight();
    banner("PARTY AGAIN!", "p", 1.6);
  }

  function celebrate() {
    if (state.celebrated) return;
    state.celebrated = true;
    unlock("wish");
    banner("HAPPY BIRTHDAY!", "p", 3, true);
    party(6);
    burst(4, FEET, 40, { angle: -Math.PI / 3, spread: 0.4, min: 50, max: 90, up: 0 });
    burst(LW - 4, FEET, 40, { angle: -Math.PI * 2 / 3, spread: 0.4, min: 50, max: 90, up: 0 });
    if (!HB.audio.isMuted() && !(ui.songPlaying && ui.songPlaying())) HB.audio.playSong();
    setTimeout(flyby, 1200);
    setTimeout(() => ui.openCard && ui.openCard(), 4200);
  }
  function party(sec) {
    state.partyT = Math.max(state.partyT, sec);
    state.autoFwT = 0;
  }

  function openGift(g) {
    if (g.open) return;
    g.open = true;
    g.lid = { x: g.x, y: g.y, vx: rand(-25, 25), vy: -70, rot: 0 };
    sfx.unwrap();
    burst(g.x + 5, g.y + 4, 16, { up: 40 });
    if (g.kind === "bone") {
      treats.push({ x: g.x + 2, y: g.y - 2, vx: rand(-30, -15), vy: -60, landed: false });
      floatText("A BONE!", g.x + 5, g.y - 8, "W");
    } else if (g.kind === "crown") {
      flyers.push({ grid: S.CROWN, x: g.x + 2, y: g.y - 4, t: 0, dur: 1.1 });
      floatText("FOR THE PUP?", g.x + 5, g.y - 8, "p");
    } else {
      for (let i = 0; i < 6; i++) spawnBalloon({ x: g.x + rand(-6, 6), y: g.y - i * 4, ambient: false });
      floatText("SURPRISE!", g.x + 5, g.y - 8, "L");
    }
    if (gifts.every((x) => x.open)) unlock("gifts");
  }

  function clickSun() {
    state.sunClicks++;
    sfx.twinkle();
    for (let k = 0; k < 6; k++) particles.push({ kind: "pix", layer: "sky", x: L.sun.x + 6, y: L.sun.y + 6, vx: rand(-30, 30), vy: rand(-30, 30), g: 0, drag: 2, life: 0.6, max: 0.6, color: pick(["W", "Y", "O"]) });
    if (state.sunClicks < 3) { floatText(state.sunClicks === 1 ? "HEHE" : "THAT TICKLES", L.sun.x + 6, L.sun.y + 14, "O"); return; }
    if (!state.sunCool) {
      state.sunCool = true;
      bakeBackground(); // paints the rainbow in
      floatText("STAY SUNNY!", L.sun.x + 6, L.sun.y + 14, "O");
      burst(L.sun.x + 6, L.sun.y + 6, 30, { colors: ["Y", "O", "W", "p"] });
    }
  }

  /* ---- F-14 Tomcat flyby: tows a birthday banner, leaves a pastel trail,
     does a barrel roll when clicked ---- */
  const JET_W = 40, JET_H = 15, ROLL_T = 0.9;
  let jet = null;
  function flyby() {
    if (jet) return false;
    const dir = Math.random() < 0.7 ? 1 : -1;
    const text = nameOk ? `HAPPY BIRTHDAY ${params.name}!` : "HAPPY BIRTHDAY!";
    const bw = font.measure(text) + 10;
    const speed = 62;
    jet = {
      dir, text, bw, speed, t: 0, roll: 0, barked: false,
      x: dir > 0 ? -JET_W - 2 : LW + 2,
      y: rand(18, 34) - Math.round(SKY * 0.5), // use the extra sky on tall screens
    };
    sfx.jet(clamp((LW + JET_W * 2) / speed, 2.5, 5));
    return true;
  }
  function rollJet() {
    if (!jet || jet.roll > 0) return;
    jet.roll = ROLL_T;
    sfx.roll();
    floatText("BARREL ROLL!", jet.x + JET_W / 2, jet.y + JET_H + 3, "Y", { vy: 6 });
    if (dog.state === "idle" || dog.state === "walk") bark(pick(["WOW!", "COOL!"]));
    unlock("topgun");
  }
  function updateJet(dt) {
    if (!jet) {
      if (!REDUCED || state.jetT < 30) {
        state.jetT -= dt;
        if (state.jetT <= 0) { flyby(); state.jetT = REDUCED ? Infinity : rand(45, 75); }
      }
      return;
    }
    const j = jet;
    j.t += dt;
    const boost = j.roll > 0 ? 1.6 : 1;
    j.x += j.dir * j.speed * boost * dt;
    j.y += Math.cos(j.t * 2) * 3 * dt;
    if (j.roll > 0) j.roll = Math.max(0, j.roll - dt);
    // pastel smoke trail from the nozzles
    if (!REDUCED && Math.random() < dt * 40) {
      const nx = j.dir > 0 ? j.x : j.x + JET_W;
      particles.push({ kind: "puff", layer: "sky", x: nx - j.dir * 3, y: j.y + 8.5 + rand(-1, 1), vx: -j.dir * 6, vy: rand(-2, 2), g: 0, drag: 1, life: 1.3, max: 1.3, color: pick(["p", "C", "Y", "L", "D"]) });
    }
    // the pup notices it going overhead
    if (!j.barked && Math.abs(j.x + JET_W / 2 - (dog.x + DOG_W / 2)) < 16) {
      j.barked = true;
      if (dog.state === "idle" || dog.state === "walk") { dog.facing = j.dir; bark(pick(["ZOOM!", "WOW!", "WOOF!"])); }
    }
    const tail = j.dir > 0 ? j.x - 12 - j.bw : j.x + JET_W + 12 + j.bw;
    if ((j.dir > 0 && tail > LW + 2) || (j.dir < 0 && tail < -2)) jet = null;
  }

  const bannerBufs = new Map();
  function bannerBuf(text, w) {
    let c = bannerBufs.get(text);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = w; c.height = 11;
    const x = c.getContext("2d");
    x.fillStyle = P.K; x.fillRect(0, 0, w, 11);
    x.fillStyle = P.W; x.fillRect(1, 1, w - 2, 9);
    x.fillStyle = P.p; x.fillRect(1, 1, w - 2, 1); x.fillRect(1, 9, w - 2, 1);
    font.text(x, text, Math.floor(w / 2), 3, { color: "m", outline: null, align: "center" });
    bannerBufs.set(text, c);
    return c;
  }

  function renderJet() {
    if (!jet) return;
    const j = jet, t = state.t;
    const x = Math.round(j.x), y = Math.round(j.y);

    // tow rope + waving banner (drawn in 1px columns offset by a sine wave)
    const gap = 12;
    const bx = j.dir > 0 ? x - gap - j.bw : x + JET_W + gap;
    const by = y + 4;
    const rx0 = j.dir > 0 ? x : x + JET_W - 1;
    const rx1 = j.dir > 0 ? bx + j.bw : bx - 1;
    for (let i = 0; i <= gap; i++) {
      const k = i / gap;
      dot(ctx, rx0 + (rx1 - rx0) * k, y + 9 + (by + 5 - (y + 9)) * k + Math.sin(k * Math.PI) * 1.5, "D");
    }
    const buf = bannerBuf(j.text, j.bw);
    for (let i = 0; i < j.bw; i++) {
      const fromRope = j.dir > 0 ? j.bw - i : i; // wave grows away from the rope
      const off = REDUCED ? 0 : Math.round(Math.sin(t * 7 - fromRope * 0.3) * Math.min(1, fromRope / 20));
      ctx.drawImage(buf, i, 0, 1, 11, bx + i, by + off, 1, 11);
    }

    // afterburner flicker behind the nozzles
    const fl = Math.floor(t * 20) % 3;
    const len = (j.roll > 0 ? 5 : 2) + fl;
    for (let i = 1; i <= len; i++) {
      const fx = j.dir > 0 ? x - i : x + JET_W - 1 + i;
      const col = i <= 1 ? "W" : i <= 2 ? "Y" : i <= 4 ? "O" : "R";
      dot(ctx, fx, y + 8, col);
      if (i < len - 1) dot(ctx, fx, y + 9, col === "W" ? "Y" : col);
    }

    // the jet itself; a barrel roll squashes it vertically through +1 .. -1
    const img = HB.compileSprite(S.F14);
    const sy = j.roll > 0 ? Math.cos((1 - j.roll / ROLL_T) * Math.PI * 2) : 1;
    const h = Math.max(1, Math.round(JET_H * Math.abs(sy)));
    ctx.save();
    ctx.translate(j.dir > 0 ? x : x + JET_W, y + Math.round((JET_H - h) / 2) + (sy < 0 ? h : 0));
    ctx.scale(j.dir, sy < 0 ? -1 : 1);
    ctx.drawImage(img, 0, 0, JET_W, JET_H, 0, 0, JET_W, h);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ 5 */
  function bark(text = "WOOF!") {
    dog.mouthT = 0.35;
    say(text);
    sfx.bark();
  }
  function petDog() {
    if (dog.state === "sleep") {
      dog.state = "idle";
      say("!", 0.8);
      sfx.yip();
      jump();
      return;
    }
    state.pets++;
    dog.happyT = 1.6;
    hearts(headX(), dogY() - 4, 3);
    if (Math.random() < 0.5) bark(pick(["WOOF!", "♥", "ARF!"]));
    jump();
    if (state.pets >= 5) unlock("pet");
  }
  function jump() {
    if (dog.state === "jump" || dog.state === "eat") return;
    dog.state = "jump";
    dog.vy = -75;
    sfx.jump();
  }
  function walkTo(x, run) {
    if (dog.state === "sleep" || dog.state === "eat") return;
    dog.target = clamp(x, L.dogMin, L.dogMax);
    dog.run = !!run;
    if (dog.state !== "jump") dog.state = "walk";
  }

  /* ---- fetch: tap the ball, the pup chases it, carries it back, drops it.
     ball.x/y is the sprite's top-left; it rests with its bottom on FEET. */
  const BALL_R = FEET - 5;
  const ball = { x: 0, y: BALL_R, vx: 0, vy: 0, state: "rest", chase: false, home: 0 };
  // where the pup's mouth is, in world x, for the way it is facing
  const mouthX = () => dog.x + (dog.facing > 0 ? 15 : 8);
  function throwBall() {
    if (ball.state !== "rest") return;
    if (dog.state === "sleep") { dog.state = "idle"; say("!", 0.8); sfx.yip(); }
    if (dog.state === "eat") return;
    const cx = ball.x + 2;
    const dir = cx < LW / 2 ? 1 : -1;            // throw toward the roomier side
    ball.vx = dir * rand(75, 105);
    ball.vy = rand(-95, -75);
    ball.state = "fly";
    ball.chase = true;
    ball.home = clamp(dog.x, L.dogMin, L.dogMax);
    sfx.jump();
    if (dog.state === "idle" || dog.state === "walk") bark(pick(["!", "BALL!", "WOOF!"]));
  }
  function updateBall(dt) {
    if (ball.state !== "fly") return;
    ball.vy += 240 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < 2) { ball.x = 2; ball.vx = Math.abs(ball.vx) * 0.6; }
    if (ball.x > LW - 7) { ball.x = LW - 7; ball.vx = -Math.abs(ball.vx) * 0.6; }
    if (ball.y >= BALL_R) {
      ball.y = BALL_R;
      if (Math.abs(ball.vy) > 25) { ball.vy *= -0.45; ball.vx *= 0.75; sfx.click(); }
      else { ball.vy = 0; ball.vx *= 0.85; if (Math.abs(ball.vx) < 4) { ball.vx = 0; ball.state = "rest"; } }
    }
  }
  function dropBall() {
    ball.state = "rest";
    ball.x = clamp(mouthX() - 2, 2, LW - 7);
    ball.y = BALL_R;
    state.fetches++;
    dog.happyT = 2;
    hearts(headX(), dogY() - 4, 3);
    bark(state.fetches >= 3 ? "AGAIN!!" : "AGAIN!");
    floatText(`FETCH x${state.fetches}`, ball.x + 2, ball.y - 10, "L");
    if (state.fetches >= 3) unlock("fetch");
  }

  function updateDog(dt) {
    const d = dog;
    d.anim += dt;
    d.blinkT -= dt;
    if (d.blinkT < -0.12) d.blinkT = rand(2, 5);
    d.happyT = Math.max(0, d.happyT - dt);
    d.mouthT = Math.max(0, d.mouthT - dt);
    d.bubbleT = Math.max(0, d.bubbleT - dt);

    const kdir = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    if (kdir && d.state !== "eat") {
      if (d.state === "sleep") { petDog(); return; }
      d.manual = kdir;
      d.facing = kdir;
      d.target = null;
      if (d.state === "idle") d.state = "walk";
    } else d.manual = 0;

    const nearestTreat = () => treats.filter((t) => t.landed).sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x))[0];

    switch (d.state) {
      case "idle": {
        if (ball.state === "held") { dropBall(); break; }
        if (ball.chase) { walkTo(ball.x, true); d.state = "walk"; break; }
        const t = nearestTreat();
        if (t) { walkTo(t.x - 18, true); break; }
        if (state.partyT > 0 && Math.random() < dt * 2) { jump(); break; }
        d.idleT -= dt;
        if (d.idleT <= 0) {
          d.idleT = rand(3, 7);
          const r = Math.random();
          if (r < 0.55) walkTo(rand(L.dogMin, L.dogMax - 30));
          else if (r < 0.8) bark(pick(["WOOF!", "ARF!", "YIP!"]));
          else d.facing *= -1;
        }
        if (!REDUCED && state.t - state.lastInput > 22 && state.partyT <= 0) {
          d.state = "sleep";
          d.zT = 0.3;
        }
        break;
      }
      case "walk": {
        if (ball.chase && !d.manual) {
          // line the mouth up with the ball (the offset depends on facing)
          const bc = ball.x + 2, face = bc > d.x + 12 ? 1 : -1;
          d.target = clamp(bc - (face > 0 ? 15 : 8), L.dogMin, L.dogMax);
          d.run = true;
          if (ball.y >= BALL_R - 2 && Math.abs(mouthX() - bc) < 4 && d.facing === face) {
            ball.state = "held"; ball.chase = false; ball.vx = ball.vy = 0;
            d.happyT = 1; sfx.chomp(); say("GOT IT!", 0.8);
            d.target = ball.home; d.run = false;
          } else if (Math.abs(d.target - d.x) < 1.5 && Math.abs(mouthX() - bc) >= 4) {
            d.facing = face; // arrived but facing the wrong way: turn around
            d.x = clamp(d.x + face * 0.5, L.dogMin, L.dogMax);
          }
          if (ball.chase && Math.abs(d.target - d.x) < 1.5) break; // wait for the ball to land
        }
        const t = ball.state === "held" ? null : nearestTreat();
        if (t && !d.manual) { d.target = t.x - 18; d.run = true; }
        let dir = d.manual;
        if (!dir && d.target != null) {
          const dx = d.target - d.x;
          if (Math.abs(dx) < 1.5) {
            d.target = null;
            if (t && Math.abs(t.x - 18 - d.x) < 3) { d.state = "eat"; d.eatT = 1.4; d.facing = 1; }
            else d.state = "idle";
            break;
          }
          dir = Math.sign(dx);
        }
        if (!dir) { d.state = "idle"; break; }
        d.facing = dir;
        d.x = clamp(d.x + dir * (d.run ? 46 : 24) * dt, L.dogMin, L.dogMax);
        break;
      }
      case "jump": {
        d.vy += 260 * dt;
        d.jy += d.vy * dt;
        if (d.manual) d.x = clamp(d.x + d.manual * 30 * dt, L.dogMin, L.dogMax);
        if (d.jy >= 0) { d.jy = 0; d.vy = 0; d.state = d.target != null || d.manual ? "walk" : "idle"; }
        break;
      }
      case "eat": {
        const before = d.eatT;
        d.eatT -= dt;
        if (Math.floor(before / 0.18) !== Math.floor(d.eatT / 0.18)) {
          d.mouthT = 0.09;
          sfx.chomp();
          particles.push({ kind: "pix", x: d.x + 20, y: dogY() + 9, vx: rand(-10, 10), vy: -20, g: 120, drag: 0, life: 0.5, max: 0.5, color: "W" });
        }
        if (d.eatT <= 0) {
          const t = nearestTreat();
          if (t) treats.splice(treats.indexOf(t), 1);
          d.state = "idle";
          d.happyT = 2;
          hearts(headX(), dogY() - 4, 4);
          bark("YUM!");
        }
        break;
      }
      case "sleep":
        d.zT -= dt;
        if (d.zT <= 0) { d.zT = 1.3; floatText("Z", headX() + d.facing * 6, dogY() + 2, "S", { vy: -8, life: 2 }); }
        break;
    }
  }

  /* pup is composited into its own small buffer, then blitted (flipped when
     facing left). Origin of the 24x17 body inside the buffer: */
  const DOX = 5, DOY = 10, BUF_W = DOG_W + DOX * 2;
  const dogBuf = document.createElement("canvas");
  dogBuf.width = BUF_W; dogBuf.height = 30;
  const dctx = dogBuf.getContext("2d");

  function renderDog() {
    const d = dog;
    dctx.clearRect(0, 0, BUF_W, 30);
    let dy = 0, legs = S.LEGS.stand, legY = DOY + 14;
    const wagRate = d.happyT > 0 || state.partyT > 0 ? 0.08 : 0.22;
    let tail = Math.floor(d.anim / wagRate) % 2;
    let eyes = d.blinkT < 0 ? "closed" : d.happyT > 0 ? "happy" : "open";

    if (d.state === "idle" || d.state === "eat") {
      dy = Math.floor(d.anim / 0.6) % 2; // breathing
    } else if (d.state === "walk") {
      const f = Math.floor(d.anim / (d.run ? 0.08 : 0.13)) % 2;
      legs = f ? S.LEGS.splay : S.LEGS.stand;
      dy = f ? -1 : 0;
    } else if (d.state === "jump") {
      legs = S.LEGS.jump;
    } else if (d.state === "sleep") {
      dy = 2; legs = S.LEGS.sleep; legY = DOY + 16; eyes = "closed"; tail = 1;
    }
    if (d.state === "eat") dy += Math.floor(d.anim / 0.18) % 2;

    draw(dctx, S.DOG_TOP, DOX, DOY + dy);
    draw(dctx, legs, DOX, legY);
    draw(dctx, S.TAIL[tail], DOX - 3, DOY + 5 + dy);

    // eyes are 2x2 at x = 11 and 15, rows 4-5
    const ey = DOY + 4 + dy;
    for (const ex of [11, 15]) {
      const x0 = DOX + ex;
      if (eyes === "closed") { dot(dctx, x0, ey, "O"); dot(dctx, x0 + 1, ey, "O"); }          // _ _
      if (eyes === "happy") { dot(dctx, x0, ey + 1, "O"); dot(dctx, x0 + 1, ey + 1, "O"); }   // ‾ ‾
    }
    if (d.mouthT > 0) {
      for (const x of [13, 14]) { dot(dctx, DOX + x, DOY + 7 + dy, "K"); dot(dctx, DOX + x, DOY + 8 + dy, "m"); }
    }
    if (state.partyT > 0 && state.legend) draw(dctx, S.SHADES, DOX + 10, DOY + 4 + dy);
    if (d.hat === "crown") draw(dctx, S.CROWN, DOX + 10, DOY - 5 + dy);
    else draw(dctx, S.HAT, DOX + 11, DOY - 7 + dy);

    const bx = Math.round(d.x) - DOX, by = Math.round(dogY()) - DOY;
    // soft ground shadow (shrinks while airborne)
    const sw = Math.max(8, 18 + Math.round(d.jy / 3));
    ctx.fillStyle = P.T;
    ctx.fillRect(Math.round(d.x + DOG_W / 2 - sw / 2), FEET + 1, sw, 1);
    if (d.facing < 0) {
      ctx.save(); ctx.translate(bx + BUF_W, by); ctx.scale(-1, 1); ctx.drawImage(dogBuf, 0, 0); ctx.restore();
    } else ctx.drawImage(dogBuf, bx, by);
  }

  function renderBubble() {
    if (dog.bubbleT <= 0 || !dog.bubble) return;
    const w = font.measure(dog.bubble) + 6, h = 9;
    const hx = headX();
    let x = Math.round(clamp(hx + (dog.facing > 0 ? 4 : -w - 4), 1, LW - w - 1));
    const y = Math.round(dogY() - 18);
    ctx.fillStyle = P.K;
    ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillRect(x, y + 1, w, h - 2);
    ctx.fillStyle = P.W;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // tail pointing at the pup's head
    const tx = clamp(Math.round(hx + dog.facing * 4), x + 2, x + w - 3);
    dot(ctx, tx, y + h - 1, "W"); dot(ctx, tx - 1, y + h - 1, "W");
    dot(ctx, tx, y + h, "K"); dot(ctx, tx - 1, y + h, "K"); dot(ctx, tx - 2, y + h - 1, "K"); dot(ctx, tx + 1, y + h - 1, "K");
    font.text(ctx, dog.bubble, x + 3, y + 2, { color: "K", outline: null });
  }

  /* ------------------------------------------------------------------ 6 */
  function update(dt) {
    state.t += dt;
    const t = state.t;

    if (state.partyT > 0) {
      state.partyT -= dt;
      state.autoFwT -= dt;
      if (state.autoFwT <= 0) { state.autoFwT = rand(0.35, 0.7); launch(rand(16, LW - 16), rand(10 - SKY * 0.7, 44)); }
    }

    if (!REDUCED) {
      for (const b of balloons) b.y += b.vy * dt;
      for (let i = balloons.length - 1; i >= 0; i--) {
        if (balloons[i].y < -24 - SKY) {
          const b = balloons.splice(i, 1)[0];
          if (b.ambient) spawnBalloon();
        }
      }
      for (const f of butterflies) {
        f.ph += dt;
        f.x += (f.vx + Math.sin(f.ph * 0.8) * 6) * dt;
        f.y += Math.cos(f.ph * 1.7) * 10 * dt;
        if (f.x < -4) f.x = LW + 2;
        if (f.x > LW + 4) f.x = -2;
        f.y = clamp(f.y, 64, 96);
      }
      for (const c of clouds) {
        c.x += c.speed * dt;
        if (c.x > LW + 2) c.x = -18;
      }
    }

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y -= 120 * dt;
      r.x += (r.tx - r.x) * Math.min(1, dt * 3);
      particles.push({ kind: "pix", layer: "sky", x: r.x + rand(-0.5, 0.5), y: r.y + 2, vx: 0, vy: 10, g: 0, drag: 0, life: 0.35, max: 0.35, ramp: HB.FIRE_RAMPS.ember });
      if (r.y <= r.ty) { rockets.splice(i, 1); explode(r); }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.kind === "sprite" || p.kind === "flash") continue;
      if (p.trail) { p.trail.unshift([p.x, p.y]); if (p.trail.length > 3) p.trail.pop(); }
      p.vy += (p.g || 0) * dt;
      const k = Math.max(0, 1 - (p.drag || 0) * dt);
      p.vx *= k; p.vy *= k;
      if (p.kind === "smoke") p.x += Math.sin(t * 4 + p.ph) * 6 * dt;
      if (p.kind === "confetti") {
        p.vy = Math.min(p.vy, 22);
        p.x += Math.sin(t * 5 + p.ph) * 10 * dt;
        if (p.y >= FEET + 4) { p.y = FEET + 4; p.vx = 0; p.vy = 0; p.g = 0; }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt; f.y += f.vy * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
    for (let i = paws.length - 1; i >= 0; i--) {
      paws[i].life -= dt;
      if (paws[i].life <= 0) paws.splice(i, 1);
    }
    for (let i = banners.length - 1; i >= 0; i--) {
      if (i > 0) continue; // banners queue: only the first one ticks
      banners[i].t += dt;
      if (banners[i].t >= banners[i].dur) banners.splice(i, 1);
    }

    for (const tr of treats) {
      if (tr.landed) continue;
      tr.vy += 200 * dt; tr.x += tr.vx * dt; tr.y += tr.vy * dt;
      if (tr.y >= FEET - 4) { tr.y = FEET - 4; tr.landed = true; tr.x = clamp(tr.x, L.dogMin + 10, LW - 10); }
    }
    for (const g of gifts) {
      const l = g.lid;
      if (!l || l.rest) continue;
      l.vy += 220 * dt; l.x += l.vx * dt; l.y += l.vy * dt;
      if (l.y >= FEET - 5) { l.y = FEET - 5; l.rest = true; }
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.t >= f.dur) {
        flyers.splice(i, 1);
        dog.hat = "crown";
        floatText("ROYAL PUP!", headX(), dogY() - 14, "Y");
        sfx.twinkle();
        dog.happyT = 2;
      }
    }

    for (const c of candles) c.ph += dt;
    updateJet(dt);
    updateBall(dt);
    updateDog(dt);
  }

  /* ------------------------------------------------------------------ 7 */
  function render() {
    const t = state.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (SKY) { // extra sky on tall screens: continues the top band of the gradient
      ctx.fillStyle = P.N;
      ctx.fillRect(0, 0, LW, SKY);
    }
    ctx.translate(0, SKY); // everything below is drawn in world coordinates
    ctx.drawImage(bg, 0, 0);

    // clouds drift behind everything
    for (const c of clouds) draw(ctx, c.small ? S.CLOUD_SMALL : S.CLOUD, c.x, c.y);

    // sun with slowly turning rays
    const sx = L.sun.x + 6, sy = L.sun.y + 6;
    const spin = REDUCED ? 0 : t * 0.4;
    for (let k = 0; k < 8; k++) {
      const a = spin + (k * Math.PI) / 4;
      for (let r = 8; r < 11; r++) dot(ctx, sx - 0.5 + Math.cos(a) * r, sy - 0.5 + Math.sin(a) * r, r === 8 ? "Y" : "O");
    }
    draw(ctx, S.SUN, L.sun.x, L.sun.y);
    if (state.sunCool) draw(ctx, S.SUN_SHADES, L.sun.x, L.sun.y);

    drawParticles("sky");
    renderJet();

    // bunting: pennants sway; party mode makes them flutter fast
    const flutter = state.partyT > 0 ? 10 : 2;
    for (const f of flags) {
      const sway = REDUCED ? 0 : Math.round(Math.sin(t * flutter + f.i * 0.9) * 0.6);
      draw(ctx, S.FLAG, f.x + sway, f.y + 1, { swaps: f.sw });
    }

    for (const b of balloons) {
      const x = b.x + (REDUCED ? 0 : Math.sin(t * 1.2 + b.ph) * 2);
      // string
      for (let k = 0; k < 10; k++) dot(ctx, x + 4 + Math.round(Math.sin(t * 2 + b.ph + k * 0.5) * 0.8), b.y + 9 + k, "g");
      draw(ctx, S.BALLOON, x, b.y, { swaps: b.sw });
      if (b.gold && Math.sin(t * 6 + b.ph) > 0.5) { dot(ctx, x - 1, b.y + 1, "W"); dot(ctx, x + 9, b.y + 5, "C"); }
    }

    // table, plate, cake, candles
    draw(ctx, S.TABLE, L.table.x, L.table.y);
    draw(ctx, S.PLATE, L.plate.x, L.plate.y);
    draw(ctx, S.CAKE, L.cake.x, L.cake.y);
    for (const c of candles) {
      if (c.kind === "digit") font.text(ctx, c.ch, c.x + 1, c.y + 1, { color: c.color, scale: 2, outline: "K" });
      else draw(ctx, S.CANDLE, c.x, c.y, { swaps: { a: c.color } });
      const fx = c.x + Math.floor(c.w / 2) - 2, fy = c.y - 5;
      if (c.lit) {
        draw(ctx, S.FLAME[Math.floor(c.ph * 8) % S.FLAME.length], fx, fy);
      } else {
        dot(ctx, c.x + Math.floor(c.w / 2), c.y - 1, "K");
      }
    }

    // presents
    for (const g of gifts) {
      draw(ctx, g.open ? S.GIFT_OPEN_BOX : S.GIFT_BOX, g.x, g.y + 5, { swaps: g.sw });
      if (!g.open) draw(ctx, S.GIFT_LID, g.x, g.y + (REDUCED ? 0 : Math.round(Math.max(0, Math.sin(t * 3 + g.x)) * -1)), { swaps: g.sw });
      else if (g.lid) draw(ctx, S.GIFT_LID, g.lid.x, g.lid.y, { swaps: g.sw });
    }
    for (const pw of paws) if (pw.life > 0.4 || Math.floor(pw.life * 10) % 2) draw(ctx, S.PAW, pw.x - 2, pw.y);
    for (const tr of treats) draw(ctx, S.BONE, tr.x, tr.y);
    for (const f of flyers) {
      const k = f.t / f.dur, tx = headX() - 4, ty = dogY() - 5;
      draw(ctx, S.CROWN, f.x + (tx - f.x) * k, f.y + (ty - f.y) * k - Math.sin(k * Math.PI) * 24);
    }

    if (ball.state !== "held") draw(ctx, S.BALL, ball.x, ball.y);
    renderDog();
    if (ball.state === "held") draw(ctx, S.BALL, dog.x + (dog.facing > 0 ? 13 : 6), dogY() + 7);
    drawParticles("front");

    // butterflies
    for (const f of butterflies) {
      const frame = REDUCED ? 0 : Math.floor(f.ph * 6) % 2;
      draw(ctx, S.BUTTERFLY[frame], f.x, f.y, { swaps: f.sw, flip: f.vx < 0 });
    }

    for (const f of floaters) {
      const fade = f.life / f.max;
      if (fade < 0.25 && Math.floor(f.life * 20) % 2) continue; // blink out
      if (f.sprite) draw(ctx, f.sprite, f.x - 2, f.y);
      else font.text(ctx, f.text, f.x, f.y, { color: f.color, scale: f.scale, align: "center" });
    }
    renderBubble();

    const b = banners[0];
    if (b) {
      const s = b.big ? 2 : 1;
      const bounce = Math.max(0, 1 - b.t * 4);
      const y = Math.round(54 - bounce * 8); // below the F-14 flight band (y 18-50)
      if (!(b.t > b.dur - 0.3 && Math.floor(b.t * 20) % 2)) font.text(ctx, b.text, LW / 2, y, { color: b.color, scale: s, align: "center" });
    }

    // HUD pinned to the top of the canvas (not the world)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    font.text(ctx, `*${state.goals.size}/${GOALS.length}`, LW - 2, 2, { color: "Y", align: "right" });
    if (state.pops) font.text(ctx, `POP ${state.pops}`, 2, 2, { color: "p" });
  }

  function drawParticles(layer) {
    for (const p of particles) {
      if ((p.layer || "front") !== layer) continue;
      const k = 1 - p.life / p.max;
      if (p.kind === "sprite") { draw(ctx, p.grid, p.x, p.y); continue; }
      if (p.kind === "puff") {
        if (k > 0.75 && Math.floor(p.life * 30) % 2) continue; // dissolve
        const s = 1 + Math.floor(k * 2.5);
        ctx.fillStyle = P[p.color];
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        continue;
      }
      if (p.kind === "flash") { ctx.fillStyle = P.W; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3); continue; }
      let col = p.color;
      if (p.ramp) col = p.ramp[Math.min(p.ramp.length - 1, Math.floor(k * p.ramp.length))];
      if (p.kind === "smoke") col = k < 0.5 ? "g" : "D";
      if (p.kind === "spark" && p.trail) {
        const tc = p.ramp[Math.min(p.ramp.length - 1, Math.floor(k * p.ramp.length) + 2)];
        for (const [tx, ty] of p.trail.slice(1)) dot(ctx, tx, ty, tc);
        if (k > 0.7 && Math.random() < 0.4) continue; // crackle
      }
      if (p.kind === "confetti") {
        ctx.fillStyle = P[col];
        const flip = Math.sin(state.t * 10 + p.ph) > 0;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), flip ? 2 : 1, 1);
        continue;
      }
      dot(ctx, p.x, p.y, col);
    }
  }

  /* ------------------------------------------------------------------ 8 */
  function resize() {
    const frame = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // room for the pixel frame drawn with box-shadow + margin (thinner on phones)
    const pad = window.matchMedia("(max-width: 560px)").matches ? 22 : 52;
    const aw = Math.max(100, frame.width - pad), ah = Math.max(80, frame.height - pad);
    LW = clamp(Math.round(LH * (aw / ah)), 160, 256);
    let scale = Math.floor(Math.min((aw * dpr) / LW, (ah * dpr) / LH));
    if (scale < 1) scale = 1;
    // Portrait / tall space: keep the integer scale set by the width and grow
    // the canvas upward with extra sky instead of leaving empty page.
    CH = clamp(Math.floor((ah * dpr) / scale), LH, 220);
    SKY = CH - LH;
    canvas.width = LW;
    canvas.height = CH;
    canvas.style.width = `${(LW * scale) / dpr}px`;
    canvas.style.height = `${(CH * scale) / dpr}px`;
    ctx.imageSmoothingEnabled = false;
    layout();
    render();
  }

  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * LW, y: ((e.clientY - r.top) / r.height) * CH - SKY };
  }
  const inBox = (x, y, bx, by, bw, bh) =>
    x >= bx - TOUCH && x < bx + bw + TOUCH && y >= by - TOUCH && y < by + bh + TOUCH;

  canvas.addEventListener("pointerdown", (e) => {
    HB.audio.ensure();
    state.lastInput = state.t;
    const { x, y } = toWorld(e);

    if (jet && inBox(x, y, jet.x - 2, jet.y - 2, JET_W + 4, JET_H + 4)) return rollJet();
    if (inBox(x, y, L.sun.x - 3, L.sun.y - 3, 18, 18)) return clickSun();
    for (let i = balloons.length - 1; i >= 0; i--) {
      const b = balloons[i], bx = b.x + Math.sin(state.t * 1.2 + b.ph) * 2;
      if (inBox(x, y, bx - 1, b.y - 1, 11, 12)) return popBalloon(b);
    }
    for (const c of candles) {
      if (c.lit && inBox(x, y, c.x - 2, c.y - 7, c.w + 4, c.kind === "digit" ? 18 : 14)) { sfx.blow(); return blowCandle(c); }
    }
    for (const g of gifts) {
      if (!g.open && inBox(x, y, g.x, g.y, 11, 12)) return openGift(g);
    }
    if (ball.state === "rest" && inBox(x, y, ball.x - 3, ball.y - 4, 11, 11)) return throwBall();
    if (inBox(x, y, dog.x - 2, dogY() - 7, DOG_W + 4, 25)) return petDog();
    if (inBox(x, y, L.cake.x - 2, L.cake.y - 2, 28, 30)) { floatText(pick(["NOT YET!", "AFTER THE WISH", "MMM CAKE"]), L.cake.x + 12, L.cake.y - 12, "p"); return; }
    if (y < GROUND - 8) {
      launch(x, Math.max(6 - SKY, y));
      state.fireworks++;
      if (state.fireworks >= 5) unlock("fw");
      return;
    }
    walkTo(x - DOG_W / 2);
    paws.push({ x: Math.round(x), y: Math.round(clamp(y, GROUND + 2, LH - 6)), life: 1.5 });
    for (let k = 0; k < 4; k++) particles.push({ kind: "pix", x, y: Math.max(y, GROUND + 1), vx: rand(-15, 15), vy: rand(-15, -5), g: 60, drag: 1, life: 0.4, max: 0.4, color: "L" });
  });

  const keys = {};
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let konami = 0;
  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea, dialog, button")) return;
    if (document.querySelector("dialog[open]")) return;
    HB.audio.ensure();
    state.lastInput = state.t;
    konami = e.key === KONAMI[konami] ? konami + 1 : e.key === KONAMI[0] ? 1 : 0;
    if (konami === KONAMI.length) {
      konami = 0;
      state.legend = true;
      banner("PARTY MODE!", "C", 3, true);
      party(10);
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") keys[e.key] = true;
    if (e.key === " " || e.key === "ArrowUp") { if (dog.state === "sleep") petDog(); else jump(); }
    if (e.key === "j" || e.key === "J") flyby();
    if (e.key === "f" || e.key === "F") { launch(rand(16, LW - 16), rand(10 - SKY * 0.7, 44)); state.fireworks++; if (state.fireworks >= 5) unlock("fw"); }
  });
  window.addEventListener("keyup", (e) => { keys[e.key] = false; });
  window.addEventListener("blur", () => { keys.ArrowLeft = keys.ArrowRight = false; });

  function snapshot() {
    const k = 6, c = document.createElement("canvas");
    c.width = LW * k; c.height = CH * k;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    x.drawImage(canvas, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `happy-birthday${params.name ? "-" + params.name.replace(/[^\w-]+/g, "") : ""}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    sfx.click();
    particles.push({ kind: "flash", x: LW / 2, y: LH / 2 - SKY / 2, life: 0.08, max: 0.08 });
  }

  /* fixed-step loop */
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  function loop(now) {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render();
    requestAnimationFrame(loop);
  }

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas.parentElement);
  else window.addEventListener("resize", resize);
  resize();
  for (let i = 0; i < 6; i++) spawnBalloon({ y: REDUCED ? rand(18, 70) : rand(20, LH + 30) });
  dog.x = Math.round(LW * 0.3);
  ball.x = Math.round(dog.x + DOG_W + 10); // ready to throw right away
  requestAnimationFrame(loop);

  HB.game = {
    GOALS, goals: () => state.goals,
    blowAll, relight, snapshot, flyby,
    scheduleFlyby: (sec) => { state.jetT = sec; },
    fireworks: () => { for (let i = 0; i < 4; i++) setTimeout(() => launch(rand(16, LW - 16), rand(10 - SKY * 0.7, 44)), i * 200); state.fireworks += 4; if (state.fireworks >= 5) unlock("fw"); },
    debug: { state, dog, ball, throwBall, jet: () => jet, rollJet, candles: () => candles, gifts: () => gifts, balloons, celebrate, unlock },
  };
})(window.HB);
