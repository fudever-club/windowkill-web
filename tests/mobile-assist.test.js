/* WINDOWKILL — Mobile Assist (RFC fix-round-final F2).
 *
 * Khôi phục multipliers từ campaign cũ (git 0360dfc^:js/campaign.js:267):
 *   MOBILE_ASSIST = { speedMult: 0.85, spawnCountMult: 0.8, chewDpsMult: 0.8 }
 * Active khi device coarse (class wk-coarse HOẶC pointer:coarse — cùng logic với
 * coarseNow() trong js/mobile.js) && toggle "Hỗ trợ mobile" bật (mặc định BẬT).
 * Desktop không đổi hành vi.
 *
 * 3 điểm áp (không mutate DIFF gốc):
 *   1. mkEnemy (js/game/11-spawn.js): speed ×0.85
 *   2. buildSpawnQueue (js/game/11-spawn.js): count ×0.8
 *   3. chew (js/game/10-gamedata.js): threshold ×1.25 (=1/0.8, gặm chậm hơn
 *      tương đương chew DPS ×0.8)
 * KHÔNG áp vào wkSpawnInterval (DIFF.spawnMul là interval, bị band formula
 * bypass wave 15-30).
 *
 * Chạy: node --test tests/mobile-assist.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const bundle = read("js/game.js");

/* ---- minimal browser sandbox (pattern tests/spawn-integration.test.js) ---- */
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
function bootGame() {
  const noop = () => {};
  let rafCb = null;
  const simNow = { value: 0 };
  const sb = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    cancelAnimationFrame: noop,
    performance: { now: () => simNow.value },
    URLSearchParams, URL, Blob,
    navigator: { userAgent: "node-test", sendBeacon: noop },
    location: { search: "?diff=normal&music=0&sfx=0&shake=0&fx=full&sat=auto&tut=0", href: "http://x/game.html" },
    localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    sessionStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    innerWidth: 980, innerHeight: 700, outerWidth: 980, outerHeight: 700,
    screenX: 0, screenY: 0, devicePixelRatio: 1, screen: { availWidth: 1920, availHeight: 1080 },
    addEventListener: noop, removeEventListener: noop,
  };
  sb.window = sb; sb.globalThis = sb;
  sb.document = {
    getElementById: () => mkEl(), querySelector: () => mkEl(), querySelectorAll: () => [],
    createElement: () => mkEl(), addEventListener: noop, removeEventListener: noop,
    hidden: false, readyState: "complete", documentElement: mkEl(), body: mkEl(), title: "",
  };
  vm.createContext(sb);
  /* Nạp module nguồn riêng lẻ (như qaBoot): mỗi fragment chạy top-level trong
   * vm context → mkEnemy/buildSpawnQueue/mobileAssistActive/MOBILE_ASSIST
   * thành global, gọi trực tiếp được (bundle js/game.js bọc 1 IIFE nên không). */
  const pre = ["js/portal.js", "js/pwa.js", "js/analytics.js", "js/i18n.js", "js/audio.js",
    "js/bgm.js", "js/bg.js", "js/juice.js", "js/cinema.js", "js/tuning.js", "js/monsters.js",
    "js/bosses.js", "js/tutorial.js", "js/meta.js", "js/juice2.js", "js/sfx2.js",
    "js/upgrades2.js", "js/v2glue.js"];
  const mods = read("js/game/MANIFEST.txt").split("\n").map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#")).map((f) => "js/game/" + f);
  for (const f of pre.concat(mods, ["js/mobile.js"]))
    vm.runInContext(read(f), sb, { filename: f });
  return { sb, simNow };
}
const run = (sb, code) => vm.runInContext(code, sb);

/* ---- static: tách block function bằng đếm ngoặc ---- */
function extractFunction(src, name) {
  const headRe = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = headRe.exec(src);
  assert.ok(m, `không tìm thấy function ${name} trong bundle`);
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `ngoặc mất cân bằng trong function ${name}`);
  return src.slice(m.index, i + 1);
}

