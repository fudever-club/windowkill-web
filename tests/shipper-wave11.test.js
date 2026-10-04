/* WINDOWKILL — Shipper debut ở wave 11 (quyết định CEO 2026-10-04).
 *
 * Bối cảnh: Shipper Gem ("shipper", behavior "courier") có minWave: 10 trong
 * MONSTER_REGISTRY, nhưng startWave() có `if (n % 5 === 0) { spawnBoss(); return; }`
 * nên buildSpawnQueue không bao giờ chạy ở wave 10 (boss-only) → Shipper
 * không có màn debut như thiết kế Variety Pack 1.
 * Quyết định CEO: đổi spec thành wave 11+ (không spawn cùng boss wave 10).
 *
 * Test này verify:
 *  (a) MONSTER_REGISTRY["shipper"].minWave === 11 (và balance giữ nguyên:
 *      behavior courier, dmg 0, weight 25, r 14, score/xp không đổi);
 *  (b) logic debut wave 11: trích HÀM THẬT vp1SpawnShipper() từ js/game.js,
 *      chạy với mock (bounds/G/spawnEnemyAt/setBanner/I18N) → spawn đúng
 *      1 shipper, vị trí cách tàu > 300px, banner debut chỉ hiện 1 lần;
 *  (c) startWave(10) vẫn boss-only: `spawnBoss(); return;` chặn trước mọi
 *      spawn thường, và trigger `if (n === 11) vp1SpawnShipper();` nằm SAU
 *      điểm return đó (wave 10 không thể lọt xuống).
 *
 * Chạy: node --test tests/shipper-wave11.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

/* ---------- boot game.js trong vm sandbox tối thiểu (để đọc MONSTER_REGISTRY thật) ---------- */
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
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    performance: { now: () => 0 },
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
  return sandbox;
}
const SCRIPTS = ["js/portal.js", "js/pwa.js", "js/analytics.js", "js/i18n.js", "js/audio.js",
  "js/bgm.js", "js/bg.js", "js/juice.js", "js/cinema.js", "js/tuning.js", "js/campaign.js", "js/monsters.js",
  "js/bosses.js", "js/stagefx.js", "js/tutorial.js", "js/meta.js", "js/juice2.js", "js/sfx2.js",
  "js/upgrades2.js", "js/v2glue.js", "js/game.js", "js/mobile.js"];
function bootGame() {
  const sb = buildSandbox();
  for (const f of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  }
  return sb;
}

/* ---------- trích hàm thật từ source bằng cân bằng ngoặc ---------- */
function extractFunction(src, name) {
  const headRe = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = headRe.exec(src);
  assert.ok(m, `không tìm thấy function ${name} trong js/game.js`);
  let depth = 0, i = m.index + m[0].length - 1; // đứng ở "{"
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `ngoặc mất cân bằng trong function ${name}`);
  return src.slice(m.index, i + 1);
}

/* ---------- chạy vp1SpawnShipper() THẬT với mock ---------- */
function runDebutShipper() {
  const spawnCalls = [];
  const bannerCalls = [];
  const G = { ship: { x: 490, y: 350 }, vp1_shipperDebutShown: false };
  const ctx = {
    Math, console,
    MONSTER_REGISTRY: { shipper: { id: "shipper" } },
    bounds: () => ({ x: 0, y: 0, w: 980, h: 700 }),
    G,
    rand: (a, b) => a + Math.random() * (b - a),
    hypot: Math.hypot,
    spawnEnemyAt: (type, x, y) => { spawnCalls.push([type, x, y]); },
    I18N: { t: k => k },
    setBanner: (t, s) => { bannerCalls.push([t, s]); },
  };
  vm.createContext(ctx);
  const fnSrc = extractFunction(gameSrc, "vp1SpawnShipper");
  vm.runInContext(fnSrc + "\nvp1SpawnShipper();", ctx, { filename: "vp1SpawnShipper" });
  return { spawnCalls, bannerCalls, G };
}

/* ---------- lấy body của startWave để check thứ tự logic ---------- */
function startWaveBody() {
  return extractFunction(gameSrc, "startWave");
}

