/* WINDOWKILL — test Item 4 Sprint Round 2: setting "Độ Nhảy Cửa Sổ" (wjump).
 *
 * Spec (CEO chốt, default = Vừa):
 *  - Êm (calm):    impulse ≤15px/event,  cooldown 300ms, velocity ≤150px/s
 *  - Vừa (normal): impulse ≤35px/event,  cooldown 150ms, velocity ≤400px/s
 *  - Điên (wild):  giữ nguyên hiện tại — impulse ≤300px, không cooldown, velocity ≤950px/s
 *
 * Áp dụng: pushWindow() clamp impulse/event + cooldown (bỏ qua kick dồn dập),
 *           applyWindowMotion() clamp velocity theo preset.
 * Key `wjump` trong wk_settings ("calm"|"normal"|"wild"), default "normal".
 * Phối hợp worker Item 3: presets đọc từ window.WK_TUNING.tuning.window_physics
 * nếu có, fallback hardcode.
 *
 * Chạy: node --test tests/window-jump.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* ---------- minimal browser sandbox (reuse pattern tests/spawn-integration) ---------- */
function chainable() {
  const fn = function () {};
  return new Proxy(fn, {
    get: (t, p) => {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === "then") return undefined;
      return (...a) => chainable();
    },
    set: () => true,
  });
}
function mkEl() {
  const noop = () => {};
  return {
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    getContext: () => chainable(), width: 980, height: 700,
    textContent: "", innerHTML: "", onclick: null, onload: null,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 980, height: 700 }),
    play: () => Promise.resolve(), pause: noop, load: noop,
  };
}
function buildSandbox() {
  const noop = () => {};
  let rafCb = null;
  const moves = []; // spy window.moveBy(dx, dy) — nguồn đo velocity thật
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame: noop,
    performance: { now: () => simNow.value },
    moveBy: (dx, dy) => { moves.push([dx, dy]); },
    URLSearchParams, URL, Blob,
    navigator: { userAgent: "node-test", sendBeacon: noop },
    location: { search: "?diff=chill&music=1&sfx=1&shake=1&fx=full&sat=sim&tut=0", href: "http://x/game.html" },
    localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    sessionStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    innerWidth: 980, innerHeight: 700, outerWidth: 980, outerHeight: 700,
    screenX: 0, screenY: 0, devicePixelRatio: 1, screen: { availWidth: 1920, availHeight: 1080 },
    addEventListener: noop, removeEventListener: noop,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    getElementById: () => mkEl(), querySelector: () => mkEl(), querySelectorAll: () => [],
    createElement: () => mkEl(), addEventListener: noop, removeEventListener: noop,
    hidden: false, readyState: "complete", documentElement: mkEl(), body: mkEl(), title: "",
  };
  vm.createContext(sandbox);
  const simNow = { value: 0 };
  return { sandbox, simNow, moves, getRaf: () => rafCb, clearRaf: () => { rafCb = null; } };
}

const SCRIPTS = ["js/portal.js", "js/pwa.js", "js/analytics.js", "js/i18n.js", "js/audio.js",
  "js/bgm.js", "js/bg.js", "js/juice.js", "js/cinema.js", "js/campaign.js", "js/monsters.js",
  "js/bosses.js", "js/stagefx.js", "js/tutorial.js", "js/meta.js", "js/juice2.js", "js/sfx2.js",
  "js/upgrades2.js", "js/v2glue.js", "js/game.js", "js/mobile.js"];

function bootGame() {
  const b = buildSandbox();
  for (const f of SCRIPTS) vm.runInContext(read(f), b.sandbox, { filename: f });
  return b;
}

/* Lái 1 frame game tại thời điểm t (ms), trả về displacement moveBy ghi được. */
function driveFrame(b, t) {
  b.simNow.value = t;
  const cb = b.getRaf(); b.clearRaf();
  assert.ok(cb, "rAF callback mất — vòng lặp game đã chết");
  b.moves.length = 0;
  cb(t);
  return b.moves;
}
/* Từ displacement moveBy + dt frame suy ra velocity px/s (moveBy chạy trước damping). */
function velocityFrom(moves, dt) {
  if (!moves.length) return 0;
  const [dx, dy] = moves[moves.length - 1];
  return Math.hypot(dx, dy) / dt;
}
function setWjump(b, mode) {
  b.sandbox.localStorage.setItem("wk_settings", JSON.stringify({ wjump: mode }));
}
/* push 1 cú 300px rồi đo velocity sau đúng 1 frame (dt=0.05s) */
function pushAndMeasure(b, t, mag) {
  vm.runInContext(`window.pushWindow(${mag}, 0)`, b.sandbox);
  const moves = driveFrame(b, t);
  return velocityFrom(moves, 0.05);
}

