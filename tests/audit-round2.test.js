/* WINDOWKILL — Full Audit Round 2 regression tests (docs/RFC-full-audit-round2.md).
 *
 * P0-1/P0-2: retry ("Chơi lại"/R) dựng lại state mode qua Modes.restartRun().
 * P1-1: draft.hint_mobile có trong dict EN, không duplicate trong VI.
 * P1-2: end screen 2 mode đi qua key i18n (không hardcode tiếng Việt).
 * P2-1: Time Attack có banner mở màn.
 *
 * Chạy: node --test tests/audit-round2.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* ---------- sandbox nạp js/game/22-modes.js nguồn ---------- */
function loadModes(tImpl) {
  const registered = { vi: {}, en: {} };
  const rec = { banners: [], floats: [], endScreens: [], startBossCalls: [], gameOvers: [] };
  const G = {
    phase: "play", score: 1234, wave: 7, kills: 42,
    ship: { x: 100, y: 200, hp: 2, maxHp: 3 },
    ebullets: [1], enemies: [2], boss: { id: "old" },
  };
  const V2 = {
    mode: null, diffKey: "normal", profileId: "p1",
    onGameOver: (...a) => rec.gameOvers.push(a),
  };
  const I18N = {
    register: (d) => { for (const l of ["vi", "en"]) if (d[l]) Object.assign(registered[l], d[l]); },
    t: tImpl || ((k) => k),
  };
  const store = {};
  const sb = {
    console, Math, JSON, Date,
    I18N,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    window: null,
    G, V2,
    Bosses: {
      startBoss: (n) => { rec.startBossCalls.push(n); return { id: "b" + n }; },
      stop: () => {},
      setHooks: () => {},
    },
    banner: (...a) => rec.banners.push(a),
    addFloat: (...a) => rec.floats.push(a),
    showEndScreen: (o) => rec.endScreens.push(o),
    growWindow: () => {},
    START_W: 980,
    AudioEngine: { sfx: { click: () => {} } },
  };
  sb.window = sb;
  sb.window.G = G; sb.window.V2 = V2;
  vm.createContext(sb);
  vm.runInContext(read("js/game/22-modes.js"), sb, { filename: "js/game/22-modes.js" });
  return { sb, rec, registered, G, V2, Modes: sb.Modes };
}
const markerT = (k) => "⟦" + k + "⟧";

describe("audit-round2 P1-1: draft.hint_mobile đủ 2 dict, không duplicate", () => {
  it("js/i18n.js chỉ còn đúng 2 literal draft.hint_mobile (VI 1 + EN 1)", () => {
    const n = (read("js/i18n.js").match(/"draft\.hint_mobile"/g) || []).length;
    assert.equal(n, 2, `muốn 2 (xóa duplicate chết dòng 169 cũ), thấy ${n}`);
  });
  it("dict EN có key, VI giữ text Việt (verify qua i18n.js thật)", () => {
    // key này do js/i18n.js đăng ký (không phải 22-modes.js) → nạp i18n.js thật
    const store = {};
    const sb2 = {
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      location: { search: "" },
      document: { readyState: "complete", querySelectorAll: () => [], documentElement: {} },
      console,
    };
    sb2.window = sb2; sb2.window.location = sb2.location; sb2.window.localStorage = sb2.localStorage;
    vm.createContext(sb2);
    vm.runInContext(read("js/i18n.js"), sb2, { filename: "js/i18n.js" });
    assert.equal(sb2.window.I18N._dict.en["draft.hint_mobile"], "Tap to pick");
    assert.equal(sb2.window.I18N._dict.vi["draft.hint_mobile"], "Chạm để chọn");
  });
});