describe("Shipper wave 11+ (CEO 2026-10-04)", () => {
  it("(a) registry: shipper minWave = 11, balance không đổi", () => {
    // MONSTER_REGISTRY nằm trong IIFE nên check trên source thật (như tests/variety-pack-1)
    const m = gameSrc.match(/"shipper":\s*\{\s*id:\s*"shipper"[\s\S]*?desc:\s*I18N\.t\("monster\.shipper\.desc"\)\s*\}/);
    assert.ok(m, "không tìm thấy entry shipper trong MONSTER_REGISTRY");
    const entry = m[0];
    assert.match(entry, /minWave:\s*11\b/, "minWave phải là 11 (CEO đổi spec từ 10)");
    assert.doesNotMatch(entry, /minWave:\s*10\b/);
    assert.match(entry, /behavior:\s*"courier"/);
    assert.match(entry, /dmg:\s*0\b/);
    assert.match(entry, /weight:\s*25\b/);
    assert.match(entry, /r:\s*14\b/);
    assert.match(entry, /score:\s*40\b/);
    assert.match(entry, /xp:\s*2\b/);
    assert.match(entry, /hp:\s*w\s*=>\s*8\s*\+\s*w\s*\*\s*0\.9/);
  });

  it("(b) vp1SpawnShipper: spawn đúng 1 shipper, cách tàu > 300px", () => {
    const { spawnCalls, G } = runDebutShipper();
    const shipperSpawns = spawnCalls.filter(c => c[0] === "shipper");
    assert.equal(shipperSpawns.length, 1, "phải spawn đúng 1 shipper");
    const [, sx, sy] = shipperSpawns[0];
    const d = Math.hypot(sx - G.ship.x, sy - G.ship.y);
    assert.ok(d > 300, `shipper spawn cách tàu ${d.toFixed(0)}px, yêu cầu > 300px`);
  });

  it("(b2) banner debut chỉ hiện 1 lần (flag once)", () => {
    const first = runDebutShipper();
    assert.equal(first.bannerCalls.length, 1, "lần đầu phải hiện banner debut");
    assert.ok(first.bannerCalls[0][0].includes("monster.shipper.name"),
      "banner dùng tên shipper (I18N key monster.shipper.name)");
    assert.equal(first.G.vp1_shipperDebutShown, true);
    // chạy lại với flag đã bật → không banner nữa
    const G2 = { ship: { x: 490, y: 350 }, vp1_shipperDebutShown: true };
    const bannerCalls = [];
    const ctx = {
      Math, console,
      MONSTER_REGISTRY: { shipper: { id: "shipper" } },
      bounds: () => ({ x: 0, y: 0, w: 980, h: 700 }),
      G: G2,
      rand: (a, b) => a + Math.random() * (b - a),
      hypot: Math.hypot,
      spawnEnemyAt: () => {},
      I18N: { t: k => k },
      setBanner: (t, s) => { bannerCalls.push([t, s]); },
    };
    vm.createContext(ctx);
    vm.runInContext(extractFunction(gameSrc, "vp1SpawnShipper") + "\nvp1SpawnShipper();", ctx);
    assert.equal(bannerCalls.length, 0, "lần thứ 2 không được hiện lại banner debut");
  });

  it("(c) wave 10 boss-only: spawnBoss(); return; chặn trước trigger wave-11", () => {
    const body = startWaveBody();
    // (c1) wave 10 (n % 5 === 0) gọi spawnBoss rồi return ngay
    assert.match(body, /if\s*\(\s*n\s*%\s*5\s*===\s*0\s*\)\s*\{\s*spawnBoss\(\)\s*;\s*return\s*;/,
      "startWave phải có boss-early-return cho wave % 5 === 0");
    // (c2) trigger debut shipper là n === 11 và nằm SAU điểm return của boss
    const trig = "if (n === 11) vp1SpawnShipper();";
    const iTrig = body.indexOf(trig);
    assert.ok(iTrig > 0, "startWave phải có trigger: " + trig);
    const iBoss = body.indexOf("spawnBoss(); return;");
    assert.ok(iTrig > iBoss, "trigger wave-11 phải nằm SAU boss return → wave 10 không thể lọt xuống");
    // (c3) không có trigger nào khác gọi vp1SpawnShipper cho wave 10
    const allTrig = [...body.matchAll(/vp1SpawnShipper\(\)/g)];
    assert.equal(allTrig.length, 1, "chỉ đúng 1 chỗ gọi vp1SpawnShipper trong startWave");
  });

  it("(c2) KHÔNG trigger shipper nào cho wave 10 qua buildSpawnQueue", () => {
    // buildSpawnQueue lọc theo minWave — shipper minWave 11 nên wave 10 loại ra
    const poolLine = gameSrc.match(/const pool = Object\.values\(MONSTER_REGISTRY\)\.filter\(d => [^;]+\);/);
    assert.ok(poolLine, "không tìm thấy dòng lọc pool trong buildSpawnQueue");
    assert.match(poolLine[0], /d\.minWave\s*<=\s*n/, "pool lọc theo minWave <= n");
  });
});