describe("F2 — mobileAssistActive(): ma trận coarse/desktop × ON/OFF", () => {
  it("hằng số đúng campaign cũ: {0.85, 0.8, 0.8}", () => {
    const { sb } = bootGame();
    const c = run(sb, "MOBILE_ASSIST");
    assert.deepEqual({ ...c }, { speedMult: 0.85, spawnCountMult: 0.8, chewDpsMult: 0.8 });
  });
  it("desktop (không coarse, toggle mặc định BẬT) → false", () => {
    const { sb } = bootGame();
    assert.equal(run(sb, "mobileAssistActive()"), false);
  });
  it("coarse qua class wk-coarse + toggle BẬT → true", () => {
    const { sb } = bootGame();
    run(sb, "document.body.classList.contains = function(c){ return c === 'wk-coarse'; };");
    assert.equal(run(sb, "mobileAssistActive()"), true);
  });
  it("coarse qua pointer:coarse + toggle BẬT → true", () => {
    const { sb } = bootGame();
    run(sb, "window.matchMedia = function(){ return { matches: true }; };");
    assert.equal(run(sb, "mobileAssistActive()"), true);
  });
  it("coarse nhưng toggle TẮT → false (toggle thắng device check)", () => {
    const { sb } = bootGame();
    run(sb, "document.body.classList.contains = function(c){ return c === 'wk-coarse'; };");
    run(sb, "localStorage.setItem('wk_settings', JSON.stringify({ mobileAssist: false }));");
    assert.equal(run(sb, "mobileAssistActive()"), false);
  });
  it("desktop + toggle TẮT → false", () => {
    const { sb } = bootGame();
    run(sb, "localStorage.setItem('wk_settings', JSON.stringify({ mobileAssist: false }));");
    assert.equal(run(sb, "mobileAssistActive()"), false);
  });
});

describe("F2 — 3 điểm áp multiplier (tĩnh + chức năng)", () => {
  it("mkEnemy: speed × (active ? MOBILE_ASSIST.speedMult : 1)", () => {
    const mk = extractFunction(bundle, "mkEnemy");
    assert.ok(/mobileAssistActive\(\)\s*\?\s*MOBILE_ASSIST\.speedMult\s*:\s*1/.test(mk),
      "mkEnemy phải nhân speed với mobileAssistActive() ? MOBILE_ASSIST.speedMult : 1");
  });
  it("buildSpawnQueue: count × (active ? spawnCountMult : 1)", () => {
    const bq = extractFunction(bundle, "buildSpawnQueue");
    assert.ok(/mobileAssistActive\(\)\s*\?\s*MOBILE_ASSIST\.spawnCountMult\s*:\s*1/.test(bq),
      "buildSpawnQueue phải nhân count với mobileAssistActive() ? MOBILE_ASSIST.spawnCountMult : 1");
  });
  it("chew: threshold DIFF.chew ×1.25 khi assist active", () => {
    const src = read("js/game/10-gamedata.js");
    assert.ok(/DIFF\.chew\s*\*\s*\(mobileAssistActive\(\)\s*\?\s*1\.25\s*:\s*1\)/.test(src),
      "chew phải dùng threshold DIFF.chew * (mobileAssistActive() ? 1.25 : 1)");
  });
  it("KHÔNG áp vào wkSpawnInterval", () => {
    const iv = extractFunction(bundle, "wkSpawnInterval");
    assert.ok(!iv.includes("mobileAssist"), "wkSpawnInterval không được chứa mobileAssist");
  });
  it("chức năng: coarse → mkEnemy speed ×0.85 (desktop giữ nguyên)", () => {
    const { sb } = bootGame();
    const r = run(sb, `(function(){
      document.body.classList.contains = function(){ return true; };
      var on = mkEnemy("chaser", 100, 100);
      document.body.classList.contains = function(){ return false; };
      var off = mkEnemy("chaser", 100, 100);
      return { on: on.speed, off: off.speed };
    })()`);
    assert.ok(r.off > 0, "speed desktop phải dương");
    assert.ok(Math.abs(r.on / r.off - 0.85) < 1e-9,
      `tỉ lệ speed phải = 0.85, nhận ${r.on / r.off}`);
  });
  it("chức năng: coarse → buildSpawnQueue count ×0.8", () => {
    const { sb } = bootGame();
    const r = run(sb, `(function(){
      // stub cfg để raw count là số nguyên (base 10, không per_wave) → không
      // phụ thuộc tuning, tránh double-rounding khi assert exact
      wkSpawnCfg = function(){ return { base_count: 10, per_wave: 0 }; };
      document.body.classList.contains = function(){ return true; };
      var q1 = buildSpawnQueue(10).length;
      document.body.classList.contains = function(){ return false; };
      var q2 = buildSpawnQueue(10).length;
      return { on: q1, off: q2 };
    })()`);
    assert.equal(r.off, 10, "count desktop phải = base_count, nhận " + r.off);
    assert.equal(r.on, 8, "count coarse phải = 10 × 0.8 = 8, nhận " + r.on);
  });
});
