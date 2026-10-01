/* WINDOWKILL: Web Edition — shared audio engine (Web Audio, no files) */
"use strict";
const AudioEngine = (() => {
  let ctx = null;
  let settings = { music: true, sfx: true, musicVol: 0.7, sfxVol: 0.9 };
  let musicTimer = null, step = 0, mode = "menu";

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function resume() { try { ac().resume(); } catch (e) {} }

  // tone(freq, dur, type, vol(0..1), slideTo, delaySec, useMusicBus)
  function tone(f, d, type = "square", v = 0.08, slideTo = null, when = 0, musicBus = false) {
    if (musicBus && !settings.music) return;
    if (!musicBus && !settings.sfx) return;
    try {
      const a = ac(), t = a.currentTime + when;
      const o = a.createOscillator(), g = a.createGain();
      const vol = v * (musicBus ? settings.musicVol : settings.sfxVol);
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + d + 0.05);
    } catch (e) {}
  }

  const sfx = {
    shoot()  { tone(700 + Math.random() * 120, .07, "square", .05, 220); },
    hit()    { tone(180, .08, "sawtooth", .07, 90); },
    boom()   { tone(140, .25, "sawtooth", .12, 40); tone(90, .3, "triangle", .1, 35, .03); },
    bigboom(){ tone(100, .5, "sawtooth", .16, 30); tone(70, .6, "triangle", .14, 28, .05); },
    gem()    { tone(990, .07, "sine", .07, 1480); },
    up()     { [523, 659, 784, 1046].forEach((f, i) => tone(f, .12, "triangle", .1, null, i * .07)); },
    thud()   { tone(120, .1, "square", .1, 60); },
    shrink() { tone(300, .18, "sawtooth", .06, 140); },
    wave()   { [392, 523, 659].forEach((f, i) => tone(f, .14, "square", .08, null, i * .09)); },
    boss()   { [110, 98, 82, 65].forEach((f, i) => tone(f, .3, "sawtooth", .12, null, i * .16)); },
    over()   { [330, 262, 196, 131].forEach((f, i) => tone(f, .25, "sawtooth", .11, null, i * .18)); },
    hurt()   { tone(220, .2, "sawtooth", .13, 70); },
    pickup() { tone(660, .1, "triangle", .1, 990); tone(990, .12, "triangle", .09, 1320, .08); },
    nuke()   { tone(60, .9, "sawtooth", .16, 400); [880, 1174, 1568].forEach((f, i) => tone(f, .2, "triangle", .08, null, .15 + i * .1)); },
    click()  { tone(520, .05, "square", .05, 700); },
  };

  const MENU_BASS = [65.4, 0, 82.4, 0, 73.4, 0, 98, 82.4];
  const MENU_ARP  = [261.6, 329.6, 392, 523.2, 392, 329.6, 293.7, 329.6];
  const GAME_BASS = [55, 0, 55, 65.4, 0, 55, 82.4, 73.4];
  const GAME_HAT  = [1, 0, 1, 1, 0, 1, 0, 1];
  // Nhạc theo Act (v2.0): tempo tăng dần theo độ căng. "game" = act1 (tương thích ngược).
  const ACT2_BASS = [55, 0, 55, 58.3, 0, 55, 65.4, 62.2];
  const ACT3_BASS = [55, 55, 65.4, 55, 49, 55, 58.3, 73.4];
  const TRACKS = {
    menu: { dur: 240, bass: MENU_BASS, arp: MENU_ARP, bassDur: .22, bassVol: .09 },
    game: { dur: 165, bass: GAME_BASS, hat: GAME_HAT, stab: true, bassDur: .16, bassVol: .1 },
    act1: { dur: 165, bass: GAME_BASS, hat: GAME_HAT, stab: true, bassDur: .16, bassVol: .1 },
    act2: { dur: 148, bass: ACT2_BASS, hat: GAME_HAT, stab: true, bassDur: .16, bassVol: .11 },
    act3: { dur: 130, bass: ACT3_BASS, hat: GAME_HAT, stab: true, bassDur: .14, bassVol: .12 },
  };

  function startMusic(m) {
    mode = m || mode;
    stopMusic(); resume();
    if (!settings.music) return;
    const tr = TRACKS[mode] || TRACKS.game;
    musicTimer = setInterval(() => {
      if (!settings.music) return;
      const i = step % 8; step++;
      const b = tr.bass[i];
      if (b) tone(b, tr.bassDur, "triangle", tr.bassVol, null, 0, true);
      if (tr.hat && tr.hat[i]) tone(6000, .03, "square", .02, null, 0, true);
      if (tr.stab && i === 4) tone(220, .12, "sawtooth", .03, 110, 0, true);
      if (tr.arp && i % 2 === 0) { const a = tr.arp[i]; if (a) tone(a, .18, "sine", .05, null, 0, true); }
    }, tr.dur);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function setSettings(s) { Object.assign(settings, s); if (!settings.music) stopMusic(); }

  return { setSettings, resume, tone, sfx, startMusic, stopMusic };
})();

/* Compat (hotfix 2026-10-01): menu.js goi WKAudio.setMusic/setSfx/ensure —
   alias sang AudioEngine de launcher boot duoc. */
window.WKAudio = {
  setMusic: (v) => AudioEngine.setSettings({ music: !!v }),
  setSfx: (v) => AudioEngine.setSettings({ sfx: !!v }),
  ensure: () => AudioEngine.resume(),
};
