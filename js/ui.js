/* ==========================================================================
   PAGE UI — everything outside the canvas
   URL params, title screen + welcome song, toolbar buttons, dialogs,
   rotating hints. Loaded BEFORE party.js, which calls back into HB.ui.
   ========================================================================== */
window.HB = window.HB || {};

(function (HB) {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ---------------- URL params: ?name=Sam&age=7&msg=...&from=Alex ---- */
  const qs = new URLSearchParams(window.location.search);
  const clean = (s, n) => (s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
  const ageNum = parseInt(qs.get("age"), 10);
  const params = {
    name: clean(qs.get("name"), 20),
    age: ageNum >= 1 && ageNum <= 120 ? ageNum : null,
    msg: clean(qs.get("msg"), 240),
    from: clean(qs.get("from"), 24),
  };
  HB.params = params;

  const title = params.name ? `Happy Birthday, ${params.name}!` : "Happy Birthday!";
  $("greeting").textContent = title;
  document.title = title;
  $("subtitle").textContent = params.age
    ? `${params.age} looks good on you!`
    : "a tiny pixel party, just for you";
  $("start-name").textContent = params.name ? `for ${params.name}` : "a pixel party";

  /* ---------------- welcome song (the .m4a in the repo) -------------- */
  const song = $("welcome-song");
  const songBtn = $("btn-song");
  const soundBtn = $("btn-sound");

  function setSongBtn(playing) {
    songBtn.setAttribute("aria-pressed", String(playing));
    songBtn.textContent = playing ? "♪ Stop song" : "♪ Replay song";
  }
  song.addEventListener("play", () => setSongBtn(true));
  song.addEventListener("pause", () => setSongBtn(false));
  song.addEventListener("ended", () => setSongBtn(false));
  song.muted = HB.audio.isMuted();

  function playWelcome(fromStart) {
    if (fromStart) song.currentTime = 0;
    const p = song.play();
    if (p && p.catch) p.catch(() => setSongBtn(false));
  }
  songBtn.addEventListener("click", () => {
    if (!song.paused) { song.pause(); return; }
    HB.audio.stopSong();
    playWelcome(true);
  });

  function setSoundBtn() {
    const m = HB.audio.isMuted();
    soundBtn.textContent = m ? "Sound: off" : "Sound: on";
    soundBtn.setAttribute("aria-pressed", String(!m));
  }
  soundBtn.addEventListener("click", () => {
    HB.audio.setMuted(!HB.audio.isMuted());
    song.muted = HB.audio.isMuted();
    setSoundBtn();
  });
  setSoundBtn();

  /* Entering the game. Normally this happens when the lock screen finishes
     fading out (js/lock.js fires "hb:unlocked"); the Press Start title screen
     is only a fallback if there's no lock. Order, once the transition is
     FULLY done: welcome song starts -> 3 s later the goals popup opens. */
  const start = $("start");
  const TITLE_FADE_MS = 400; // matches .start transition in style.css
  let started = false;
  const locked = () => HB.lock && HB.lock.isLocked();
  function begin(fadeMs = TITLE_FADE_MS) {
    // never start while the lock screen is still in the page (it fires
    // "hb:unlocked" only after it has fully faded out and removed itself)
    if (started || locked() || document.getElementById("lock")) return;
    started = true;
    HB.audio.ensure();
    if (fadeMs) {
      start.classList.add("is-hidden");
      setTimeout(() => { start.hidden = true; }, fadeMs);
    } else start.hidden = true;
    $("stage").focus({ preventScroll: true });
    setTimeout(() => {
      if (!HB.audio.isMuted()) playWelcome(true);
      // explain the goals + reward. The welcome F-14 flyby waits until that
      // popup is closed so it isn't hidden behind it.
      setTimeout(() => {
        updateGoals(game().GOALS, game().goals());
        openDialog($("goals"));
        $("goals").addEventListener("close", () => game().scheduleFlyby(1.5), { once: true });
      }, 3000);
    }, fadeMs);
  }
  window.addEventListener("hb:unlocked", () => begin(0));
  $("btn-start").addEventListener("click", () => begin());
  window.addEventListener("keydown", (e) => {
    if (started || start.hidden || (e.target.closest && e.target.closest("input, textarea, #lock"))) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); begin(); }
  });
  if (!locked()) $("btn-start").focus();

  /* ---------------- toolbar ----------------------------------------- */
  const game = () => HB.game;
  $("btn-blow").addEventListener("click", () => game().blowAll());
  $("btn-relight").addEventListener("click", () => game().relight());
  $("btn-fw").addEventListener("click", () => game().fireworks());
  $("btn-snap").addEventListener("click", () => game().snapshot());
  $("btn-jet").addEventListener("click", () => game().flyby());

  // Relock: the lock isn't saved anywhere, so reloading brings it back.
  const relockBtn = $("btn-relock");
  relockBtn.hidden = !HB.lock;
  relockBtn.addEventListener("click", () => {
    HB.audio.sfx.clank();
    relockBtn.disabled = true;
    relockBtn.textContent = "Locking...";
    document.body.classList.add("relocking");
    setTimeout(() => location.reload(), 450);
  });

  /* ---------------- dialogs ----------------------------------------- */
  /* One modal at a time: if another is already open (e.g. the wish card and
     the reward collage both fire after the last candle), queue it. */
  const queue = [];
  function openDialog(d) {
    if (d.open || queue.includes(d)) return;
    if (document.querySelector("dialog[open]")) { queue.push(d); return; }
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  }
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("close", () => {
      const next = queue.shift();
      if (next) setTimeout(() => openDialog(next), 250);
    }));
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = b.closest("dialog");
      if (d.close) d.close(); else { d.removeAttribute("open"); d.dispatchEvent(new Event("close")); }
    }));

  // wish card, opened after the candles go out
  function openCard() {
    $("card-title").textContent = title;
    $("card-msg").textContent = params.msg ||
      "Another trip around the sun! Wishing you a year full of cake, sunny naps, " +
      "happy zoomies and people (and pups) who think you're the very best.";
    $("card-from").textContent = params.from ? `with love, ${params.from}` : "with love & tail wags";
    openDialog($("card"));
  }

  // goals
  const goalsBtn = $("btn-goals");
  function updateGoals(list, done) {
    goalsBtn.textContent = `★ ${done.size}/${list.length}`;
    $("reward-status").textContent = rewardOpen
      ? "Reward: unlocked!"
      : `Reward: locked (${done.size}/${list.length})`;
    $("reward-row").classList.toggle("unlocked", rewardOpen);
    $("btn-open-reward").hidden = !rewardOpen;
    const ul = $("goal-list");
    ul.textContent = "";
    for (const g of list) {
      const li = document.createElement("li");
      const got = done.has(g.id);
      li.className = got ? "done" : "";
      li.textContent = `${got ? "★" : "☆"} ${g.secret && !got ? "???" : g.name} — ${g.desc}`;
      ul.appendChild(li);
    }
  }
  goalsBtn.addEventListener("click", () => {
    updateGoals(game().GOALS, game().goals());
    openDialog($("goals"));
  });

  /* ---------------- final reward: collage in a pixel photo frame ---- */
  // Photos were converted from HEIC to JPEG and the videos to looping GIFs
  // (see README). Order mixes clips between photos; "wide" spans 2 columns.
  const COLLAGE = [
    { src: "photo-3182.jpg", alt: "Holding a small tan dog" },
    { src: "clip-1.gif",     alt: "Video clip: sipping a drink" },
    { src: "photo-1523.jpg", alt: "Lounging on a couch", wide: true },
    { src: "lp_image.jpg",   alt: "Big excited selfie" },
    { src: "photo-8694.jpg", alt: "On a bike with a helmet" },
    { src: "clip-2.gif",     alt: "Video clip: snuggled in a blanket with a banana" },
    { src: "photo-9395.jpg", alt: "Sipping a chocolate drink through a straw" },
    { src: "photo-3211.jpg", alt: "Waving from the car" },
    { src: "photo-2258.jpg", alt: "Funny face selfie: current status, dying" },
    { src: "clip-3.gif",     alt: "Video clip: laughing with a friend" },
    { src: "photo-3867.jpg", alt: "Cosy in a scarf at a restaurant" },
    { src: "photo-7555.jpg", alt: "Big bowl of noodle soup" },
    { src: "photo-9970.jpg", alt: "Digging into a bibimbap lunch" },
    { src: "photo-3809.jpg", alt: "Car selfie in a scarf" },
  ];
  let rewardOpen = false, collageBuilt = false;
  const rewardBtn = $("btn-reward");

  function buildCollage() {
    if (collageBuilt) return;
    collageBuilt = true;
    const grid = $("collage-grid");
    COLLAGE.forEach((item, i) => {
      const fig = document.createElement("figure");
      fig.className = "polaroid" + (item.wide ? " wide" : "") + (/\.gif$/.test(item.src) ? " is-gif" : "");
      fig.style.setProperty("--tilt", `${[-2, 1.5, -1, 2, -1.5, 1][i % 6]}deg`);
      fig.style.setProperty("--delay", `${i * 70}ms`);
      const img = document.createElement("img");
      img.src = `assets/collage/${item.src}`;
      img.alt = item.alt;
      img.decoding = "async";
      fig.appendChild(img);
      grid.appendChild(fig);
    });
  }
  function openCollage() {
    buildCollage();
    $("collage-title").textContent = params.name ? `Happy Birthday, ${params.name} ♥` : "Happy Birthday ♥";
    openDialog($("collage"));
  }
  function unlockReward() {
    rewardOpen = true;
    rewardBtn.textContent = "♥ Open reward";
    rewardBtn.setAttribute("aria-disabled", "false");
    rewardBtn.classList.add("is-unlocked");
    updateGoals(game().GOALS, game().goals());
    openCollage();
  }
  rewardBtn.addEventListener("click", () => {
    if (rewardOpen) openCollage();
    else { updateGoals(game().GOALS, game().goals()); openDialog($("goals")); }
  });
  // Save the animated card GIF (made by tools/make_card_gif.py). Hosted: the
  // <a download> link just works. From file:// browsers ignore `download`, so
  // load the base64 copy via <script> and download it as a blob instead.
  $("btn-save-gif").addEventListener("click", (e) => {
    HB.audio.sfx.unlock();
    if (location.protocol !== "file:") return;
    e.preventDefault();
    const save = () => {
      const [head, b64] = window.HB_CARD_GIF.split(",");
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: head.slice(5, -7) }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "happy-birthday-card.gif";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    if (window.HB_CARD_GIF) return save();
    const s = document.createElement("script");
    s.src = "assets/happy-birthday-card.gif.js";
    s.onload = save;
    document.head.appendChild(s);
  });
  $("btn-open-reward").addEventListener("click", () => { $("goals").close(); openCollage(); });

  /* ---------------- rotating hints + screen-reader announcements ---- */
  const HINTS = [
    "Tap the balloons to pop them",
    "Tap the pup for pets",
    "Tap the grass and the pup trots over",
    "Tap the ball to play fetch!",
    "Open the presents!",
    "Blow out the candles!",
    "Tap the sky for sparkle bursts",
    "Tap the F-14 for a barrel roll!",
    "Arrow keys walk the pup, space jumps, J calls the jet",
    "The pup naps if you go quiet...",
    "Psst... the sun is ticklish",
    "Finish every party goal for a special reward",
  ];
  let hintI = 0;
  const hint = $("hint");
  hint.textContent = HINTS[0];
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(() => {
      hintI = (hintI + 1) % HINTS.length;
      hint.classList.add("swap");
      setTimeout(() => { hint.textContent = HINTS[hintI]; hint.classList.remove("swap"); }, 250);
    }, 5000);
  }
  const live = $("live");
  function announce(msg) { live.textContent = msg; }

  HB.ui = {
    openCard, updateGoals, announce, unlockReward,
    songPlaying: () => !song.paused,
  };
})(window.HB);
