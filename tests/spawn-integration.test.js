/* WINDOWKILL — regression test cho incident màn hình đen production 2026-10-03.
 *
 * Root cause: PR #35 commit 4d2b756 (fix C2b, thao tác qua GitHub web UI) vô tình
 * xóa dấu `}` đóng `onboardSpdMul()`, khiến `function mkEnemy` bị lồng vào trong
 * `onboardSpdMul` → `mkEnemy` không còn visible ở scope IIFE → `spawnEnemyAt`
 * gọi `mkEnemy` ném `ReferenceError: mkEnemy is not defined` ở lần spawn đầu tiên.
 * Vì `update(dt)`/`loop()` không bọc try/catch quanh spawn, exception giết chết
 * vòng lặp game vĩnh viễn (requestAnimationFrame không bao giờ được đặt lại):
 * canvas đóng băng ~1.4s sau khi load, không quái nào spawn — production đen.
 * Cùng commit cũng làm rơi `hp:` khỏi object literal (quái sẽ có hp undefined).
 *
 * Vì `node --check` và test tĩnh không bắt được lỗi scope này, test này load
 * toàn bộ script game thật trong vm sandbox (mô phỏng browser tối thiểu),
 * rồi spawn quái thật + bơm frames để chứng minh vòng lặp sống sót.
 *
 * Chạy: node --test tests/spawn-integration.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

/* ---------- minimal browser sandbox ---------- */
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
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame: noop,
    performance: { now: () => simNow.value },
    URLSearchParams, URL, Blob,
    navigator: { userAgent: "node-test", sendBeacon: noop },
    location: { search: "?diff=chill&music=1&sfx=1&shake=1&fx=full&sat=auto&tut=0", href: "http://x/game.html" },
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
  return { sandbox, simNow, getRaf: () => rafCb, clearRaf: () => { rafCb = null; } };
}

const SCRIPTS = ["js/portal.js", "js/pwa.js", "js/analytics.js", "js/i18n.js", "js/audio.js",
  "js/bgm.js", "js/bg.js", "js/juice.js", "js/cinema.js", "js/tuning.js", "js/campaign.js", "js/monsters.js",
  "js/bosses.js", "js/stagefx.js", "js/tutorial.js", "js/meta.js", "js/juice2.js", "js/sfx2.js",
  "js/upgrades2.js", "js/v2glue.js", "js/game.js", "js/mobile.js"];

function bootGame() {
  const { sandbox, simNow, getRaf, clearRaf } = buildSandbox();
  for (const f of SCRIPTS) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    vm.runInContext(src, sandbox, { filename: f });
  }
  return { sandbox, simNow, getRaf, clearRaf };
}

describe("spawn integration (incident 2026-10-03)", () => {
  it("spawnEnemyAt callable từ scope game và trả entity hợp lệ (không ReferenceError mkEnemy)", () => {
    const { sandbox } = bootGame();
    assert.equal(vm.runInContext("typeof window.spawnEnemyAt", sandbox), "function");
    const res = vm.runInContext(
      `(function(){ try { const e = window.spawnEnemyAt("chaser", 100, 100);
        return e ? { ok: true, type: e.type, x: e.x, y: e.y, hp: e.hp, r: e.r, maxHp: e.maxHp }
                 : { ok: false, why: "null" };
      } catch (err) { return { ok: false, why: err.constructor.name + ": " + err.message }; } })()`,
      sandbox);
    assert.ok(res.ok, "spawnEnemyAt ném lỗi hoặc trả null: " + JSON.stringify(res));
    assert.equal(res.type, "chaser");
    assert.ok(Number.isFinite(res.hp) && res.hp > 0, "hp quái phải là số dương, nhận: " + res.hp);
    assert.ok(Number.isFinite(res.maxHp) && res.maxHp === res.hp, "maxHp phải bằng hp");
    assert.ok(Number.isFinite(res.r) && res.r > 0, "r quái phải dương");
  });

  it("vòng lặp sống sót 600 frames (~10s) dù spawner chạy — không chết vì ReferenceError", () => {
    const { sandbox, simNow, getRaf, clearRaf } = bootGame();
    let thrown = null;
    let frames = 0;
    for (let i = 0; i < 600; i++) {
      simNow.value = i * 16.7;
      const cb = getRaf(); clearRaf();
      if (!cb) { thrown = new Error("rAF không được đặt lại ở frame " + i + " (vòng lặp đã chết)"); break; }
      try { cb(simNow.value); } catch (e) { thrown = e; break; }
      frames++;
    }
    assert.ok(!thrown, "vòng lặp chết: " + (thrown && thrown.message));
    assert.equal(frames, 600, "chỉ chạy được " + frames + "/600 frames");
    const st = vm.runInContext("({ phase: G.phase, wave: G.wave })", sandbox);
    assert.equal(st.phase, "play", "phase phải là play, nhận: " + st.phase);
  });

  it("mkEnemy không bị lồng nhầm scope (parse tĩnh: khai báo ở top-level IIFE)", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
    // mkEnemy phải là function declaration ở top-level của IIFE, KHÔNG nằm trong
    // function khác: kiểm tra block onboardSpdMul đóng đúng trước `function mkEnemy`.
    const i = src.indexOf("function mkEnemy(type, x, y)");
    assert.ok(i > 0, "không tìm thấy function mkEnemy");
    const before = src.slice(Math.max(0, i - 400), i);
    assert.match(before, /\}\s*$/,
      "ngay trước `function mkEnemy` phải là `}` đóng function trước đó (onboardSpdMul) — lỗi scope incident 2026-10-03");
    // Item 3 (Sprint R2): hp đi qua wkCapMult (band cap, null = giữ nguyên) nhưng
    // vẫn phải suy từ def.hp(G.wave) — regression cho incident mất `hp:` 2026-10-03.
    assert.match(src, /hp:\s*(wkCapMult\(G\.wave,\s*"hp",\s*)?def\.hp\(G\.wave\)/,
      "object literal của mkEnemy phải có `hp:` suy từ def.hp(G.wave)");
  });
});
