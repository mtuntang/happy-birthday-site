/* ==========================================================================
   3x5 BITMAP FONT
   In-canvas text is drawn from these glyphs so it lands exactly on the
   pixel grid (a web font would be anti-aliased and blurry when scaled).
   Unknown characters render as a blank. Lowercase is folded to uppercase.
   ========================================================================== */
window.HB = window.HB || {};

(function (HB) {
  "use strict";

  const G = {
    A: [".#.", "#.#", "###", "#.#", "#.#"],
    B: ["##.", "#.#", "##.", "#.#", "##."],
    C: [".##", "#..", "#..", "#..", ".##"],
    D: ["##.", "#.#", "#.#", "#.#", "##."],
    E: ["###", "#..", "##.", "#..", "###"],
    F: ["###", "#..", "##.", "#..", "#.."],
    G: [".##", "#..", "#.#", "#.#", ".##"],
    H: ["#.#", "#.#", "###", "#.#", "#.#"],
    I: ["###", ".#.", ".#.", ".#.", "###"],
    J: ["..#", "..#", "..#", "#.#", ".#."],
    K: ["#.#", "#.#", "##.", "#.#", "#.#"],
    L: ["#..", "#..", "#..", "#..", "###"],
    M: ["#.#", "###", "###", "#.#", "#.#"],
    N: ["##.", "#.#", "#.#", "#.#", "#.#"],
    O: [".#.", "#.#", "#.#", "#.#", ".#."],
    P: ["##.", "#.#", "##.", "#..", "#.."],
    Q: [".#.", "#.#", "#.#", "##.", ".##"],
    R: ["##.", "#.#", "##.", "#.#", "#.#"],
    S: [".##", "#..", ".#.", "..#", "##."],
    T: ["###", ".#.", ".#.", ".#.", ".#."],
    U: ["#.#", "#.#", "#.#", "#.#", "###"],
    V: ["#.#", "#.#", "#.#", "#.#", ".#."],
    W: ["#.#", "#.#", "###", "###", "#.#"],
    X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
    Z: ["###", "..#", ".#.", "#..", "###"],
    0: ["###", "#.#", "#.#", "#.#", "###"],
    1: [".#.", "##.", ".#.", ".#.", "###"],
    2: ["##.", "..#", ".#.", "#..", "###"],
    3: ["##.", "..#", ".#.", "..#", "##."],
    4: ["#.#", "#.#", "###", "..#", "..#"],
    5: ["###", "#..", "##.", "..#", "##."],
    6: [".##", "#..", "###", "#.#", "###"],
    7: ["###", "..#", ".#.", ".#.", ".#."],
    8: ["###", "#.#", "###", "#.#", "###"],
    9: ["###", "#.#", "###", "..#", "##."],
    "!": [".#.", ".#.", ".#.", "...", ".#."],
    "?": ["##.", "..#", ".#.", "...", ".#."],
    ".": ["...", "...", "...", "...", ".#."],
    ",": ["...", "...", "...", ".#.", "#.."],
    "'": [".#.", ".#.", "...", "...", "..."],
    "-": ["...", "...", "###", "...", "..."],
    "+": ["...", ".#.", "###", ".#.", "..."],
    ":": ["...", ".#.", "...", ".#.", "..."],
    "/": ["..#", "..#", ".#.", "#..", "#.."],
    "&": [".#.", "#.#", ".#.", "#.#", ".##"],
    "*": [".#.", "###", ".#.", "#.#", "..."], // star
    "♥": ["#.#", "###", "###", ".#.", "..."],
    " ": ["...", "...", "...", "...", "..."],
  };

  /* Can this string be drawn with the font? (used for names) */
  function supports(str) {
    return [...String(str).toUpperCase()].every((ch) => G[ch]);
  }

  function measure(str, scale = 1) {
    const n = [...String(str)].length;
    return n ? (n * 4 - 1) * scale : 0;
  }

  /* Render a string once to an offscreen canvas (with optional 1px outline),
     cached by its parameters. */
  const cache = new Map();
  function bake(str, color, scale, outline) {
    const key = `${str}|${color}|${scale}|${outline}`;
    let c = cache.get(key);
    if (c) return c;
    if (cache.size > 300) cache.clear();
    const chars = [...String(str).toUpperCase()];
    const pad = outline ? 1 : 0;
    c = document.createElement("canvas");
    c.width = Math.max(1, measure(str, scale) + pad * 2);
    c.height = 5 * scale + pad * 2;
    const x = c.getContext("2d");
    const P = HB.PALETTE;
    const paint = (fill, ox, oy) => {
      x.fillStyle = fill;
      chars.forEach((ch, i) => {
        const g = G[ch] || G[" "];
        for (let r = 0; r < 5; r++)
          for (let q = 0; q < 3; q++)
            if (g[r][q] === "#")
              x.fillRect(pad + ox + (i * 4 + q) * scale, pad + oy + r * scale, scale, scale);
      });
    };
    if (outline) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]])
        paint(P[outline] || outline, ox, oy);
    }
    paint(P[color] || color, 0, 0);
    cache.set(key, c);
    return c;
  }

  /* text(ctx, str, x, y, {color, scale, outline, align}) */
  function text(ctx, str, x, y, opts = {}) {
    const { color = "W", scale = 1, outline = "K", align = "left" } = opts;
    const c = bake(str, color, scale, outline);
    let dx = x - (outline ? 1 : 0);
    if (align === "center") dx = x - c.width / 2;
    else if (align === "right") dx = x - c.width + (outline ? 1 : 0);
    ctx.drawImage(c, Math.round(dx), Math.round(y - (outline ? 1 : 0)));
  }

  HB.font = { glyphs: G, text, measure, supports };
})(window.HB);
