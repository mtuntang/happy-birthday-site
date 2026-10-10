/* ==========================================================================
   CHIPTUNE AUDIO (WebAudio, no files)
   Square/triangle oscillators + filtered noise. The AudioContext is created
   lazily on the first user gesture (browsers block autoplay otherwise).
   ========================================================================== */
window.HB = window.HB || {};

(function (HB) {
  "use strict";

  let ac = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem("hb-muted") === "1"; } catch (_) { /* file:// or private mode */ }

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  function setMuted(v) {
    muted = v;
    try { localStorage.setItem("hb-muted", v ? "1" : "0"); } catch (_) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(v ? 0 : 0.22, ac.currentTime, 0.02);
  }

  /* one oscillator note with a tiny attack/decay envelope */
  function tone(freq, dur, { type = "square", vol = 0.3, slide = 0, at = 0 } = {}) {
    if (!ensure() || muted) return;
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, { vol = 0.3, freq = 2000, q = 1, at = 0, type = "bandpass" } = {}) {
    if (!ensure() || muted) return;
    const t = ac.currentTime + at;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  const sfx = {
    pop()    { noise(0.12, { vol: 0.5, freq: 1800, q: 0.7 }); tone(900, 0.06, { slide: -600, vol: 0.15 }); },
    bark()   { tone(520, 0.07, { slide: -180, vol: 0.25 }); tone(440, 0.09, { slide: -200, vol: 0.25, at: 0.1 }); },
    yip()    { tone(700, 0.06, { slide: 300, vol: 0.2 }); },
    jump()   { tone(300, 0.12, { slide: 500, vol: 0.15 }); },
    chomp()  { noise(0.05, { vol: 0.3, freq: 600, q: 2 }); },
    blow()   { noise(0.35, { vol: 0.35, freq: 900, q: 0.4, type: "lowpass" }); },
    fizz()   { noise(0.25, { vol: 0.15, freq: 4000, q: 0.5, type: "highpass" }); },
    launch() { tone(200, 0.5, { type: "triangle", slide: 700, vol: 0.12 }); noise(0.4, { vol: 0.08, freq: 3000 }); },
    boom()   { noise(0.7, { vol: 0.5, freq: 300, q: 0.5, type: "lowpass" }); noise(0.4, { vol: 0.12, freq: 5000, at: 0.08, type: "highpass" }); },
    unwrap() { noise(0.2, { vol: 0.25, freq: 2500, q: 0.6 }); [523, 659, 784].forEach((f, i) => tone(f, 0.1, { at: 0.08 * i, vol: 0.15 })); },
    unlock() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, { at: 0.07 * i, vol: 0.14 })); },
    relight(){ [392, 523].forEach((f, i) => tone(f, 0.1, { type: "triangle", at: 0.06 * i, vol: 0.2 })); },
    clank()  { noise(0.08, { vol: 0.35, freq: 3500, q: 3 }); tone(1900, 0.12, { type: "triangle", vol: 0.12, slide: -300 }); noise(0.08, { vol: 0.25, freq: 2800, q: 3, at: 0.09 }); tone(1600, 0.1, { type: "triangle", vol: 0.1, slide: -250, at: 0.09 }); },
    click()  { tone(1200, 0.03, { vol: 0.08 }); },
    /* jet roar: looping noise swept high -> low (doppler-ish), swelling in and out */
    jet(dur = 3.5) {
      if (!ensure() || muted) return;
      const t = ac.currentTime;
      const s = ac.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      const f = ac.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 0.7;
      f.frequency.setValueAtTime(2400, t);
      f.frequency.exponentialRampToValueAtTime(350, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(master);
      s.start(t);
      s.stop(t + dur + 0.05);
      tone(1500, dur * 0.9, { type: "sawtooth", vol: 0.035, slide: -1100 });
    },
    roll()   { noise(0.6, { vol: 0.35, freq: 1200, q: 0.5 }); tone(500, 0.5, { type: "sawtooth", vol: 0.05, slide: 600 }); },
    twinkle(){ [1568, 2093, 2637].forEach((f, i) => tone(f, 0.08, { type: "triangle", at: 0.05 * i, vol: 0.1 })); },
  };

  /* --- "Happy Birthday to You" (public domain melody), 3/4 at ~100bpm --- */
  const N = { G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784 };
  const MELODY = [
    ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["C5", 1], ["B4", 2],
    ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["D5", 1], ["C5", 2],
    ["G4", 0.75], ["G4", 0.25], ["G5", 1], ["E5", 1], ["C5", 1], ["B4", 1], ["A4", 2],
    ["F5", 0.75], ["F5", 0.25], ["E5", 1], ["C5", 1], ["D5", 1], ["C5", 3],
  ];
  let songTimer = null;

  function playSong(onEnd) {
    if (!ensure()) return 0;
    stopSong();
    const beat = 0.55;
    let at = 0.05;
    for (const [n, b] of MELODY) {
      const f = N[n];
      tone(f, b * beat * 0.9, { type: "square", vol: 0.16, at });
      tone(f / 2, b * beat * 0.9, { type: "triangle", vol: 0.22, at });
      at += b * beat;
    }
    songTimer = setTimeout(() => { songTimer = null; onEnd && onEnd(); }, at * 1000);
    return at;
  }
  function stopSong() {
    // scheduled notes cannot be cancelled individually, so briefly duck the master
    if (songTimer) {
      clearTimeout(songTimer);
      songTimer = null;
      if (master) {
        master.disconnect();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.22;
        master.connect(ac.destination);
      }
    }
  }

  HB.audio = {
    ensure, sfx, playSong, stopSong,
    isMuted: () => muted, setMuted,
    isPlaying: () => !!songTimer,
    context: () => ac,
  };
})(window.HB);
