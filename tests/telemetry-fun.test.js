/* WINDOWKILL — Telemetry "FUN" tối thiểu (js/game/20-telemetry.js) tests.
 *
 * 1. Unit (vm sandbox): load module độc lập với window.WKAnalytics stub —
 *    assert schema/normalize, forward mapping, consent gate, local-first
 *    persist, queue cap, fail-silent.
 * 2. Integration: load js/analytics.js THẬT + 20-telemetry.js cùng sandbox,
 *    log 3 event → flush → beacon body phải qua được server validator
 *    (server/src/validate.js) — tức payload tới /api/events là hợp lệ.
 * 3. Build wiring: MANIFEST.txt chứa 20-telemetry.js và js/game.js đã build
 *    chứa module.
 *
 * Chạy: node --test tests/telemetry-fun.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const MOD_SRC = fs.readFileSync(path.join(ROOT, "js/game/20-telemetry.js"), "utf8");

/* ---------- sandbox ---------- */
function makeSandbox({ enabled = true, onLine = true, withAnalytics = true } = {}) {
  const forwarded = [];
  const noop = () => {};
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    URLSearchParams, URL, Uint8Array,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    navigator: { userAgent: "node-test", onLine },
    localStorage: {
      _s: {},
      getItem(k) { return this._s[k] ?? null; },
      setItem(k, v) { this._s[k] = String(v); },
      removeItem(k) { delete this._s[k]; },
    },
    Blob: class { constructor(parts) { this._body = (parts || []).join(""); } },
    addEventListener: noop, removeEventListener: noop,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = { addEventListener: noop, removeEventListener: noop, hidden: false };
  if (withAnalytics) {
    sandbox.window.WKAnalytics = {
      isEnabled: () => enabled,
      track: (type, data) => { forwarded.push({ via: "track", type, data }); },
      trackUpgradeChosen: (id, opts) => { forwarded.push({ via: "trackUpgradeChosen", id, opts }); },
      trackDeathCause: (cause, opts) => { forwarded.push({ via: "trackDeathCause", cause, opts }); },
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(MOD_SRC, sandbox, { filename: "js/game/20-telemetry.js" });
  const T = sandbox.window.WKTelemetry;
  assert.ok(T && T.ready, "window.WKTelemetry phải khởi tạo trong sandbox");
  return { T, forwarded, sandbox };
}

const lsGet = (sb) => {
  const raw = sb.localStorage.getItem("wk_telemetry_v1");
  return raw ? JSON.parse(raw) : null;
};

describe("Telemetry.log — schema & forward mapping", () => {
  it("upgrade_chosen: forward qua trackUpgradeChosen, sanitize id, persist local", () => {
    const { T, forwarded, sandbox } = makeSandbox();
    assert.equal(T.log("upgrade_chosen", { upgrade_id: "u2:gai_phan", wave: 4, level: 3 }), true);
    assert.equal(forwarded.length, 0, "chưa flush thì chưa forward");
    const stored = lsGet(sandbox);
    assert.ok(Array.isArray(stored) && stored.length === 1, "phải persist localStorage ngay");
    assert.equal(stored[0].upgrade_id, "u2-gai_phan");
    assert.equal(stored[0].wave, 4);
    assert.equal(stored[0].level, 3);
    assert.ok(typeof stored[0].sid === "string" && stored[0].sid.length >= 8, "phải có sid ngẫu nhiên");
    assert.ok(Number.isInteger(stored[0].ts), "phải có ts");
    T.flush();
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].via, "trackUpgradeChosen");
    assert.equal(forwarded[0].id, "u2-gai_phan");
    assert.equal(forwarded[0].opts.wave, 4);
    assert.equal(forwarded[0].opts.level, 3);
    assert.deepEqual(lsGet(sandbox), [], "forward xong thì dọn localStorage");
  });

  it("upgrade_chosen: thiếu id → bỏ, không throw", () => {
    const { T, forwarded, sandbox } = makeSandbox();
    assert.equal(T.log("upgrade_chosen", { wave: 2 }), false);
    assert.equal(T.log("upgrade_chosen", {}), false);
    assert.equal(forwarded.length, 0);
    assert.equal(lsGet(sandbox), null);
  });

  it("death: map reason → cause (window/ship/lạ)", () => {
    const { T, forwarded } = makeSandbox();
    T.log("death", { reason: "window", wave: 7, score: 500, difficulty: "normal" });
    T.log("death", { reason: "ship", wave: 8, score: 600, difficulty: "hard" });
    T.log("death", { reason: "meteor", wave: 1 });
    T.flush();
    const deaths = forwarded.filter((f) => f.via === "trackDeathCause");
    assert.equal(deaths.length, 3);
    assert.equal(deaths[0].cause, "window"); // gặm viền
    assert.equal(deaths[0].opts.wave, 7);
    assert.equal(deaths[0].opts.difficulty, "normal");
    assert.equal(deaths[1].cause, "enemy");  // hết máu
    assert.equal(deaths[2].cause, "unknown");
  });

  it("wave_quit: phase 'over' bị bỏ (tránh double-count với death)", () => {
    const { T, forwarded, sandbox } = makeSandbox();
    assert.equal(T.log("wave_quit", { phase: "over", wave: 9, score: 100 }), false);
    T.flush();
    assert.equal(forwarded.length, 0);
    assert.equal(lsGet(sandbox), null);
  });

  it("wave_quit: phase live → forward dạng game_over (server chưa có type riêng)", () => {
    const { T, forwarded } = makeSandbox();
    assert.equal(
      T.log("wave_quit", { phase: "paused", wave: 3, score: 150, kills: 40, duration_s: 120, difficulty: "chill", level: 2 }),
      true);
    T.flush();
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].via, "track");
    assert.equal(forwarded[0].type, "game_over");
    assert.equal(forwarded[0].data.wave, 3);
    assert.equal(forwarded[0].data.score, 150);
    assert.equal(forwarded[0].data.difficulty, "chill");
    assert.equal(forwarded[0].data.duration_s, 120);
  });

  it("type lạ → bỏ qua, không throw", () => {
    const { T, forwarded } = makeSandbox();
    assert.equal(T.log("hax", { wave: 1 }), false);
    assert.equal(T.log(null), false);
    assert.equal(T.log(""), false);
    assert.equal(forwarded.length, 0);
  });
});

