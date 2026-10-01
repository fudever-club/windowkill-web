/* js/bgm.js — BGM player: nhạc nền CÓ THẬT (assets/music/*.mp3)
 *
 * - Playlist 4 track CC0: vui nhộn, nhịp nhanh, không rùng rợn.
 * - Shuffle + loop playlist, crossfade ~1.5s giữa các track (2 thẻ <audio>).
 * - Khi track phát OK → patch AudioEngine.startMusic/setMusicState thành no-op
 *   để TẮT procedural music layers (tránh chồng nhạc). SFX procedural GIỮ NGUYÊN.
 * - Track load lỗi hết → fallback về procedural music, không crash, không im lặng.
 * - Tôn trọng settings.music qua BGM.setEnabled(bool).
 * - Chạy độc lập nếu audio.js/AudioEngine chưa load — không crash.
 */
window.BGM = (() => {
  "use strict";

  const BASE = "assets/music/";
  const TRACKS = [
    { file: "joyfully-loop",       title: "Joyfully",       artist: "MintoDog" },
    { file: "pixel-sprinter-loop",  title: "Pixel Sprinter", artist: "Zane Little Music" },
    { file: "dog-in-car",           title: "Dog in Car",     artist: "congusbongus" },
    { file: "heckin-crows",         title: "Heckin' Crows",  artist: "congusbongus" },
  ];
  const XFADE_MS = 1500;
  const VOLUME = 0.5; // vừa phải, không lấn SFX

  let enabled = false;   // user muốn nhạc (settings.music)
  let trackOK = true;    // còn ít nhất 1 track phát được
  let order = [];
  let pos = 0;
  let players = [];      // 2 thẻ <audio> luân phiên crossfade
  let cur = 0;           // player đang phát chính
  let started = false;
  let unlocked = false;
  let patched = false;
  let allFailed = false;
  let lastPlayAt = 0;      // lần cuối gọi play()
  let playFailCount = 0;   // số lần watchdog thấy player bị pause
  let playFailStreak = 0;  // số track liên tiếp play() thất bại
  let watchdogTimer = 0;
  const _orig = {};

  function ae() {
    return (typeof window.AudioEngine !== "undefined") ? window.AudioEngine : null;
  }
  function shouldSuppress() { return enabled && trackOK && !allFailed && !!ae(); }

  /* ---- patch: chặn procedural music khi BGM đang phát ---- */
  function installPatch() {
    const A = ae();
    if (!A || patched) return;
    if (typeof A.startMusic === "function") {
      _orig.startMusic = A.startMusic;
      A.startMusic = function () { if (shouldSuppress()) return undefined; return _orig.startMusic.apply(A, arguments); };
    }
    if (typeof A.setMusicState === "function") {
      _orig.setMusicState = A.setMusicState;
      A.setMusicState = function () { if (shouldSuppress()) return undefined; return _orig.setMusicState.apply(A, arguments); };
    }
    patched = true;
  }
  function removePatch() {
    const A = ae();
    if (!A || !patched) return;
    if (_orig.startMusic) A.startMusic = _orig.startMusic;
    if (_orig.setMusicState) A.setMusicState = _orig.setMusicState;
    patched = false;
    _orig.startMusic = _orig.setMusicState = undefined;
  }

  /* ---- playlist ---- */
  function shuffle() {
    order = TRACKS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    pos = 0;
  }
  function currentTrack() { return TRACKS[order[pos]]; }

  /* ---- players ---- */
  function makePlayers() {
    if (players.length) return;
    for (let i = 0; i < 2; i++) {
      const a = new Audio();
      a.preload = "auto";
      a.volume = 0;
      a._fadeId = 0;
      a._xarmed = false;
      a._triedOgg = false;
      players.push(a);
      wirePlayer(a, i);
    }
  }
  function wirePlayer(a, idx) {
    a.addEventListener("playing", () => { trackOK = true; playFailStreak = 0; playFailCount = 0; });
    a.addEventListener("ended", () => { if (idx === cur) next(false); });
    a.addEventListener("error", () => onTrackError(a, idx));
    a.addEventListener("timeupdate", () => {
      if (idx !== cur || a._xarmed || !a.duration || !isFinite(a.duration)) return;
      if (a.duration - a.currentTime <= XFADE_MS / 1000 + 0.3) {
        a._xarmed = true;
        next(true);
      }
    });
  }

  function fadeTo(a, target, ms) {
    const id = ++a._fadeId;
    const from = a.volume;
    const t0 = (typeof performance !== "undefined") ? performance.now() : Date.now();
    function step(now) {
      if (id !== a._fadeId) return; // fade mới hơn đã thay thế
      const t = (typeof performance !== "undefined") ? now : Date.now();
      const k = Math.min(1, (t - t0) / Math.max(1, ms));
      a.volume = from + (target - from) * k;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function tryPlay(a) {
    lastPlayAt = Date.now();
    try {
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => { /* watchdog bên dưới sẽ retry */ });
    } catch (e) { /* watchdog bên dưới sẽ retry */ }
  }

  /* Watchdog: nhạc bật mà player bị pause quá 3s → thử play lại;
     3 lần không được → bỏ qua track lỗi, chuyển bài tiếp;
     hết cả 4 track đều lỗi → fallback về procedural, không im lặng. */
  function scheduleWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
      if (!enabled || allFailed || !started || players.length === 0) return;
      const a = players[cur];
      if (!a || !a.src) return;
      if (!a.paused) { playFailCount = 0; return; } // đang phát tốt
      if (Date.now() - lastPlayAt <= 3000) return;   // cho track 3s để bắt đầu
      playFailCount++;
      if (playFailCount < 3) { tryPlay(a); return; }
      playFailCount = 0;
      playFailStreak++;
      if (playFailStreak >= TRACKS.length) { fallbackToProcedural(); return; }
      next(false);
    }, 4000);
  }

  function playAt(playerIdx, trackIdx, fadeInMs) {
    const a = players[playerIdx];
    const t = TRACKS[trackIdx];
    a._fadeId++; // hủy fade cũ
    a._xarmed = false;
    a._triedOgg = false;
    try { a.pause(); } catch (e) {}
    a.src = BASE + t.file + ".mp3";
    try { a.load(); } catch (e) {}
    fadeTo(a, VOLUME, fadeInMs);
    tryPlay(a);
  }

  function next(crossfade) {
    if (allFailed) return;
    pos++;
    if (pos >= order.length) shuffle();
    const old = players[cur];
    const nxt = 1 - cur;
    if (crossfade) {
      fadeTo(old, 0, XFADE_MS);
      setTimeout(() => { try { if (players[cur] !== old) old.pause(); } catch (e) {} }, XFADE_MS + 100);
    } else {
      old._fadeId++;
      try { old.pause(); } catch (e) {}
    }
    cur = nxt;
    playAt(cur, order[pos], crossfade ? XFADE_MS : 900);
  }

  const failedTracks = new Set();
  function onTrackError(a, idx) {
    if (idx !== cur || allFailed) return;
    const t = currentTrack();
    if (!a._triedOgg) { // thử ogg fallback 1 lần
      a._triedOgg = true;
      a.src = BASE + t.file + ".ogg";
      try { a.load(); } catch (e) {}
      tryPlay(a);
      return;
    }
    failedTracks.add(t.file);
    if (failedTracks.size >= TRACKS.length) { fallbackToProcedural(); return; }
    next(false);
  }

  function fallbackToProcedural() {
    allFailed = true;
    trackOK = false;
    stopPlayers();
    removePatch();
    const A = ae();
    if (A && enabled && typeof A.startMusic === "function") {
      try { A.startMusic(); } catch (e) { /* procedural cũng lỗi — chịu, SFX vẫn chạy */ }
    }
  }

  function stopPlayers() {
    players.forEach((a) => { a._fadeId++; try { a.pause(); } catch (e) {} });
  }

  function ensurePlaying() {
    if (!enabled || allFailed || !started || players.length === 0) return;
    const a = players[cur];
    if (!a.getAttribute("src") && !a.src) playAt(cur, order[pos], 1200);
    else if (a.paused) { fadeTo(a, VOLUME, 800); tryPlay(a); }
  }

  /* ---- public API ---- */
  function init() {
    if (started) return;
    started = true;
    try { makePlayers(); } catch (e) { allFailed = true; return; }
    shuffle();
    installPatch();
    const unlock = () => {
      unlocked = true;
      if (enabled && !allFailed) ensurePlaying(); // retry mỗi lần tương tác nếu nhạc đang bị kẹt
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    if (enabled) ensurePlaying();
    scheduleWatchdog();
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!started) return;
    if (allFailed) { // đã fallback procedural — để AudioEngine tự xử qua setSettings
      if (!enabled) { const A = ae(); if (A && typeof A.stopMusic === "function") { try { A.stopMusic(); } catch (e) {} } }
      return;
    }
    if (enabled) { installPatch(); ensurePlaying(); }
    else stopPlayers();
  }

  function nowPlaying() {
    if (allFailed || !started) return null;
    const t = currentTrack();
    return t ? (t.title + " — " + t.artist) : null;
  }

  return {
    init, setEnabled, nowPlaying,
    setVolume: (v) => { players.forEach((a) => { a.volume = Math.max(0, Math.min(1, v)); }); },
    version: "1.1-bgm-watchdog",
  };
})();