const EXPECT = {
  calm: { impulse: 15, velocity: 150, cooldown: 300 },
  normal: { impulse: 35, velocity: 400, cooldown: 150 },
  wild: { impulse: 300, velocity: 950, cooldown: 0 },
};
/* object trả về từ vm context khác realm → normalize qua JSON trước khi deepEqual */
const plain = (x) => JSON.parse(JSON.stringify(x));

describe("window-jump (Item 4 Sprint Round 2)", () => {
  it("default là normal khi chưa có setting (CEO chốt default = Vừa)", () => {
    const b = bootGame();
    const p = plain(vm.runInContext("window.wjumpPreset()", b.sandbox));
    assert.deepEqual(p, EXPECT.normal);
  });

  it("giá trị rác → fallback normal (repair)", () => {
    const b = bootGame();
    setWjump(b, "zzz");
    b.simNow.value = 1000; // qua cache 500ms
    const p = plain(vm.runInContext("window.wjumpPreset()", b.sandbox));
    assert.deepEqual(p, EXPECT.normal);
  });

  for (const mode of ["calm", "normal", "wild"]) {
    it(`${mode}: impulse mỗi event bị clamp ở ${EXPECT[mode].impulse}px`, () => {
      const b = bootGame();
      setWjump(b, mode);
      b.simNow.value = 1000;
      const v = pushAndMeasure(b, 1100, 300);
      const e = EXPECT[mode].impulse;
      assert.ok(Math.abs(v - e) <= e * 0.25 + 1,
        `${mode}: 1 cú push 300px → velocity ${v.toFixed(1)}, kỳ vọng ≈${e}`);
    });

    it(`${mode}: velocity không vượt ${EXPECT[mode].velocity}px/s dù kick dồn`, () => {
      const b = bootGame();
      setWjump(b, mode);
      const cd = EXPECT[mode].cooldown;
      // kick mạnh liên tiếp, mỗi cú cách nhau > cooldown để chắc chắn áp dụng
      let t = 1000;
      const n = mode === "wild" ? 6 : 12;
      for (let i = 0; i < n; i++) {
        vm.runInContext("window.pushWindow(500, 0)", b.sandbox);
        t += cd + 50;
        b.simNow.value = t; // cache preset + cooldown đều qua
      }
      const v = velocityFrom(driveFrame(b, t + 100), 0.05);
      const cap = EXPECT[mode].velocity;
      assert.ok(v <= cap * 1.05 + 1,
        `${mode}: velocity sau ${n} cú kick = ${v.toFixed(1)}, phải ≤ ${cap}`);
      assert.ok(v > 0, `${mode}: kick phải tạo chuyển động, nhận v=${v}`);
    });
  }

  it("cooldown bỏ qua kick dồn dập (calm 300ms)", () => {
    const b = bootGame();
    setWjump(b, "calm");
    b.simNow.value = 1000;
    vm.runInContext("window.pushWindow(300, 0)", b.sandbox); // v = 15
    b.simNow.value = 1100; // +100ms < 300ms cooldown
    vm.runInContext("window.pushWindow(300, 0)", b.sandbox); // bị bỏ qua
    const v = velocityFrom(driveFrame(b, 1200), 0.05);
    assert.ok(Math.abs(v - 15) <= 5,
      `kick thứ 2 trong cooldown phải bị bỏ qua: v=${v.toFixed(1)}, kỳ vọng ≈15 (không phải 30)`);
  });

  it("hết cooldown → kick lại được áp dụng", () => {
    const b = bootGame();
    setWjump(b, "calm");
    b.simNow.value = 1000;
    vm.runInContext("window.pushWindow(300, 0)", b.sandbox); // v = 15, lastPush=1000
    b.simNow.value = 1400; // +400ms > 300ms cooldown
    vm.runInContext("window.pushWindow(300, 0)", b.sandbox); // được áp dụng → v = 30
    const v = velocityFrom(driveFrame(b, 1500), 0.05);
    assert.ok(Math.abs(v - 30) <= 8,
      `hết cooldown kick phải cộng dồn: v=${v.toFixed(1)}, kỳ vọng ≈30`);
  });

  it("wild không cooldown: kick liên tiếp cộng dồn như bản cũ", () => {
    const b = bootGame();
    setWjump(b, "wild");
    b.simNow.value = 1000;
    vm.runInContext("window.pushWindow(300, 0)", b.sandbox);
    vm.runInContext("window.pushWindow(300, 0)", b.sandbox); // ngay lập tức, không bị bỏ qua
    const v = velocityFrom(driveFrame(b, 1100), 0.05);
    assert.ok(Math.abs(v - 600) <= 150,
      `wild: 2 cú kick liên tiếp → v=${v.toFixed(1)}, kỳ vọng ≈600`);
  });

  it("phối hợp Item 3: đọc presets từ window.WK_TUNING khi có", () => {
    const b = bootGame();
    b.sandbox.WK_TUNING = { tuning: { window_physics: {
      calm: { impulse: 1, velocity: 10, cooldown: 999 },
      normal: { impulse: 2, velocity: 20, cooldown: 998 },
      wild: { impulse: 3, velocity: 30, cooldown: 0 },
    } } };
    setWjump(b, "calm");
    const p = plain(vm.runInContext("window.wjumpPreset()", b.sandbox));
    assert.deepEqual(p, { impulse: 1, velocity: 10, cooldown: 999 },
      "khi Item 3 migrate xong, preset phải lấy từ WK_TUNING");
  });
});