describe("Telemetry — consent & privacy", () => {
  it("tắt analytics (isEnabled=false) → không log, không persist", () => {
    const { T, forwarded, sandbox } = makeSandbox({ enabled: false });
    assert.equal(T.log("upgrade_chosen", { upgrade_id: "x", wave: 1 }), false);
    assert.equal(T.log("death", { reason: "ship", wave: 1 }), false);
    assert.equal(forwarded.length, 0);
    assert.equal(lsGet(sandbox), null, "tắt là không được ghi local");
  });

  it("không có WKAnalytics → fail-closed (không log lén), không throw", () => {
    const { T, sandbox } = makeSandbox({ withAnalytics: false });
    assert.equal(T.log("death", { reason: "ship", wave: 5 }), false);
    assert.equal(lsGet(sandbox), null);
    T.flush(); // không throw
  });

  it("không thu thập PII: event chỉ có gameplay + sid/ts/v", () => {
    const { T, sandbox } = makeSandbox();
    T.log("death", { reason: "ship", wave: 2, score: 10, difficulty: "normal" });
    const ev = lsGet(sandbox)[0];
    const keys = Object.keys(ev).sort();
    for (const bad of ["name", "email", "profile", "fingerprint", "device", "ip"]) {
      assert.ok(!keys.some((k) => k.toLowerCase().includes(bad)), "không có field PII: " + bad);
    }
    assert.ok(!/^[0-9a-f]{64}$/.test(ev.sid || ""), "sid là random, không phải sha256 profile");
  });
});

describe("Telemetry — local-first & fail-silent", () => {
  it("offline: giữ event trong localStorage, không forward; online lại thì forward", () => {
    const { T, forwarded, sandbox } = makeSandbox({ onLine: false });
    assert.equal(T.log("death", { reason: "ship", wave: 6, score: 300 }), true);
    T.flush();
    assert.equal(forwarded.length, 0, "offline không được forward");
    assert.equal(lsGet(sandbox).length, 1, "offline giữ lại local");
    sandbox.navigator.onLine = true;
    T.flush();
    assert.equal(forwarded.length, 1, "online lại thì forward");
    assert.deepEqual(lsGet(sandbox), []);
  });

  it("queue cap 200 event (memory + localStorage)", () => {
    const { T, sandbox } = makeSandbox();
    for (let i = 0; i < 250; i++) T.log("upgrade_chosen", { upgrade_id: "u" + i, wave: 1 });
    assert.ok(T._queue().length <= 200, "memory queue phải cap, thấy " + T._queue().length);
    assert.ok(lsGet(sandbox).length <= 200, "localStorage phải cap");
  });

  it("localStorage hỏng (quota/private) → vẫn chạy, không throw", () => {
    const { T, forwarded, sandbox } = makeSandbox();
    sandbox.localStorage.setItem = () => { throw new Error("quota"); };
    sandbox.localStorage.getItem = () => { throw new Error("denied"); };
    assert.equal(T.log("death", { reason: "ship", wave: 1 }), true);
    T.flush();
    assert.equal(forwarded.length, 1, "memory queue vẫn forward được");
  });

  it("input độc (circular, null proto) → không throw", () => {
    const { T } = makeSandbox();
    const circular = { upgrade_id: "x", wave: 1 };
    circular.self = circular;
    assert.doesNotThrow(() => T.log("upgrade_chosen", circular));
    assert.doesNotThrow(() => T.log("death", Object.create(null)));
    assert.doesNotThrow(() => T.log("death"));
    assert.doesNotThrow(() => T.flush());
  });

  it("rehydrate: event sót từ session trước được nhặt lại", () => {
    const first = makeSandbox();
    first.T.log("upgrade_chosen", { upgrade_id: "abc", wave: 2 });
    const raw = first.sandbox.localStorage.getItem("wk_telemetry_v1");
    assert.ok(raw && JSON.parse(raw).length === 1, "setup: event phải nằm trong localStorage");
    // boot sandbox mới với localStorage đã có dữ liệu cũ → module tự rehydrate.
    // (chạy lại source với `const Telemetry` → gán thẳng window để tránh redeclare)
    const { T, forwarded, sandbox } = makeSandbox();
    sandbox.localStorage._s["wk_telemetry_v1"] = raw;
    const src2 = MOD_SRC.replace("const Telemetry =", "window.WKTelemetry =");
    vm.runInContext(src2, sandbox, { filename: "js/game/20-telemetry.js" });
    const T2 = sandbox.window.WKTelemetry;
    assert.ok(T2._queue().length >= 1, "rehydrate phải nhặt event cũ");
    T2.flush();
    assert.ok(forwarded.length >= 1, "event cũ được forward khi online");
    void T;
  });
});

