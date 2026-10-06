/* WINDOWKILL — Sprint Round 2 telemetry tests.
 *
 * 1. Helper-level (vm sandbox): load js/analytics.js with a minimal browser
 *    stub, call the new WKAnalytics.* helpers, flush(), and assert the exact
 *    event payloads that would be POSTed to /api/events — including that they
 *    pass the REAL server validator (validEventsBody from server/src).
 * 2. Call-site level (source): assert js/game.js wires the helpers into
 *    startWave() / die() / applyDraftPick().
 *
 * Chạy: node --test tests/telemetry.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

/* ---------- minimal sandbox for js/analytics.js ---------- */
function bootAnalytics(search) {
  const captured = []; // { url, body }
  const noop = () => {};
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date, RegExp, Error,
    TypeError, ReferenceError, SyntaxError, RangeError, Promise, Map, Set, WeakMap,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    URLSearchParams, URL,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    navigator: { userAgent: "node-test" }, // no doNotTrack => analytics ON
    location: { search: search || "", href: "http://x/game.html" + (search || "") },
    localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } },
    Blob: class { constructor(parts) { this._body = (parts || []).join(""); } },
    addEventListener: noop, removeEventListener: noop,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = { addEventListener: noop, removeEventListener: noop, hidden: false };
  sandbox.navigator.sendBeacon = (url, blob) => { captured.push({ url, body: blob._body }); return true; };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(ROOT, "js/analytics.js"), "utf8");
  vm.runInContext(src, sandbox, { filename: "js/analytics.js" });
  const A = sandbox.window.WKAnalytics;
  assert.ok(A && A.ready, "WKAnalytics phải khởi tạo trong sandbox");
  const posted = () => {
    A.flush();
    assert.ok(captured.length > 0, "flush() phải gửi batch qua sendBeacon");
    return JSON.parse(captured[captured.length - 1].body).events;
  };
  return { A, posted };
}

/* ---------- helper-level tests ---------- */
describe("S2 telemetry helpers (js/analytics.js)", () => {
  it("trackWaveReached gửi {wave, difficulty, score} đúng shape", () => {
    const { A, posted } = bootAnalytics("");
    A.trackWaveReached(5, { difficulty: "hard", score: 1234 });
    const ev = posted().find((e) => e.type === "wave_reached");
    assert.ok(ev, "phải có event wave_reached");
    assert.equal(ev.wave, 5);
    assert.equal(ev.difficulty, "hard");
    assert.equal(ev.score, 1234);
    assert.ok(Number.isInteger(ev.ts));
  });

  it("trackWaveReached không gửi difficulty/score khi thiếu/không hợp lệ", () => {
    const { A, posted } = bootAnalytics("");
    A.trackWaveReached(3, { difficulty: "insane", score: "abc" });
    const ev = posted().find((e) => e.type === "wave_reached");
    assert.equal(ev.wave, 3);
    assert.equal(ev.difficulty, undefined);
    assert.equal(ev.score, undefined);
  });

  it("mapDeathCause ánh xạ reason hiện tại vào enum", () => {
    const { A } = bootAnalytics("");
    assert.equal(A.mapDeathCause("ship"), "enemy");
    assert.equal(A.mapDeathCause("window"), "window");
    assert.equal(A.mapDeathCause("kamikaze"), "unknown");
    assert.equal(A.mapDeathCause(undefined), "unknown");
  });

  it("trackDeathCause gửi {cause, wave, score, difficulty} đúng enum", () => {
    const { A, posted } = bootAnalytics("");
    A.trackDeathCause(A.mapDeathCause("window"), { wave: 7, score: 500, difficulty: "normal" });
    const ev = posted().find((e) => e.type === "death_cause");
    assert.ok(ev);
    assert.equal(ev.cause, "window");
    assert.equal(ev.wave, 7);
    assert.equal(ev.score, 500);
    assert.equal(ev.difficulty, "normal");
  });

  it("trackDeathCause từ chối cause ngoài enum", () => {
    const { A, posted } = bootAnalytics("");
    A.trackDeathCause("laser", { wave: 2 });
    const ev = posted().find((e) => e.type === "death_cause");
    assert.equal(ev.cause, "unknown");
  });

  it("trackUpgradeChosen sanitize upgrade_id về pattern server", () => {
    const { A, posted } = bootAnalytics("");
    A.trackUpgradeChosen("u2:gai_phan", { wave: 4, level: 3 }); // ":" không hợp lệ server
    A.trackUpgradeChosen("Tăng tốc đạn!!", { wave: 2 });          // tiếng Việt + khoảng trắng
    const evs = posted().filter((e) => e.type === "upgrade_chosen");
    assert.equal(evs.length, 2);
    assert.equal(evs[0].upgrade_id, "u2-gai_phan");
    assert.equal(evs[0].wave, 4);
    assert.equal(evs[0].level, 3);
    assert.match(evs[1].upgrade_id, /^[A-Za-z0-9_-]{1,64}$/);
  });

  it("trackCtaClick tự lấy utm từ ?utm_source= khi không truyền", () => {
    const { A, posted } = bootAnalytics("?utm_source=itch.io");
    A.trackCtaClick("launcher_card");
    A.trackCtaClick("gameover_banner", "poki");
    const evs = posted().filter((e) => e.type === "cta_click");
    assert.equal(evs.length, 2);
    assert.equal(evs[0].cta_id, "launcher_card");
    assert.equal(evs[0].utm, "itch.io");
    assert.equal(evs[1].cta_id, "gameover_banner");
    assert.equal(evs[1].utm, "poki");
  });

  it("session event tự đóng dấu utm_source từ URL", () => {
    const { A, posted } = bootAnalytics("?utm_source=poki");
    A.trackSessionStart({ difficulty: "chill" });
    A.track("game_start", { difficulty: "normal" });
    const evs = posted().filter((e) => e.type === "session_start" || e.type === "game_start");
    assert.equal(evs.length, 2);
    assert.equal(evs[0].utm_source, "poki");
    assert.equal(evs[1].utm_source, "poki");
  });

  it("mọi event helper đều qua được server validator (validEventsBody)", async () => {
    const { validEventsBody } = await import("../server/src/validate.js");
    const { A, posted } = bootAnalytics("?utm_source=itch.io");
    A.trackWaveReached(12, { difficulty: "normal", score: 9000 });
    A.trackDeathCause(A.mapDeathCause("ship"), { wave: 12, score: 9000, difficulty: "normal" });
    A.trackDeathCause("boss", { wave: 15 });
    A.trackUpgradeChosen("u2:neo_quan_tinh", { wave: 5, level: 4 });
    A.trackCtaClick("wave10_toast");
    A.trackSessionStart({ difficulty: "hard" });
    const evs = posted();
    const v = validEventsBody({ events: evs });
    assert.ok(v, "batch client phải hợp lệ với server: " + JSON.stringify(evs).slice(0, 300));
    assert.equal(v.events.length, evs.length);
    // wave/difficulty/score được trích ra cột để aggregate
    const death = v.events.find((e) => e.type === "death_cause" && e.payload.cause === "boss");
    assert.equal(death.wave, 15);
  });
});