describe("audit-round2 P1-2: end screen 2 mode qua key i18n", () => {
  it("timeUp() lines đi qua mode.ta.line_* (không hardcode tiếng Việt)", () => {
    const { rec, V2, Modes } = loadModes(markerT);
    V2.mode = "timeattack";
    Modes.init("timeattack");
    Modes.timeUp();
    assert.equal(rec.endScreens.length, 1);
    const lines = rec.endScreens[0].lines;
    assert.ok(lines.some((l) => l.includes("⟦mode.ta.line_score⟧")), `thiếu line_score: ${lines}`);
    assert.ok(lines.some((l) => l.includes("⟦mode.ta.line_wave⟧")), `thiếu line_wave: ${lines}`);
    assert.ok(lines.some((l) => l.includes("⟦mode.ta.line_kills⟧")), `thiếu line_kills: ${lines}`);
    const blob = lines.join(" ");
    assert.ok(!/Điểm:|Hạ:|Thời gian:/.test(blob), `còn hardcode tiếng Việt: ${blob}`);
  });
  it("victory() lines đi qua mode.br.line_* (không hardcode tiếng Việt)", () => {
    const { rec, V2, Modes } = loadModes(markerT);
    V2.mode = "bossrush";
    Modes.init("bossrush");
    Modes.victory();
    assert.equal(rec.endScreens.length, 1);
    const lines = rec.endScreens[0].lines;
    assert.ok(lines.some((l) => l.includes("⟦mode.br.line_time⟧")), `thiếu line_time: ${lines}`);
    assert.ok(lines.some((l) => l.includes("⟦mode.br.line_score⟧")), `thiếu line_score: ${lines}`);
    const blob = lines.join(" ");
    assert.ok(!/Điểm:|Thời gian:/.test(blob), `còn hardcode tiếng Việt: ${blob}`);
  });
  it("6 key mới được register đủ VI+EN", () => {
    const { registered } = loadModes();
    for (const k of ["mode.ta.line_score", "mode.ta.line_wave", "mode.ta.line_kills",
                     "mode.br.line_time", "mode.br.line_score"]) {
      assert.ok(registered.vi[k], `thiếu VI: ${k}`);
      assert.ok(registered.en[k], `thiếu EN: ${k}`);
    }
  });
});

describe("audit-round2 P0: restartRun() dựng lại state mode khi retry", () => {
  it("P0-1: TA stale (done=true) → restartRun cho ta tươi 180s", () => {
    const { V2, Modes } = loadModes();
    V2.mode = "timeattack";
    Modes.init("timeattack");
    V2.ta.done = true; V2.ta.left = 0; // giả lập: vừa hết giờ
    assert.equal(Modes.restartRun(), true);
    // deepStrictEqual không dùng được cross-realm (VM) → so từng field
    assert.equal(V2.ta.total, 180);
    assert.equal(V2.ta.left, 180);
    assert.equal(V2.ta.done, false);
  });
  it("P0-1b: TA chết giữa chừng (left lẻ) → restartRun reset 180s", () => {
    const { V2, Modes } = loadModes();
    V2.mode = "timeattack";
    Modes.init("timeattack");
    V2.ta.left = 37.5; // chết khi còn 37.5s
    Modes.restartRun();
    assert.equal(V2.ta.left, 180);
    assert.equal(V2.ta.done, false);
  });
  it("P0-2: BR stale (won=true, idx=4) → restartRun: br tươi + boss 1 spawn lại", () => {
    const { rec, V2, Modes } = loadModes();
    V2.mode = "bossrush";
    Modes.init("bossrush");
    V2.br.won = true; V2.br.idx = 4; // giả lập: vừa victory
    assert.equal(Modes.restartRun(), true);
    assert.equal(V2.br.won, false);
    assert.equal(V2.br.idx, 0);
    assert.equal(rec.startBossCalls.length, 1, "phải spawn lại đúng 1 boss");
    assert.equal(rec.startBossCalls[0], 1, "phải spawn lại boss 1");
    assert.ok(rec.banners.some((b) => String(b[0]).includes("mode.br.banner") || /XẾP HÌNH/i.test(b[0])),
      "phải có banner mở màn Boss Rush");
  });
  it("không mode → restartRun() false, không đụng gì", () => {
    const { rec, V2, Modes } = loadModes();
    V2.mode = null;
    assert.equal(Modes.restartRun(), false);
    assert.equal(rec.startBossCalls.length, 0);
    assert.equal(rec.banners.length, 0);
  });
  it("resetGame() trong 15-ui.js có gọi Modes.restartRun()", () => {
    assert.ok(/Modes\.restartRun\(\)/.test(read("js/game/15-ui.js")),
      "thiếu wiring resetGame → Modes.restartRun (P0-1/P0-2 tái phát)");
  });
});

describe("audit-round2 P2-1: Time Attack có banner mở màn", () => {
  it('Modes.init("timeattack") → banner qua key mode.ta.name', () => {
    const { rec, Modes } = loadModes(markerT);
    Modes.init("timeattack");
    assert.ok(rec.banners.length >= 1, "TA phải có banner mở màn như Boss Rush");
    assert.ok(String(rec.banners[0][0]).includes("⟦mode.ta.name⟧"),
      `banner phải qua key mode.ta.name, thấy: ${rec.banners[0][0]}`);
  });
});
