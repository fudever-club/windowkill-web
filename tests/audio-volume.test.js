/* WINDOWKILL — audio volume tests (node:test).
 * FEAT 2026-10-17: thanh trượt âm lượng nhạc nền/hiệu ứng + giảm mặc định SFX ~65%.
 * Chạy: node --test tests/audio-volume.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* ---- fake Web Audio ---- */
function fakeAudioContext(gains) {
  return function FakeAC() {
    return {
      state: "running",
      sampleRate: 44100,
      destination: {},
      createGain() { const g = { gain: { value: 0 }, connect() {} }; gains.push(g); return g; },
      createDynamicsCompressor() { return { threshold: {}, ratio: {}, connect() {} }; },
      resume() {},
    };
  };
}
function loadSfx2() {
  const gains = [];
  const sandboxWindow = { AudioContext: fakeAudioContext(gains) };
  const module = { exports: {} };
  // sfx2.js là IIFE tự gắn window.Sfx2 / module.exports
  const boot = new Function("window", "module", read("js/sfx2.js"));
  boot(sandboxWindow, module);
  return { Sfx2: sandboxWindow.Sfx2 || module.exports, gains };
}

describe("Sfx2.setVolume", () => {
  it("export setVolume và scale master gain theo 0.85 * v", () => {
    const { Sfx2, gains } = loadSfx2();
    assert.equal(typeof Sfx2.setVolume, "function", "Sfx2.setVolume phải tồn tại");
    Sfx2.setVolume(0.5);
    Sfx2.resume(); // tạo ctx + master
    const master = gains[0];
    assert.ok(master, "resume() phải tạo master gain");
    assert.ok(Math.abs(master.gain.value - 0.85 * 0.5) < 1e-9,
      `master gain phải = 0.425, thực tế ${master.gain.value}`);
  });

  it("setVolume sau resume đổi gain ngay + clamp 0..1", () => {
    const { Sfx2, gains } = loadSfx2();
    Sfx2.resume();
    const master = gains[0];
    Sfx2.setVolume(1);
    assert.ok(Math.abs(master.gain.value - 0.85) < 1e-9);
    Sfx2.setVolume(2); // clamp về 1
    assert.ok(Math.abs(master.gain.value - 0.85) < 1e-9);
    Sfx2.setVolume(-3); // clamp về 0
    assert.ok(Math.abs(master.gain.value - 0) < 1e-9);
    Sfx2.setVolume(0.3); // default mới: giảm ~65% so với 0.85 cũ
    assert.ok(Math.abs(master.gain.value - 0.85 * 0.3) < 1e-9);
  });
});

describe("volume settings (tĩnh)", () => {
  it("js/i18n.js có key settings.music_vol + settings.sfx_vol ở cả 2 dict", () => {
    const src = read("js/i18n.js");
    for (const k of ["settings.music_vol", "settings.sfx_vol"]) {
      const hits = src.match(new RegExp('"' + k + '"', "g")) || [];
      assert.ok(hits.length >= 2, `thiếu key ${k} ở 1 trong 2 dict`);
    }
  });

  it("index.html có 2 slider vol-music/vol-sfx gắn i18n", () => {
    const html = read("index.html");
    assert.ok(html.includes('id="vol-music"'), "thiếu #vol-music");
    assert.ok(html.includes('id="vol-sfx"'), "thiếu #vol-sfx");
    assert.ok(html.includes('data-i18n="settings.music_vol"'), "thiếu i18n settings.music_vol");
    assert.ok(html.includes('data-i18n="settings.sfx_vol"'), "thiếu i18n settings.sfx_vol");
  });

  it("js/menu.js: default musicVol 0.5 / sfxVol 0.3 + applyVolumes đẩy xuống 3 engine", () => {
    const src = read("js/menu.js");
    assert.ok(src.includes("musicVol: 0.5"), "thiếu default musicVol: 0.5");
    assert.ok(src.includes("sfxVol: 0.3"), "thiếu default sfxVol: 0.3");
    assert.ok(src.includes("BGM.setVolume(mv)"), "applyVolumes phải gọi BGM.setVolume");
    assert.ok(src.includes("AudioEngine.setSettings({ musicVol: mv, sfxVol: sv })"),
      "applyVolumes phải gọi AudioEngine.setSettings với volumes");
    assert.ok(src.includes("Sfx2.setVolume(sv)"), "applyVolumes phải gọi Sfx2.setVolume");
    assert.ok(src.includes('volMusic.addEventListener("input"') || src.includes("vol-music"),
      "thiếu wiring slider vol-music");
  });

  it("js/game/00-head.js: boot game áp volumes đã lưu từ wk_settings", () => {
    const src = read("js/game/00-head.js");
    assert.ok(src.includes("wk_settings"), "phải đọc wk_settings khi boot");
    assert.ok(src.includes("musicVol") && src.includes("sfxVol"), "phải áp musicVol/sfxVol khi boot");
  });
});
