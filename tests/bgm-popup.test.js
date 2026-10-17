/* WINDOWKILL — BGM volume + popup/menu flow tests (node:test).
 * FIX 2026-10-17 (user báo 3 triệu chứng):
 *  1. Slider "Độ to nhạc nền" chỉnh xong không giữ — BGM fade về hardcode 0.5 mỗi lần
 *     fade/watchdog restart (setting nghe được khác setting đã chỉnh).
 *  2. Nút "về menu" trong popup navigate popup sang index.html → duplicate trang web.
 *  3. Hệ quả của (2): BGM 2 nơi (opener resume ở pagehide + trang mới init) → nhạc duplicate.
 * Chạy: node --test tests/bgm-popup.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* ---- fake browser env cho js/bgm.js ---- */
class FakeAudio {
  constructor() {
    this.volume = 0; this.preload = ""; this.paused = true;
    this.src = ""; this.loop = false;
    this._fadeId = 0; this._xarmed = false; this._triedOgg = false;
  }
  addEventListener() {}
  getAttribute() { return null; }
  load() {}
  play() { this.paused = false; }
  pause() { this.paused = true; }
}
function loadBgm() {
  const listeners = {};
  const audios = [];
  function FakeAudioCtor() { const a = new FakeAudio(); audios.push(a); return a; }
  const fakeWindow = {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: () => {},
    Audio: FakeAudioCtor,
    requestAnimationFrame: (cb) => { cb(9e15); }, // timestamp rất lớn → fade hoàn tất ngay
    performance: { now: () => 0 },
    setInterval: () => 0,
    clearInterval: () => {},
  };
  const sandbox = {
    window: fakeWindow, Audio: FakeAudioCtor, console,
    setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: (cb) => { cb(9e15); },
    performance: { now: () => 0 }, // step() dùng performance.now khi có → fade kết thúc ngay
  };
  vm.createContext(sandbox);
  vm.runInContext(read("js/bgm.js"), sandbox);
  return { BGM: sandbox.window.BGM, listeners, audios };
}

describe("BGM.setVolume giữ được sau fade (bug setting nhạc khác nhau)", () => {
  it("fade mục tiêu theo setVolume, không hardcode 0.5", () => {
    const { BGM, listeners, audios } = loadBgm();
    BGM.init();
    assert.equal(audios.length, 2, "init phải tạo 2 players");
    BGM.setVolume(0.2);
    BGM.setEnabled(true);
    // giả lập tương tác đầu tiên của user → unlock → ensurePlaying → playAt → fadeTo
    (listeners["pointerdown"] || []).forEach((fn) => fn());
    for (const a of audios) {
      assert.ok(Math.abs(a.volume - 0.2) < 1e-9,
        `volume sau fade phải = 0.2 (theo slider), thực tế ${a.volume}`);
    }
  });

  it("setVolume clamp 0..1", () => {
    const { BGM, audios } = loadBgm();
    BGM.init();
    BGM.setVolume(2);
    for (const a of audios) assert.ok(Math.abs(a.volume - 1) < 1e-9);
    BGM.setVolume(-3);
    for (const a of audios) assert.ok(Math.abs(a.volume - 0) < 1e-9);
  });

  it("không còn hardcode VOLUME trong fade", () => {
    const src = read("js/bgm.js");
    assert.ok(!/fadeTo\(a, VOLUME/.test(src), "fadeTo không được dùng VOLUME hardcode nữa");
    assert.ok(/let volTarget/.test(src), "phải có volTarget mutable");
    assert.ok(/volTarget = v/.test(src), "setVolume phải cập nhật volTarget");
  });
});

describe("quitToMenu không duplicate trang (tĩnh)", () => {
  it("js/game/15-ui.js: về menu đóng popup + focus opener", () => {
    const src = read("js/game/15-ui.js");
    assert.ok(src.includes("window.opener"), "quitToMenu phải kiểm tra window.opener");
    assert.ok(src.includes("window.close()"), "quitToMenu phải đóng popup");
    assert.ok(src.includes("opener.focus"), "quitToMenu phải focus về menu gốc");
    // không còn navigate thẳng popup sang index.html như path chính
    const m = src.match(/function quitToMenu\(\) \{[\s\S]*?\n\}/);
    assert.ok(m, "tìm thấy quitToMenu");
    assert.ok(m[0].includes("backToOpener"), "quitToMenu phải phân nhánh theo opener");
  });
});