describe("Telemetry — integration qua pipeline thật + server validator", () => {
  function bootReal() {
    const captured = [];
    const noop = () => {};
    const sandbox = {
      console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
      TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
      parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
      URLSearchParams, URL, Uint8Array,
      setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
      navigator: { userAgent: "node-test", onLine: true },
      location: { search: "", href: "http://x/game.html" },
      localStorage: {
        _s: {},
        getItem(k) { return this._s[k] ?? null; },
        setItem(k, v) { this._s[k] = String(v); },
        removeItem(k) { delete this._s[k]; },
      },
      Blob: class { constructor(parts) { this._body = (parts || []).join(""); } },
      addEventListener: noop, removeEventListener: noop,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.document = { addEventListener: noop, removeEventListener: noop, hidden: false };
    sandbox.navigator.sendBeacon = (url, blob) => { captured.push({ url, body: blob._body }); return true; };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/analytics.js"), "utf8"), sandbox,
      { filename: "js/analytics.js" });
    vm.runInContext(MOD_SRC, sandbox, { filename: "js/game/20-telemetry.js" });
    assert.ok(sandbox.window.WKAnalytics && sandbox.window.WKAnalytics.ready, "WKAnalytics thật phải boot");
    assert.ok(sandbox.window.WKTelemetry && sandbox.window.WKTelemetry.ready, "WKTelemetry phải boot");
    return { sandbox, captured };
  }

  it("3 event đi hết pipeline thật → batch /api/events qua được server validator", async () => {
    const { sandbox, captured } = bootReal();
    const T = sandbox.window.WKTelemetry;
    const A = sandbox.window.WKAnalytics;
    T.log("upgrade_chosen", { upgrade_id: "Tăng tốc đạn!!", wave: 2, level: 2 });
    T.log("death", { reason: "window", wave: 7, score: 500, kills: 60, duration_s: 300, difficulty: "normal", level: 4 });
    T.log("wave_quit", { phase: "paused", wave: 3, score: 150, kills: 20, duration_s: 120, difficulty: "chill", level: 2 });
    T.flush(); // Telemetry → WKAnalytics
    A.flush(); // WKAnalytics → sendBeacon
    assert.ok(captured.length > 0, "phải có batch gửi đi");
    const body = JSON.parse(captured[captured.length - 1].body);
    assert.ok(body.events.length >= 3, "đủ 3 event, thấy " + body.events.length);
    const { validEventsBody } = await import("../server/src/validate.js");
    const v = validEventsBody(body);
    assert.ok(v, "batch phải hợp lệ với server: " + JSON.stringify(body).slice(0, 400));
    const types = v.events.map((e) => e.type).sort();
    assert.deepEqual(types, ["death_cause", "game_over", "upgrade_chosen"]);
    const upg = v.events.find((e) => e.type === "upgrade_chosen");
    assert.match(upg.payload.upgrade_id, /^[A-Za-z0-9_-]{1,64}$/);
    assert.equal(upg.wave, 2);
    const death = v.events.find((e) => e.type === "death_cause");
    assert.equal(death.payload.cause, "window");
    assert.equal(death.wave, 7);
    const quit = v.events.find((e) => e.type === "game_over");
    assert.equal(quit.wave, 3);
  });
});

describe("Telemetry — build wiring", () => {
  it("MANIFEST.txt chứa 20-telemetry.js và js/game.js đã build chứa module", () => {
    const manifest = fs.readFileSync(path.join(ROOT, "js/game/MANIFEST.txt"), "utf8");
    assert.ok(manifest.split("\n").map((s) => s.trim()).includes("20-telemetry.js"),
      "MANIFEST.txt phải liệt kê 20-telemetry.js");
    const gameJs = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
    assert.ok(gameJs.includes("wk_telemetry_v1"), "js/game.js phải chứa module telemetry");
    assert.ok(gameJs.includes('Telemetry.log("upgrade_chosen"'), "js/game.js phải chứa hook upgrade");
    assert.ok(gameJs.includes('Telemetry.log("death"'), "js/game.js phải chứa hook death");
    assert.ok(gameJs.includes('Telemetry.log("wave_quit"'), "js/game.js phải chứa hook wave_quit");
  });
});
