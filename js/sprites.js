/* ==========================================================================
   PALETTE + SPRITES
   --------------------------------------------------------------------------
   Palette: an 18-colour bright pastel set built as hue-shifted ramps
   (butter -> peach -> salmon -> rose -> mauve, ice -> baby blue ->
   cornflower, pistachio -> mint -> sea-mint). Every pixel on the canvas
   comes from this table, which keeps the scene cohesive. Outlines are a
   soft plum, never black, so everything stays cute and gentle.

   Lighting rule used by every sprite: light comes from the TOP-LEFT (the
   sun). Highlights sit top-left, shadows bottom-right, and shadows are
   hue-shifted (peach -> salmon -> rose) instead of just darkened.

   Sprite format: an array of equal-length strings, one char per pixel,
   looked up in PALETTE. "." is transparent. Lowercase a/b/c/r/s are
   placeholders that get swapped per instance (balloon / gift colours).
   ========================================================================== */
window.HB = window.HB || {};

(function (HB) {
  "use strict";

  const PALETTE = {
    K: "#4b3b57", // soft plum ink: outlines, eyes (never pure black — keeps it cute)
    P: "#a27fae", // mauve: deep shadow
    R: "#f4978e", // salmon: warm shadow on fur, jam
    O: "#ffc09a", // peach: pup fur, flame edge
    Y: "#ffeaa0", // butter: highlights, sun, flame
    L: "#d2f7b8", // pistachio: grass highlight
    G: "#a5e3a9", // mint: grass
    T: "#74c4a8", // sea-mint: grass shadow, near hills
    N: "#b9c6ff", // periwinkle: top of the sky
    B: "#8fa8f5", // cornflower: blue shadows
    S: "#ade0ff", // baby blue: sky
    C: "#dcfbff", // ice: sky near horizon, glints
    W: "#fffaf2", // cream white
    g: "#e2d8ee", // lavender mist: cloud shade, smoke
    D: "#c0a9d6", // lilac: bunting string
    F: "#cdbdf0", // lavender: far hills
    // party extensions
    p: "#ffc4dd", // bubblegum: icing, blush, party hat
    m: "#f290b8", // rose: icing shadow
  };

  /* Colour ramps, dark -> light. Balloons/gifts use [shade, base, light]. */
  const BALLOON_RAMPS = {
    pink:   ["m", "p", "W"],
    yellow: ["O", "Y", "W"],
    mint:   ["T", "G", "L"],
    blue:   ["B", "S", "C"],
    lilac:  ["P", "D", "g"],
    coral:  ["m", "R", "p"],
  };
  /* Sparkle bursts fade bright -> deeper over their life. */
  const FIRE_RAMPS = {
    gold:  ["W", "Y", "Y", "O", "R"],
    ice:   ["W", "C", "S", "B", "B"],
    lime:  ["W", "L", "G", "T", "T"],
    candy: ["W", "p", "p", "m", "m"],
    lilac: ["W", "g", "D", "P", "P"],
    ember: ["Y", "O", "R", "R"],
  };
  const CONFETTI = ["Y", "p", "C", "L", "O", "S", "W", "m"];

  /* ---------------------------------------------------------------- PUP --
     24 x 14 upper body, facing RIGHT: chibi proportions (big head, small
     body), droopy salmon ears, 2x2 shiny eyes at (11-12, 4-5) and
     (15-16, 4-5), button nose at (13-14, 6). Legs/tail are separate so
     poses can be composed.                                              */
  const DOG_TOP = [
    "...........KKKKKK.......",
    ".........KKOYYOOOKK.....",
    ".......KKKOYYOOOOOKKK...",
    "......KRRKOOOOOOOOKRRK..",
    "......KRRKOKWOOKWOKRRK..",
    "......KRRKOKKOOKKOKRRK..",
    "......KRRKpWWKKWWpKRRK..",
    "......KRRKOWWWWWWOKRRK..",
    "......KRRKKOWWWWOKKRRK..",
    ".KKKKKKKKKKKKKKKK..KK...",
    "KYYYYOOOOWWWWWWK........",
    "KOOOOOOOOWWWWWK.........",
    "KROOOOOOOOWWWK..........",
    ".KRRRRRRRRWWWWK.........",
  ];
  const LEGS = {
    stand: [
      ".KOK.KRK.KgKKWK.........",
      ".KOK.KRK.KgKKWK.........",
      ".KKK.KKK.KKKKKK.........",
    ],
    splay: [
      ".KOK..KRK.KgK.KWK.......",
      "KOK....KRKKgK...KWK.....",
      "KKK....KKKKKK...KKK.....",
    ],
    jump: [
      "KOK..........KWK........",
      "KK.............KK.......",
      "........................",
    ],
    sleep: [
      ".KKKKKKKKKKKWWWWK.......",
    ],
  };
  /* waggy tail, drawn at (-3, +5) relative to the body */
  const TAIL = [
    [
      ".KKK..",
      "KOYOK.",
      "KOKOK.",
      ".K.KOK",
      "....KO",
    ],
    [
      "......",
      ".KKK..",
      "KOYOK.",
      "KOKKOK",
      ".K..KO",
    ],
  ];
  const HAT = [
    "..WY..",
    "..YY..",
    "..KK..",
    ".KpCK.",
    ".KCpK.",
    "KppCpK",
    "KpCppK",
    "KKKKKK",
  ];
  const CROWN = [
    "K..KK..K",
    "KYKYYKYK",
    "KYYYYYYK",
    "KYRYYCYK",
    "KOOOOOOK",
    "KKKKKKKK",
  ];
  /* drawn at (10, 4) relative to the body */
  const SHADES = [
    "KKKKKKKK",
    ".KC..KC.",
  ];

  /* ------------------------------------------------------------ PARTY --- */
  const BALLOON = [
    "..KKKKK..",
    ".KbbbbbK.",
    "KbWcbbbaK",
    "KbcbbbbaK",
    "KbbbbbbaK",
    "KbbbbbaaK",
    ".KbbbaaK.",
    "..KaaaK..",
    "...KbK...",
  ];
  const POP = [
    "....W....",
    ".W..Y..W.",
    "..Y...Y..",
    ".........",
    "WY.....YW",
    ".........",
    "..Y...Y..",
    ".W..Y..W.",
    "....W....",
  ];
  /* candle: 'a' stripe colour is swapped per candle */
  const CANDLE = ["aW", "Wa", "aW", "Wa", "aW", "Wa"];
  /* 4-wide flame centred over a 2-wide candle; 3 flicker frames */
  const FLAME = [
    [".Y..", ".YY.", "YWWY", "OWWO", ".OO."],
    ["..Y.", ".YY.", "YWWY", "OWWO", ".OO."],
    ["..Y.", ".YW.", "YWWY", "OYWO", ".OO."],
  ];

  /* Cake: 24 x 13, built from rows so the right-edge shading stays exact. */
  function buildCake() {
    const inner = 22;
    const fill = (ch) => ch.repeat(inner);
    const drips = [1, 7, 12, 17];
    const withAt = (base, ch, cols) =>
      base.split("").map((c, i) => (cols.includes(i) ? ch : c)).join("");
    const rows = [
      fill("W"),                                   // top surface
      "ppCppppYpppWppppCppYpp",                    // icing + sprinkles
      withAt(fill("p"), "m", drips),               // icing, drip starts
      withAt(fill("Y"), "p", drips),               // drips into sponge
      withAt(fill("Y"), "p", [1, 12]),             // long drips
      fill("Y"),
      fill("W"),                                   // cream layer
      fill("R"),                                   // jam
      fill("Y"),
      fill("Y"),
      fill("O"),                                   // sponge underside
    ];
    const shade = { Y: "O", W: "g", R: "P", p: "m", O: "R", C: "S" };
    const body = rows.map((r, y) => {
      // right two columns are in shadow (light from top-left)
      const chars = r.split("");
      if (y > 0) {
        for (const i of [inner - 2, inner - 1]) chars[i] = shade[chars[i]] || chars[i];
      }
      return "K" + chars.join("") + "K";
    });
    return ["." + "K".repeat(inner) + "."].concat(body, ["." + "K".repeat(inner) + "."]);
  }
  const CAKE = buildCake();
  const PLATE = ["K" + "W".repeat(26) + "K", ".K" + "g".repeat(24) + "K."];

  /* Table with a pink gingham cloth. Width is fixed at 36. */
  function buildTable() {
    const w = 36, iw = w - 2;
    const check = (off) =>
      Array.from({ length: iw }, (_, i) => (((i >> 1) + off) % 2 ? "p" : "W")).join("");
    const scallop = Array.from({ length: w }, (_, i) => (i % 4 === 3 ? "." : "K")).join("");
    const rows = [
      "." + "K".repeat(iw) + ".",
      "K" + "W".repeat(iw) + "K",
      "K" + check(0) + "K",
      "K" + check(1) + "K",
      scallop,
    ];
    const leg = (s) => {
      const r = ".".repeat(w).split("");
      r[3] = "K"; r[4] = s; r[5] = "K";
      r[w - 6] = "K"; r[w - 5] = s; r[w - 4] = "K";
      return r.join("");
    };
    for (let i = 0; i < 7; i++) rows.push(leg(i < 2 ? "P" : "R"));
    rows.push(leg("K"));
    return rows;
  }
  const TABLE = buildTable();

  /* Gift: lid (rows 0-5) + box (rows 0-5). a/b/c = box ramp, r = ribbon */
  const GIFT_LID = [
    "..KK...KK..",
    ".KrrK.KrrK.",
    "..KKKrKKK..",
    "KKKKKKKKKKK",
    "KcbbbrbbbaK",
    "KKKKKKKKKKK",
  ];
  const GIFT_BOX = [
    ".KcbbrbbaK.",
    ".KbbbrbbaK.",
    ".KbbbrbbaK.",
    ".KbbbrbbaK.",
    ".KaaasaaaK.",
    ".KKKKKKKKK.",
  ];
  const GIFT_OPEN_BOX = [".KFFFFFFFK."].concat(GIFT_BOX.slice(1));

  const BONE = [
    ".K....K.",
    "KWKKKKWK",
    ".KWWWWK.",
    "KgKKKKgK",
    ".K....K.",
  ];
  const HEART = [".p.p.", "pWppp", "ppppm", ".pmm.", "..m.."];
  /* smiling sun, 12x12 — rays are drawn procedurally around it */
  const SUN = [
    "....KKKK....",
    "..KKYYYYKK..",
    ".KYWWYYYYYK.",
    ".KYWYYYYYYK.",
    "KYYYYYYYYYOK",
    "KYYKYYYYKYOK",
    "KYYKYYYYKYOK",
    "KYpYYYYYYpOK",
    ".KYYYKKYYOK.",
    ".KYYYYYYOOK.",
    "..KKOOOOKK..",
    "....KKKK....",
  ];
  /* secret: the sun puts on sunglasses */
  const SUN_SHADES = [
    "............",
    "............",
    "............",
    "............",
    "............",
    "..KKKKKKKK..",
    "..KCK..KCK..",
  ];
  const CLOUD = [
    "......gggg......",
    "...gggWWWWgg....",
    "..gWWWWWWWWWgg..",
    ".gWWWWWWWWWWWWg.",
    "gWWWWWWWWWWWWWWg",
    ".gggggggggggggg.",
  ];
  const CLOUD_SMALL = [
    "...gggg...",
    ".ggWWWWgg.",
    "gWWWWWWWWg",
    ".gggggggg.",
  ];
  /* bunting pennant: b = colour, a = its shade */
  const FLAG = ["bbbbb", ".bbba", ".bba.", "..a.."];
  const BUTTERFLY = [
    ["b.b", "bKb"],
    ["...", "bKb"],
  ];
  /* F-14 Tomcat, side view facing RIGHT (40x15): twin canted tails (the far
     one in lilac shadow), long radome nose, two-seat canopy, intake ramp,
     swept wing, twin nozzles at (0-2, 8-9). Pink tail flash for the party. */
  const F14 = [
    "....KK..................................",
    "....KmK.................................",
    "..KKKmmK................................",
    "..KDKmmmK...............................",
    "..KDKgmggK..............................",
    "..KDDKgggK...................KKKK.......",
    "..KDDKggggKKKKKKKKKKKKKKKKKKKCCWWK......",
    "KKKKKKgggggggggggggggggggggKSCCCWCKK....",
    "YOOKgggggggggggggggggggggggggggggggggKK.",
    "YOOKDDDggggggKKKKKKgggggggggggggggggggKK",
    "KKKKDDDDDDDDDKgggDKDDDDDDDDDDDDDDDDDKKK.",
    "...KKKDDKKKKDKDDDDKKKKKKKKKKKKKKKKKKK...",
    "......KK..KDDDDDDDDDKKK.................",
    "..........KKDDDDDKKK....................",
    "...........KKKKKK.......................",
  ];

  /* fetch ball, 5x5: pink with a highlight and a mint stripe */
  const BALL = [".KKK.", "KWpmK", "KLLLK", "KppmK", ".KKK."];

  /* little paw print left where you click the grass */
  const PAW = [".K.K.", "K.K.K", ".KKK.", ".KKK."];

  const SPRITES = {
    DOG_TOP, LEGS, TAIL, HAT, CROWN, SHADES,
    BALLOON, POP, CANDLE, FLAME, CAKE, PLATE, TABLE,
    GIFT_LID, GIFT_BOX, GIFT_OPEN_BOX, BONE, HEART,
    SUN, SUN_SHADES, CLOUD, CLOUD_SMALL, FLAG, BUTTERFLY, PAW, F14, BALL,
  };

  /* ------------------------------------------------- sprite compiler ----
     Each (grid, swaps) pair is rendered ONCE to an offscreen canvas and
     cached; drawing is then a single drawImage call.                   */
  const cache = new WeakMap();

  function compile(grid, swaps) {
    let byGrid = cache.get(grid);
    if (!byGrid) cache.set(grid, (byGrid = new Map()));
    const key = swaps ? JSON.stringify(swaps) : "";
    let c = byGrid.get(key);
    if (c) return c;
    const w = grid.reduce((m, r) => Math.max(m, r.length), 0);
    c = document.createElement("canvas");
    c.width = Math.max(1, w);
    c.height = Math.max(1, grid.length);
    const x = c.getContext("2d");
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        let ch = grid[row][col];
        if (swaps && swaps[ch]) ch = swaps[ch];
        const color = PALETTE[ch];
        if (!color) continue;
        x.fillStyle = color;
        x.fillRect(col, row, 1, 1);
      }
    }
    byGrid.set(key, c);
    return c;
  }

  /* draw(ctx, grid, x, y, {swaps, flip}) — positions are snapped to the
     pixel grid so nothing ever lands on a half pixel. */
  function draw(ctx, grid, x, y, opts) {
    const c = compile(grid, opts && opts.swaps);
    const dx = Math.round(x), dy = Math.round(y);
    if (opts && opts.flip) {
      ctx.save();
      ctx.translate(dx + c.width, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(c, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(c, dx, dy);
    }
  }

  /* Sanity check for hand-edited grids: every row must be the same width. */
  function validate() {
    const check = (name, g) => {
      if (!Array.isArray(g) || typeof g[0] !== "string") return;
      const w = g[0].length;
      g.forEach((r, i) => {
        if (r.length !== w) console.warn(`sprite ${name} row ${i} is ${r.length} wide, expected ${w}`);
      });
    };
    for (const [name, v] of Object.entries(SPRITES)) {
      if (Array.isArray(v) && Array.isArray(v[0])) v.forEach((g, i) => check(`${name}[${i}]`, g));
      else if (Array.isArray(v)) check(name, v);
      else for (const [k, g] of Object.entries(v)) check(`${name}.${k}`, g);
    }
  }
  validate();

  Object.assign(HB, {
    PALETTE, BALLOON_RAMPS, FIRE_RAMPS, CONFETTI, SPRITES,
    compileSprite: compile, draw,
  });
})(window.HB);