describe("window-jump UI & i18n (tĩnh)", () => {
  it("js/i18n.js có đủ 4 key VI/EN, không emoji", () => {
    const src = read("js/i18n.js");
    for (const k of ["settings.wjump", "settings.wjump_calm", "settings.wjump_normal", "settings.wjump_wild"]) {
      const hits = src.match(new RegExp('"' + k + '"', "g")) || [];
      assert.ok(hits.length >= 2, `thiếu key ${k} ở 1 trong 2 dict`);
    }
    for (const line of src.split("\n")) {
      if (/settings\.wjump/.test(line)) {
        assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(line),
          "i18n wjump không được chứa emoji: " + line.trim());
      }
    }
  });

  it("index.html launcher: 3 nút data-wjump trong settings", () => {
    const html = read("index.html");
    for (const m of ["calm", "normal", "wild"]) {
      assert.ok(html.includes(`data-wjump="${m}"`), `index.html thiếu nút data-wjump="${m}"`);
      assert.ok(html.includes(`data-i18n="settings.wjump_${m}"`), `thiếu data-i18n settings.wjump_${m}`);
    }
    assert.ok(html.includes('data-i18n="settings.wjump"'), "thiếu label data-i18n settings.wjump");
  });

  it("game.html pause menu: 3 nút data-wjump đổi được giữa run", () => {
    const html = read("game.html");
    const pause = html.slice(html.indexOf('id="ov-pause"'));
    for (const m of ["calm", "normal", "wild"]) {
      assert.ok(pause.includes(`data-wjump="${m}"`), `ov-pause thiếu nút data-wjump="${m}"`);
    }
  });

  it("js/menu.js: default wjump normal + wiring data-wjump", () => {
    const src = read("js/menu.js");
    assert.ok(src.includes('wjump: "normal"'), "menu.js thiếu default wjump normal trong wk_settings");
    assert.ok(src.includes("[data-wjump]"), "menu.js thiếu wiring [data-wjump]");
    assert.ok(/!\["calm", "normal", "wild"\]\.includes\(settings\.wjump\)/.test(src),
      "menu.js thiếu repair corrupted wjump");
  });

  it("js/game.js: pushWindow clamp impulse + cooldown, applyWindowMotion clamp velocity", () => {
    const src = read("js/game.js");
    const push = src.slice(src.indexOf("function pushWindow"));
    assert.ok(/P\.cooldown > 0/.test(push), "pushWindow thiếu check cooldown");
    assert.ok(/P\.impulse/.test(push), "pushWindow thiếu clamp impulse");
    const motion = src.slice(src.indexOf("function applyWindowMotion"));
    assert.ok(/P\.velocity/.test(motion), "applyWindowMotion thiếu clamp velocity");
  });
});