/* ---------- call-site tests (source-level) ---------- */
function extractFnBody(src, marker) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, "không tìm thấy " + marker);
  let j = src.indexOf("{", i);
  assert.ok(j > i, "không tìm thấy '{' sau " + marker);
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) return src.slice(j, k + 1); }
  }
  assert.fail("không đóng ngoặc được " + marker);
}

describe("S2 telemetry call sites (js/game.js)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

  it("startWave() gọi trackWaveReached với wave/difficulty/score", () => {
    const body = extractFnBody(src, "function startWave(n)");
    assert.ok(body.includes("trackWaveReached(n"), "startWave phải gọi trackWaveReached(n, ...)");
    assert.ok(body.includes("DIFF_KEY"), "phải truyền difficulty");
    assert.ok(body.includes("G.score"), "phải truyền score");
    // phải nằm trước các early-return (boss wave) để boss wave vẫn được track
    assert.ok(body.indexOf("trackWaveReached") < body.indexOf("V2.stageWave"),
      "track phải đặt trước early-return của V2/boss wave");
  });

  it("die() gọi Telemetry.log(\"death\") với reason/wave/score", () => {
    const body = extractFnBody(src, "function die(reason)");
    assert.ok(body.includes('Telemetry.log("death"'), "die phải gọi Telemetry.log(\"death\", ...)");
    assert.ok(body.includes("reason"), "phải truyền reason (module tự map → cause)");
    assert.ok(body.includes("G.wave") && body.includes("G.score"), "phải truyền wave + score");
  });

  it("applyDraftPick() gọi Telemetry.log(\"upgrade_chosen\") với id/wave/level", () => {
    const body = extractFnBody(src, "function applyDraftPick(u)");
    assert.ok(body.includes('Telemetry.log("upgrade_chosen"'), "applyDraftPick phải gọi Telemetry.log(\"upgrade_chosen\", ...)");
    assert.ok(body.includes("upgrade_id"), "phải truyền upgrade_id");
    assert.ok(body.includes("G.wave"), "phải truyền wave");
    assert.ok(body.includes("G.level"), "phải truyền level");
  });

  it("quitToMenu() gọi Telemetry.log(\"wave_quit\") với phase/wave", () => {
    const body = extractFnBody(src, "function quitToMenu()");
    assert.ok(body.includes('Telemetry.log("wave_quit"'), "quitToMenu phải gọi Telemetry.log(\"wave_quit\", ...)");
    assert.ok(body.includes("phase"), "phải truyền phase (module tự bỏ khi phase===\"over\")");
    assert.ok(body.includes("G.wave"), "phải truyền wave");
  });
});
