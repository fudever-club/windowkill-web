/* WINDOWKILL — regression test cho bug "WASD khựng" (CEO báo 2026-10-04).
 *
 * Root cause: Juice2.hitstop() set G.hitstop mà KHÔNG có cooldown — mỗi kill
 * (tier pop 15ms) đều freeze dt=0 một frame. Juice.hitStop có cooldown 350ms
 * (tuning 2026-10-02) nhưng V2.hitstop đọc G.hitstop (nguồn chân lý cho loop)
 * nên bypass hoàn toàn → giết 3-6 con/giây = khựng liên tục khi giữ WASD.
 *
 * Fix: cooldown 350ms trong Juice2.hitstop() (đồng bộ với Juice.hitStop),
 * exempt cho tier cinematic (boss).
 *
 * Chạy: node --test tests/hitstop-cooldown.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

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

let simNow = 0;

function buildSandbox() {
  const G = { hitstop: 0, parts: [], score: 0, flash: 0 };
  const mkEl = () => ({
    style: {}, dataset: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    addEventListener: () => {}, removeEventListener: () => {},
    appendChild: () => {}, remove: () => {}, getContext: () => chainable(),
    width: 980, height: 700, textContent: "", innerHTML: "",
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 980, height: 700 }),
  });
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date,
    RegExp, Error, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite,
    performance: { now: () => simNow },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false }),
    G,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    createElement: mkEl, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, body: mkEl(), documentElement: mkEl(),
  };
  sandbox.navigator = { maxTouchPoints: 0, vibrate: () => false };
  vm.createContext(sandbox);
  for (const f of ["js/juice.js", "js/juice2.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  }
  return sandbox;
}

/* Đếm số frame bị dt=0 khi giết `kills` con normal, mỗi con cách nhau `gapMs`. */
function countFrozenFrames(sandbox, kills, gapMs) {
  const { Juice, Juice2, G } = sandbox;
  simNow = 0;
  G.hitstop = 0; G.parts = [];
  // reset cooldown nội bộ bằng cách tua simNow xa (module dùng performance.now)
  simNow = 1e6;
  try { Juice.reset && Juice.reset(); } catch (e) {}
  const rawDt = 1 / 60;
  let frozen = 0;
  let t = 1e6;
  for (let k = 0; k < kills; k++) {
    t += gapMs;
    simNow = t;
    Juice2.onKill(100, 100, "normal");
    // chạy đủ frame để hitstop decay hết (15ms < 1 frame 16.67ms → 1 frame)
    for (let f = 0; f < 3; f++) {
      simNow += 1000 / 60;
      let dt = rawDt;
      try { dt = Juice.update(rawDt); } catch (e) { dt = rawDt; }
      try { if (Juice2.updateHitstop(rawDt) === 0) dt = 0; } catch (e) {}
      if (dt === 0) frozen++;
    }
  }
  return frozen;
}

describe("hit-stop cooldown (WASD khựng)", () => {
  it("giết dồn dập (100ms/kill) chỉ freeze 1 lần / 350ms — không khựng liên tục", () => {
    const sb = buildSandbox();
    const frozen = countFrozenFrames(sb, 10, 100); // 10 kill trong 1 giây
    // trước fix: 10/10 kill đều freeze (10 frame). sau fix: ≤3 (cooldown 350ms)
    assert.ok(frozen <= 3, `giết 10 con trong 1s freeze ${frozen} frame, mong ≤3`);
    assert.ok(frozen >= 1, "phải có ít nhất 1 lần hit-stop (giữ cảm giác đã tay)");
  });

  it("giết cách nhau >350ms thì mỗi kill đều có hit-stop", () => {
    const sb = buildSandbox();
    const frozen = countFrozenFrames(sb, 3, 400);
    assert.equal(frozen, 3, `3 kill cách 400ms phải freeze 3 frame, thực tế ${frozen}`);
  });

  it("boss (cinematic) được miễn cooldown — luôn có punch", () => {
    const sb = buildSandbox();
    const { Juice2, G } = sb;
    simNow = 1e6;
    G.hitstop = 0; G.parts = [];
    Juice2.onKill(100, 100, "normal"); // kill thường → chiếm cooldown
    assert.ok(G.hitstop > 0, "kill thường phải set hitstop");
    G.hitstop = 0;
    simNow += 100; // mới 100ms sau — trong cooldown
    Juice2.onKill(100, 100, "boss"); // boss kill
    assert.ok(G.hitstop >= 0.09, `boss phải được hitstop cinematic 90ms, thực tế ${G.hitstop}`);
  });

  it("giữ WASD khi combat: quãng đường đi không mất quá 2%", () => {
    const sb = buildSandbox();
    const { Juice, Juice2, G } = sb;
    simNow = 1e6;
    G.hitstop = 0; G.parts = [];
    const rawDt = 1 / 60, SPEED = 300, SEC = 10;
    let x = 0, t = 1e6, nextKill = t + 200;
    for (let f = 0; f < SEC * 60; f++) {
      t += 1000 / 60; simNow = t;
      if (t >= nextKill) { // 5 kill/s — combat đông
        try { Juice2.onKill(100, 100, "normal"); } catch (e) {}
        nextKill += 200;
      }
      let dt = rawDt;
      try { dt = Juice.update(rawDt); } catch (e) { dt = rawDt; }
      try { if (Juice2.updateHitstop(rawDt) === 0) dt = 0; } catch (e) {}
      x += SPEED * dt; // giữ WASD
    }
    const lost = 1 - x / (SPEED * SEC);
    assert.ok(lost < 0.02, `mất ${(lost * 100).toFixed(1)}% quãng đường, mong <2% (trước fix ~5-10%)`);
  });
});
