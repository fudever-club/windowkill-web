/* WINDOWKILL — New Modes test suite (RFC stage-themes-modes, QA-03 + QA-04).
 *
 * Hợp đồng: docs/RFC-stage-themes-modes.md §2.3 (2 mode), §3.3 (mode contract),
 * §5.3 (AC QA-03), §5.4 (gate chung), §6 (điểm gốc cố định), edge case F1–F7, F12.
 * Viết từ SPEC — kỳ vọng từ RFC, không bám implementation.
 *
 * Map AC §5.3:
 *   parse ?mode= + whitelist + precedence ......... M1 (F1, F2)
 *   time attack: timer/phá băng/spawn/kỷ lục ...... M2–M5 (F3, F4)
 *   boss rush: 5 boss + rest + guard .............. M6–M8 (F5, F6, F7)
 *   menu guard unlock ải ≥ 2 ..................... M9
 *   §6: không nhân điểm mode nào ................. M10
 * Map §5.4: build --check, bump-sw --check, i18n .. M14, M13 (F12, F11)
 *
 * Chạy: node --test tests/new-modes.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = () => fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

/* ---------- brace-matching extractor (bỏ qua string/comment) ---------- */
function extractBrace(src, openIdx) {
  let i = openIdx, depth = 0;
  let inStr = null, esc = false, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return null;
}
function extractFunctionDecl(src, name) {
  const m = src.match(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.ok(m, `không tìm thấy function ${name} trong js/game.js — dev chạy: node scripts/build-game.js`);
  const open = src.indexOf("{", m.index);
  const body = extractBrace(src, open);
  assert.ok(body, `ngoặc mất cân bằng ở function ${name}`);
  return src.slice(m.index, open + body.length);
}
function extractModesSrc() {
  const src = gameSrc();
  const m = src.match(/window\.Modes\s*=\s*\{/);
  assert.ok(m, "bundle js/game.js chưa có window.Modes — dev: tạo js/game/22-modes.js + node scripts/build-game.js");
  const body = extractBrace(src, src.indexOf("{", m.index));
  assert.ok(body, "ngoặc mất cân bằng ở window.Modes");
  return body;
}

/* ---------- canvas 2d mock ---------- */
function mockCtx2d() {
  const calls = [];
  const px = new Proxy({}, {
    get(tg, p) {
      if (p === "__calls") return calls;
      if (p in tg) return tg[p];
      if (typeof p === "string") {
        if (p === "measureText") return (...a) => { calls.push([p, ...a]); return { width: 10 }; };
        return (...a) => { calls.push([p, ...a]); };
      }
      return undefined;
    },
    set(tg, p, v) { tg[p] = v; calls.push(["set", p, v]); return true; },
  });
  return px;
}

/* ---------- sandbox khoan dung: global lạ → any-proxy (no-op sâu) ---------- */
function anyProxy() {
  const f = function () { return anyProxy(); };
  return new Proxy(f, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === "then") return undefined;
      return anyProxy();
    },
    apply() { return anyProxy(); },
    construct() { return anyProxy(); },
    set() { return true; },
  });
}
function lenient(overrides = {}) {
  const base = Object.assign({ console, Math, JSON, Date,
    I18N: { t: (k) => k, register: () => {} },
  }, overrides);
  const px = new Proxy(base, {
    get(t, p) { return p in t ? t[p] : anyProxy(); },
    set(t, p, v) { t[p] = v; return true; },
    has() { return true; },
  });
  vm.createContext(px);
  return px;
}
function mockStorage(seed = {}) {
  const store = Object.assign({}, seed);
  return {
    _store: store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

/* ---------- V2.boot thật (js/v2glue.js) trong VM ---------- */
function bootV2(search, extraWindow = {}, extraTop = {}) {
  const src = fs.readFileSync(path.join(ROOT, "js/v2glue.js"), "utf8");
  const rec = { inits: [] };
  const sandbox = Object.assign({
    console, URLSearchParams,
    location: { search },
    window: Object.assign({
      Campaign: { getUnlockedStage: () => 5 },
      Modes: { init(mode) { rec.inits.push(mode); } },
    }, extraWindow),
  }, extraTop);
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "js/v2glue.js" });
  const V2 = sandbox.window.V2;
  assert.ok(V2, "js/v2glue.js phải gán window.V2");
  V2.boot({ diffKey: "normal", profileId: "p1" });
  return { V2, rec };
}

/* ---------- nạp window.Modes từ bundle với mock đầy đủ ---------- */
function modeEnv(over = {}) {
  const body = extractModesSrc();
  const rec = {
    showEnd: [], grow: [], floats: [], banners: [], onGameOver: [],
    bossesStarted: [], bossesStopped: 0, dieCalled: false, i18nT: [],
  };
  const storage = mockStorage(over.storageSeed || {});
  const V2 = Object.assign(
    { mode: null, ta: null, br: null, diffKey: "normal", profileId: "p1",
      onGameOver(...a) { rec.onGameOver.push(a); } },
    over.V2 || {});
  const G = Object.assign(
    { phase: "play", score: 0, kills: 0, wave: 1, act: 0, time: 0,
      enemies: [], ebullets: [], gems: [], bullets: [], pickups: [], floats: [],
      boss: null, dying: [], ship: { x: 400, y: 300, r: 14, hp: 3, maxHp: 5 } },
    over.G || {});
  const ctx = lenient({
    V2, G, localStorage: storage,
    DIFF_KEY: "normal", PROFILE_ID: "p1",
    START_W: 980, START_H: 720, // hằng số desktop (js/game.js)
    window: Object.assign({ outerWidth: 800, outerHeight: 600 }, over.window || {}),
    Bosses: { startBoss(...a) { rec.bossesStarted.push(a); }, stop() { rec.bossesStopped++; } },
    showEndScreen: (o) => rec.showEnd.push(o),
    growWindow: (dw, dh) => rec.grow.push([dw, dh]),
    addFloat: (...a) => rec.floats.push(a),
    banner: (...a) => rec.banners.push(a),
    die: () => { rec.dieCalled = true; },
    /* P1(item 3): mock trả marker ⟦key⟧ (≠ key) để test assert Modes đi qua đúng key i18n
       qua this._t(...) thay vì hardcode literal tiếng Việt. */
    I18N: { t: (k, v) => { rec.i18nT.push([k, v]); return "⟦" + k + "⟧"; }, register: () => {} },
  });
  ctx.window.V2 = V2; ctx.window.G = G;
  vm.runInContext("__Modes = (" + body + ")", ctx, { filename: "Modes" });
  return { Modes: ctx.__Modes, ctx, rec, V2, G, storage };
}

/* ================= M1: parse ?mode= (F1, F2) ================= */
describe("modes/M1 (F1,F2): parse ?mode= — whitelist + precedence", () => {
  it("?mode=timeattack → V2.mode='timeattack', stageId=0, endless/daily=false", () => {
    const { V2, rec } = bootV2("?mode=timeattack&diff=normal");
    assert.equal(V2.mode, "timeattack");
    assert.equal(V2.stageId, 0);
    assert.equal(V2.endless, false);
    assert.equal(V2.daily, false);
    assert.ok(rec.inits.includes("timeattack"), "V2.boot phải gọi Modes.init('timeattack')");
  });
  it("?mode=bossrush → V2.mode='bossrush', stageId=0", () => {
    const { V2, rec } = bootV2("?mode=bossrush");
    assert.equal(V2.mode, "bossrush");
    assert.equal(V2.stageId, 0);
    assert.ok(rec.inits.includes("bossrush"), "V2.boot phải gọi Modes.init('bossrush')");
  });
  it("không có ?mode= → V2.mode=null, game chạy như cũ", () => {
    const { V2 } = bootV2("?endless=1");
    assert.ok(V2.mode == null, `V2.mode phải null, thấy ${V2.mode}`);
    assert.equal(V2.endless, true, "endless=1 vẫn hoạt động khi không có mode");
  });
  it("F1: fuzz 10 giá trị mode sai → V2.mode=null, 0 exception, fallback an toàn", () => {
    const bads = ["turbo", "", "TIMEATTACK", "time attack", "bossrush2", "null", "undefined", "0", "1", "daily"];
    assert.equal(bads.length, 10);
    for (const bad of bads) {
      let V2;
      assert.doesNotThrow(() => { V2 = bootV2(`?mode=${encodeURIComponent(bad)}`).V2; },
        `?mode=${bad} throw`);
      assert.ok(V2.mode == null, `?mode=${bad}: V2.mode phải null, thấy ${V2.mode}`);
    }
  });
  it("F1: mode sai + endless=1 → endless vẫn chạy (fallback, không kẹt mode)", () => {
    const { V2 } = bootV2("?mode=turbo&endless=1");
    assert.ok(V2.mode == null);
    assert.equal(V2.endless, true);
  });
  it("F2: mode hợp lệ ĐÈ stage/endless/daily (?mode=bossrush&stage=3&endless=1&daily=1)", () => {
    const { V2 } = bootV2("?mode=bossrush&stage=3&endless=1&daily=1");
    assert.equal(V2.mode, "bossrush");
    assert.equal(V2.stageId, 0, "mode đè ?stage=");
    assert.equal(V2.endless, false, "mode đè ?endless=1");
    assert.equal(V2.daily, false, "mode đè ?daily=1");
  });
  it("F2: mode sai + stage=2 → stage vẫn được tôn trọng (không có trạng thái lai)", () => {
    const { V2 } = bootV2("?mode=xxx&stage=2");
    assert.ok(V2.mode == null);
    assert.equal(V2.stageId, 2, "mode sai → stage parse như thường");
  });
});

/* ================= M2: Modes.init ================= */
describe("modes/M2: Modes.init khởi tạo state theo mode", () => {
  it("init('timeattack') → V2.ta={total:180,left:180,done:false}", () => {
    const { Modes, V2 } = modeEnv();
    Modes.init("timeattack");
    assert.equal(V2.mode, "timeattack");
    assert.deepEqual({ ...V2.ta }, { total: 180, left: 180, done: false });
  });
  it("init('bossrush') → V2.br={idx:0,order:[1..5],restT:0,won:false}", () => {
    const { Modes, V2 } = modeEnv();
    Modes.init("bossrush");
    assert.equal(V2.mode, "bossrush");
    assert.equal(V2.br.idx, 0);
    assert.deepEqual([...V2.br.order], [1, 2, 3, 4, 5]);
    assert.equal(V2.br.restT, 0);
    assert.equal(V2.br.won, false);
  });
  it("init(null) → V2.mode=null, không tạo state mode", () => {
    const { Modes, V2 } = modeEnv();
    Modes.init(null);
    assert.ok(V2.mode == null);
  });
});

/* ================= M3: tickTimer (F3) ================= */
describe("modes/M3 (F3): tickTimer chỉ trừ khi G.phase==='play'", () => {
  it("phase play → trừ đúng dt; hết giờ → timeUp (done, phase over)", () => {
    const { Modes, V2, G } = modeEnv({ V2: { mode: "timeattack", ta: { total: 180, left: 10, done: false } } });
    Modes.tickTimer(1);
    assert.equal(V2.ta.left, 9);
    Modes.tickTimer(0.5);
    assert.equal(V2.ta.left, 8.5);
  });
  it("pause/draft/over → timer ĐỨNG YÊN", () => {
    const { Modes, V2, G } = modeEnv({ V2: { mode: "timeattack", ta: { total: 180, left: 100, done: false } } });
    for (const ph of ["paused", "draft", "over"]) {
      G.phase = ph;
      Modes.tickTimer(5);
      assert.equal(V2.ta.left, 100, `phase "${ph}": timer phải đứng yên`);
    }
    G.phase = "play";
    Modes.tickTimer(5);
    assert.equal(V2.ta.left, 95, "resume play → chạy tiếp");
  });
  it("left về 0 → timeUp: done=true, phase='over' (không phải die)", () => {
    const { Modes, V2, G, rec } = modeEnv({
      V2: { mode: "timeattack", ta: { total: 180, left: 0.4, done: false } },
      G: { phase: "play", score: 500, kills: 20, wave: 4, time: 179.6, boss: null },
    });
    Modes.tickTimer(1);
    assert.ok(V2.ta.left <= 0, "hết giờ");
    assert.equal(V2.ta.done, true);
    assert.equal(G.phase, "over");
    assert.equal(rec.dieCalled, false, "hết giờ KHÔNG phải thua — không gọi die()");
    assert.equal(rec.showEnd.length, 1);
    assert.equal(rec.showEnd[0].kind, "timeup");
  });
  it("mode khác/null → tickTimer no-op", () => {
    const { Modes, V2 } = modeEnv({ V2: { mode: null, ta: null } });
    assert.doesNotThrow(() => Modes.tickTimer(1), "tickTimer với mode null phải no-op");
  });
  it("RFC §2.3.1: <10s → tick sound mỗi giây (AudioEngine.sfx.click), ≥10s im lặng", () => {
    const clicks = [];
    const env = modeEnv({ V2: { mode: "timeattack", ta: { total: 180, left: 11.5, done: false } } });
    env.ctx.AudioEngine = { sfx: { click() { clicks.push(env.V2.ta.left); } } };
    env.Modes.tickTimer(1); // 10.5s
    assert.equal(clicks.length, 0, "≥10s: không tick");
    env.Modes.tickTimer(0.6); // 9.9s
    assert.equal(clicks.length, 1, "<10s: tick lần đầu");
    env.Modes.tickTimer(0.2); // 9.7s — cùng giây
    assert.equal(clicks.length, 1, "cùng mốc giây: không tick lại");
    env.Modes.tickTimer(1); // 8.7s — sang giây mới
    assert.equal(clicks.length, 2, "sang giây mới: tick tiếp");
  });
});

/* ================= M4: timeUp (F4) ================= */
describe("modes/M4 (F4): timeUp — freeze, kết quả, kỷ lục riêng", () => {
  function taEnv(taLeft, seed = {}) {
    return modeEnv({
      V2: { mode: "timeattack", ta: { total: 180, left: taLeft, done: false } },
      G: { phase: "play", score: 1234, kills: 56, wave: 9, time: 180, boss: { type: "boss" } },
      storageSeed: seed,
    });
  }
  it("phase='over', done=true, dọn boss + Bosses.stop(), overlay qua key mode.ta.timeup_title", () => {
    const { Modes, V2, G, rec } = taEnv(0);
    Modes.timeUp();
    assert.equal(G.phase, "over", "tận dụng guard sẵn có: quái/spawn ngừng");
    assert.equal(V2.ta.done, true);
    assert.ok(G.boss == null, "dọn G.boss");
    assert.equal(rec.bossesStopped, 1, "Bosses.stop() được gọi");
    assert.equal(rec.showEnd.length, 1);
    assert.equal(rec.showEnd[0].kind, "timeup");
    assert.equal(rec.showEnd[0].title, "⟦mode.ta.timeup_title⟧",
      "title phải đi qua key i18n mode.ta.timeup_title (user EN không thấy title VI)");
    assert.ok(rec.i18nT.some(([k]) => k === "mode.ta.timeup_title"), "phải gọi đúng key mode.ta.timeup_title");
    assert.equal(rec.dieCalled, false, "không gọi die() — hết giờ không phải thua");
  });
  it("V2.onGameOver('timeup') vẫn gọi cho telemetry/achievement", () => {
    const { Modes, rec } = taEnv(0);
    Modes.timeUp();
    assert.deepEqual(rec.onGameOver[0], ["timeup"]);
  });
  it("không throw khi G.boss null; hết giờ giữa draft → draft bị đè", () => {
    const { Modes, G } = taEnv(0);
    G.boss = null; G.phase = "draft";
    assert.doesNotThrow(() => Modes.timeUp(), "G.boss null phải an toàn");
    assert.equal(G.phase, "over", "phase 'over' đè 'draft' — đóng overlay nâng cấp");
  });
  it("kỷ lục lưu đúng key wk_ta_high_<diff>_<profile> = {score,wave,kills,date}", () => {
    const { Modes, storage } = taEnv(0);
    Modes.timeUp();
    const raw = storage.getItem("wk_ta_high_normal_p1");
    assert.ok(raw, "thiếu key wk_ta_high_normal_p1");
    const r = JSON.parse(raw);
    assert.equal(r.score, 1234); assert.equal(r.wave, 9); assert.equal(r.kills, 56);
    assert.ok(r.date, "thiếu date");
  });
  it("phá kỷ lục → key mode.ta.new_record; không phá → recordLine rỗng", () => {
    const prev = { score: 5000, wave: 12, kills: 100, date: "2026-10-16" };
    const e1 = taEnv(0, { wk_ta_high_normal_p1: JSON.stringify(prev) });
    e1.Modes.timeUp();
    const line1 = String(e1.rec.showEnd[0].recordLine || "");
    assert.equal(line1, "", "không phá kỷ lục thì recordLine rỗng");
    const e2 = taEnv(0, { wk_ta_high_normal_p1: JSON.stringify({ score: 100, wave: 2, kills: 5, date: "x" }) });
    e2.Modes.timeUp();
    const line2 = String(e2.rec.showEnd[0].recordLine || "");
    assert.ok(line2.includes("⟦mode.ta.new_record⟧"),
      `phá kỷ lục phải đi qua key mode.ta.new_record, thấy: ${line2}`);
  });
  it("không đụng kỷ lục endless/campaign (key riêng)", () => {
    const { Modes, storage } = taEnv(0, { wk_high_normal_p1: JSON.stringify({ score: 99999 }) });
    Modes.timeUp();
    assert.equal(JSON.parse(storage.getItem("wk_high_normal_p1")).score, 99999,
      "kỷ lục endless/campaign phải nguyên vẹn");
  });
});

/* ================= M5: spawnScale ================= */
describe("modes/M5: spawnScale — time attack tăng nhịp, không tăng độ khó cơ số", () => {
  it("timeattack → {intervalMul: 0.75, breakMul: 1.2/2.6}", () => {
    const { Modes, V2 } = modeEnv({ V2: { mode: "timeattack" } });
    const s = Modes.spawnScale();
    assert.equal(s.intervalMul, 0.75, "wkSpawnInterval × 0.75");
    assert.ok(Math.abs(s.breakMul - 1.2 / 2.6) < 1e-9, `breakMul phải = 1.2/2.6 (waveBreak 2.6→1.2), thấy ${s.breakMul}`);
  });
  it("mode khác/null → {intervalMul: 1, breakMul: 1}", () => {
    for (const mode of [null, "bossrush"]) {
      const { Modes, V2 } = modeEnv({ V2: { mode } });
      const s = Modes.spawnScale();
      assert.equal(s.intervalMul, 1);
      assert.equal(s.breakMul, 1);
    }
  });
  it("wiring: 11-spawn dùng spawnScale, 16-update wave-break = 2.6 × spawnScale().breakMul", () => {
    const spawn = fs.readFileSync(path.join(ROOT, "js/game/11-spawn.js"), "utf8");
    assert.ok(spawn.includes("spawnScale"), "11-spawn.js phải nhân wkSpawnInterval với Modes.spawnScale()");
    const upd = fs.readFileSync(path.join(ROOT, "js/game/16-update.js"), "utf8");
    assert.ok(upd.includes("Modes.tickTimer"), "16-update.js phải gọi Modes.tickTimer(dt)");
    assert.ok(upd.includes("spawnScale().breakMul"),
      "16-update.js: waveBreak phải = 2.6 × Modes.spawnScale().breakMul (time attack → 1.2s), không hardcode");
    assert.ok(!/V2\.mode\s*===\s*"timeattack"\)\s*\?\s*1\.2/.test(upd),
      "16-update.js không được hardcode 1.2 cho time attack nữa (breakMul là nguồn duy nhất)");
  });
});

/* ================= M6: §6 không nhân điểm ================= */
function gameRegistry() {
  const src = fs.readFileSync(path.join(ROOT, "js/game/10-gamedata.js"), "utf8");
  const m = src.match(/const\s+MONSTER_REGISTRY\s*=\s*\{/);
  const body = extractBrace(src, src.indexOf("{", m.index));
  const ctx = { I18N: { t: (k) => k } };
  vm.createContext(ctx);
  return vm.runInContext("(" + body + ")", ctx);
}
describe("modes/M6 (§6): điểm gốc cố định — KHÔNG nhân điểm ở mode nào", () => {
  it("killEnemy không tham chiếu V2.mode/Modes (source)", () => {
    const body = extractFunctionDecl(gameSrc(), "killEnemy");
    assert.ok(!/V2\.mode/.test(body), "killEnemy không được đọc V2.mode");
    assert.ok(!/Modes\./.test(body), "killEnemy không được đọc Modes");
    assert.ok(body.includes("const pts = base;"), "giữ nguyên dòng §6: const pts = base");
  });
  it("giết chaser ở timeattack → +10 điểm đúng (không nhân)", () => {
    const src = gameSrc();
    const fnSrc = extractFunctionDecl(src, "killEnemy");
    const V2mock = { mode: "timeattack", onKill() {} };
    const G = { phase: "play", score: 0, kills: 0, waveKills: 0, combo: 0, comboT: 0,
                dying: [], gems: [], enemies: [], floats: [],
                ship: { x: 400, y: 300, r: 14 } };
    const ctx = lenient({ V2: V2mock, G, MONSTER_REGISTRY: gameRegistry(),
      window: { V2: V2mock }, DIFF: {} });
    ctx.window.V2 = V2mock;
    vm.runInContext(fnSrc, ctx, { filename: "killEnemy" });
    vm.runInContext(`killEnemy({ type: "chaser", x: 100, y: 100, r: 12, color: "#ff5470", dead: false })`, ctx);
    assert.equal(G.score, 10, "chaser score=10 — timeattack không được nhân điểm");
  });
  it("Modes source không chứa phép nhân điểm nào", () => {
    const ms = extractModesSrc();
    assert.ok(!/G\.score\s*\*=/ .test(ms), "cấm G.score *= ...");
    assert.ok(!/G\.score\s*=\s*G\.score\s*\*/.test(ms), "cấm G.score = G.score * ...");
    assert.ok(!/score\s*\*\s*[0-9.]+/.test(ms), "cấm score * <hệ số> trong Modes");
  });
});

/* ================= M7: boss rush — order + rest (F5, F7) ================= */
function brEnv() {
  return modeEnv({
    V2: { mode: "bossrush", diffKey: "normal", profileId: "p1",
          br: { idx: 0, order: [1, 2, 3, 4, 5], restT: 0, won: false, t0: Date.now() } },
    G: { phase: "play", score: 0, time: 0,
         ebullets: [{ x: 1, y: 1 }, { x: 2, y: 2 }], enemies: [{ type: "chewer" }],
         boss: { stageId: 1 }, ship: { x: 400, y: 300, r: 14, hp: 3, maxHp: 5 } },
    window: { outerWidth: 800, outerHeight: 600 }, // cửa sổ đã mất 180px → missing=180
  });
}
/* Nghỉ 5s trôi qua — qua per-frame driver của Modes (tickTimer, RFC §3.3). */
function elapseRest(Modes, V2, secs) {
  for (let t = 0; t < secs; t += 0.25) {
    Modes.tickTimer(0.25);
    if (V2.br.restT <= 0) break;
  }
}
describe("modes/M7 (F5,F7): boss rush — 5 boss đúng thứ tự, nghỉ 5s + sửa 30% + +1HP", () => {
  it("startBossRush → Bosses.startBoss(1,…); banner mở màn", () => {
    const { Modes, V2, rec } = brEnv();
    Modes.startBossRush();
    assert.equal(rec.bossesStarted.length, 1, "phải gọi Bosses.startBoss đúng 1 lần");
    assert.equal(rec.bossesStarted[0][0], 1, "boss đầu tiên là boss_1");
    const said = [...rec.floats, ...rec.banners, ...rec.i18nT.map(([k]) => k)].join(" ");
    assert.ok(/XẾP HÌNH|mode\.br/i.test(said), `phải có banner mở màn "XẾP HÌNH SẾP", thấy: ${said.slice(0, 80)}`);
    assert.equal(V2.br.idx, 0);
  });
  it("onBossDown → dọn sân (F7) + restT=5 + sửa 30% missing (F5) + ship +1HP", () => {
    const { Modes, V2, G, rec } = brEnv();
    Modes.startBossRush();
    Modes.onBossDown({ stageId: 1 });
    assert.equal(G.ebullets.length, 0, "F7: dọn sạch đạn địch còn sót");
    assert.equal(G.enemies.length, 0, "F7: dọn sạch adds còn lại");
    assert.equal(rec.bossesStopped, 1, "Bosses.stop() được gọi");
    assert.equal(V2.br.restT, 5, "nghỉ 5s giữa boss");
    assert.equal(G.phase, "play", "rest giữ phase play nhưng sân trống");
    // F5: missing = 980 − 800 = 180 → growWindow(round(180*.3), round(180*.3*.75)) = (54, 41)
    assert.deepEqual(rec.grow[0], [54, 41], "sửa cửa sổ 30% phần đã mất qua growWindow (cap ở START)");
    assert.equal(G.ship.hp, 4, "ship +1 HP");
  });
  it("F5: cửa sổ đã đủ lớn → không sửa vượt START (missing = max(0,…))", () => {
    const env = brEnv();
    env.ctx.window.outerWidth = 1200; // > START_W=980
    env.Modes.startBossRush();
    env.Modes.onBossDown({ stageId: 1 });
    assert.ok(env.rec.grow.every(([dw]) => dw <= 0), "không được grow dương khi missing ≤ 0");
  });
  it("+1 HP đầy → quy thành 200 điểm an ủi + float '+200'", () => {
    const { Modes, G, rec } = brEnv();
    G.ship.hp = 5; G.ship.maxHp = 5;
    Modes.startBossRush();
    Modes.onBossDown({ stageId: 1 });
    assert.equal(G.ship.hp, 5, "cap ở maxHp");
    assert.equal(G.score, 200, "quy thành 200 điểm an ủi");
    assert.ok(rec.floats.some((a) => String(a).includes("+200")), "float '+200'");
  });
  it("đủ 5 boss đúng thứ tự 1→5 qua rest 5s", () => {
    const { Modes, V2, rec } = brEnv();
    Modes.startBossRush();
    for (let n = 1; n <= 4; n++) {
      Modes.onBossDown({ stageId: n });
      assert.equal(V2.br.restT, 5, `sau boss_${n}: rest 5s`);
      elapseRest(Modes, V2, 6);
      assert.equal(rec.bossesStarted.length, n + 1, `hết rest: boss_${n + 1} phải spawn`);
      assert.equal(rec.bossesStarted[n][0], n + 1, `thứ tự boss_${n + 1}`);
      assert.equal(V2.br.idx, n, `V2.br.idx = ${n}`);
    }
  });
  it("chết giữa boss rush → die() như thường (không thắng)", () => {
    const { Modes, V2, G, rec } = brEnv();
    Modes.startBossRush();
    // mô phỏng chết: engine gọi die() — Modes không được can thiệp
    assert.equal(V2.br.won, false);
    assert.equal(rec.showEnd.filter((s) => s.kind === "victory").length, 0);
  });
});

/* ================= M8: victory + kỷ lục ================= */
describe("modes/M8: hạ boss_5 → THẮNG + kỷ lục thời gian", () => {
  function wonEnv(prevBest) {
    const env = brEnv();
    env.V2.br.t0 = Date.now() - 600000; // run 10 phút
    if (prevBest) env.storage._store["wk_br_best_normal_p1"] = JSON.stringify(prevBest);
    env.Modes.startBossRush();
    for (let n = 1; n <= 4; n++) { env.Modes.onBossDown({ stageId: n }); elapseRest(env.Modes, env.V2, 6); }
    env.G.score = 3450;
    env.Modes.onBossDown({ stageId: 5 });
    return env;
  }
  it("overlay qua key mode.br.victory_title, phase over, won=true", () => {
    const { V2, G, rec } = wonEnv();
    assert.equal(V2.br.won, true);
    assert.equal(G.phase, "over");
    const v = rec.showEnd.find((s) => s.kind === "victory");
    assert.ok(v, "phải showEndScreen kind victory");
    assert.equal(v.title, "⟦mode.br.victory_title⟧",
      "title phải đi qua key i18n mode.br.victory_title (user EN không thấy title VI)");
    assert.ok(rec.i18nT.some(([k]) => k === "mode.br.victory_title"), "phải gọi đúng key mode.br.victory_title");
  });
  it("kỷ lục wk_br_best_<diff>_<profile> = {timeSec, score, date}; phá khi NHANH hơn", () => {
    const { storage, rec } = wonEnv({ timeSec: 9999, score: 1, date: "x" });
    const r = JSON.parse(storage.getItem("wk_br_best_normal_p1"));
    assert.ok(r.timeSec < 9999 && r.timeSec > 590 && r.timeSec < 660, `timeSec ~600s, thấy ${r.timeSec}`);
    assert.equal(r.score, 3450);
    assert.ok(r.date);
    const line = String(rec.showEnd.find((s) => s.kind === "victory").recordLine || "");
    assert.ok(line.includes("⟦mode.ta.new_record⟧"),
      `phá kỷ lục thời gian phải đi qua key mode.ta.new_record, thấy: ${line}`);
    const slow = wonEnv({ timeSec: 100, score: 1, date: "x" });
    const line2 = String(slow.rec.showEnd.find((s) => s.kind === "victory").recordLine || "");
    assert.equal(line2, "", "chậm hơn kỷ lục cũ → recordLine rỗng");
    assert.equal(JSON.parse(slow.storage.getItem("wk_br_best_normal_p1")).timeSec, 100, "kỷ lục cũ giữ nguyên");
  });
});

/* ================= M9: boss 5 timeout (F6) ================= */
describe("modes/M9 (F6): boss_5 timeout → thua (WKDie 'window')", () => {
  it("Modes đăng ký onTimeout → WKDie('window') như campaign", () => {
    const ms = extractModesSrc();
    assert.ok(ms.includes("onTimeout"), "Modes phải đăng ký hook onTimeout cho boss rush");
    assert.ok(/WKDie\(\s*["']window["']\s*\)/.test(ms),
      "timeout boss rush phải → WKDie(\"window\") (thua, không có nhánh timeout-mà-thắng)");
  });
});

/* ================= M10: menu guard + panel ================= */
describe("modes/M10: menu — panel 'Chế độ chơi' + guard unlock ải ≥ 2", () => {
  const menuSrc = fs.readFileSync(path.join(ROOT, "js/menu.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  it("index.html có 2 nút mode đúng tên RFC", () => {
    assert.ok(html.includes("Chạy Deadline"), "thiếu nút '⏱ Chạy Deadline'");
    assert.ok(html.includes("Xếp Hình Sếp"), "thiếu nút '👔 Xếp Hình Sếp'");
  });
  it("menu.js: v2sel kind 'mode' + 2 mode id", () => {
    assert.ok(/kind:\s*"mode"/.test(menuSrc), "thiếu v2sel {kind:\"mode\"}");
    assert.ok(menuSrc.includes('"timeattack"'), "thiếu mode id 'timeattack'");
    assert.ok(menuSrc.includes('"bossrush"'), "thiếu mode id 'bossrush'");
  });
  it("guard: boss rush khóa khi getUnlockedStage < 2 (+ hint khóa)", () => {
    assert.ok(menuSrc.includes("getUnlockedStage"), "menu phải đọc Campaign.getUnlockedStage");
    const i = menuSrc.indexOf("bossrush");
    const around = menuSrc.slice(Math.max(0, i - 600), i + 600);
    assert.ok(/<\s*2/.test(around) || />=\s*2/.test(around),
      "quanh nút bossrush phải có điều kiện unlock ải ≥ 2");
    assert.ok(menuSrc.includes("menu.mode.locked_hint"), "thiếu hint khóa menu.mode.locked_hint");
  });
  it("launchGame: v2sel mode → ?mode= trên URL", () => {
    assert.ok(/q\.set\(\s*"mode"/.test(menuSrc), 'launchGame phải q.set("mode", v2sel.mode)');
  });
});

/* ================= M11: showEndScreen ================= */
function loadShowEndScreen() {
  const fnSrc = extractFunctionDecl(gameSrc(), "showEndScreen");
  const els = {};
  const mk = (id) => ({
    id, textContent: "", innerHTML: "",
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                 contains(c) { return this._s.has(c); } },
  });
  const ctx = lenient({ $: (id) => els[id] || (els[id] = mk(id)) });
  vm.runInContext(fnSrc, ctx, { filename: "showEndScreen" });
  return { ctx, els };
}
describe("modes/M11: showEndScreen — overlay kết quả dùng chung (#ov-over)", () => {
  it("kind timeup → title 'HẾT GIỜ! ⏱', hiện #ov-over", () => {
    const { ctx, els } = loadShowEndScreen();
    vm.runInContext(`showEndScreen({ kind: "timeup", title: "HẾT GIỜ! ⏱", lines: ["Điểm: 1234"], recordLine: "KỶ LỤC MỚI! 🏆" })`, ctx);
    assert.equal(els["over-title"].textContent, "HẾT GIỜ! ⏱");
    assert.ok(els["ov-over"].classList.contains("show"), "#ov-over phải hiện");
    assert.ok(els["over-stats"].innerHTML.includes("Điểm: 1234"), "lines vào over-stats");
    assert.ok(els["over-record"].innerHTML.includes("KỶ LỤC MỚI"), "recordLine vào over-record");
  });
  it("kind victory → title 'THẮNG BOSS RUSH! 🏆'", () => {
    const { ctx, els } = loadShowEndScreen();
    vm.runInContext(`showEndScreen({ kind: "victory", title: "THẮNG BOSS RUSH! 🏆", lines: [], recordLine: "" })`, ctx);
    assert.equal(els["over-title"].textContent, "THẮNG BOSS RUSH! 🏆");
    assert.ok(els["ov-over"].classList.contains("show"));
  });
});

/* ================= M12: drawHUD ================= */
describe("modes/M12: Modes.drawHUD — countdown / tiến trình boss", () => {
  it("timeattack: HUD đi qua key mode.ta.hud (không hardcode VI)", () => {
    const { Modes, rec } = modeEnv({ V2: { mode: "timeattack", ta: { total: 180, left: 75.5, done: false } } });
    const c = mockCtx2d();
    assert.doesNotThrow(() => Modes.drawHUD(c, 1280), "drawHUD throw");
    const texts = c.__calls.filter((x) => x[0] === "fillText").map((x) => String(x[1]));
    assert.ok(texts.length > 0, "drawHUD phải vẽ text");
    assert.ok(texts.some((t) => t.includes("⟦mode.ta.hud⟧")),
      `HUD phải vẽ qua key mode.ta.hud, thấy: ${texts.join(" ").slice(0, 60)}`);
    assert.ok(rec.i18nT.some(([k]) => k === "mode.ta.hud"), "phải gọi đúng key mode.ta.hud");
  });
  it("timeattack: fallback template '⏱ {m}:{s}' thay placeholder đúng (75.5s → 1:15)", () => {
    const env = modeEnv({ V2: { mode: "timeattack", ta: { total: 180, left: 75.5, done: false } } });
    env.ctx.I18N = { t: (k) => k, register: () => {} }; // trả key → _t dùng fallback
    const c = mockCtx2d();
    env.Modes.drawHUD(c, 1280);
    const texts = c.__calls.filter((x) => x[0] === "fillText").map((x) => String(x[1])).join(" ");
    assert.ok(texts.includes("⏱ 1:15"), `fallback phải render "⏱ 1:15", thấy: ${texts.slice(0, 60)}`);
  });
  it("bossrush: HUD tiến trình đi qua key mode.br.progress (idx=1)", () => {
    const { Modes, rec } = modeEnv({ V2: { mode: "bossrush", br: { idx: 1, order: [1, 2, 3, 4, 5], restT: 0, won: false } } });
    const c = mockCtx2d();
    assert.doesNotThrow(() => Modes.drawHUD(c, 1280), "drawHUD throw");
    const texts = c.__calls.filter((x) => x[0] === "fillText").map((x) => String(x[1])).join(" ");
    assert.ok(texts.length > 0, "drawHUD phải vẽ text");
    assert.ok(texts.includes("⟦mode.br.progress⟧"),
      `HUD phải vẽ qua key mode.br.progress, thấy: ${texts.slice(0, 80)}`);
    assert.ok(rec.i18nT.some(([k]) => k === "mode.br.progress"), "phải gọi đúng key mode.br.progress");
  });
  it("bossrush: rest banner đi qua key mode.br.rest_banner", () => {
    const { Modes, rec } = modeEnv({ V2: { mode: "bossrush", br: { idx: 0, order: [1, 2, 3, 4, 5], restT: 4.2, won: false } } });
    const c = mockCtx2d();
    Modes.drawHUD(c, 1280);
    const texts = c.__calls.filter((x) => x[0] === "fillText").map((x) => String(x[1])).join(" ");
    assert.ok(texts.includes("⟦mode.br.rest_banner⟧"),
      `rest phải vẽ qua key mode.br.rest_banner, thấy: ${texts.slice(0, 80)}`);
  });
  it("P2(item 6): pulse TẮT khi prefers-reduced-motion (đỏ tĩnh, không globalAlpha)", () => {
    const mk = (rm) => modeEnv({
      V2: { mode: "timeattack", ta: { total: 180, left: 20, done: false } },
      window: { matchMedia: () => ({ matches: rm }) },
    });
    const e1 = mk(false); const c1 = mockCtx2d(); e1.Modes.drawHUD(c1, 1280);
    assert.ok(c1.__calls.some((x) => x[0] === "set" && x[1] === "globalAlpha"),
      "bình thường: urgent (<30s) → pulse (globalAlpha)");
    const e2 = mk(true); const c2 = mockCtx2d(); e2.Modes.drawHUD(c2, 1280);
    const fills = c2.__calls.filter((x) => x[0] === "set" && x[1] === "fillStyle").map((x) => x[2]);
    assert.ok(fills.includes("#ff3b30"), "reduced-motion: vẫn đỏ cảnh báo (tĩnh)");
    assert.ok(!c2.__calls.some((x) => x[0] === "set" && x[1] === "globalAlpha"),
      "reduced-motion: không được pulse (globalAlpha)");
  });
  it("wiring: 17-render HUD gọi Modes.drawHUD", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/game/17-render.js"), "utf8");
    assert.ok(src.includes("Modes.drawHUD"), "17-render.js HUD phải gọi Modes.drawHUD(ctx, W)");
  });
});

/* ================= M13: i18n (F12) ================= */
function moduleRegisterKeys(rel) {
  const p = path.join(ROOT, rel);
  assert.ok(fs.existsSync(p), `${rel} chưa tồn tại — dev tạo theo RFC DEV-05/DEV-07`);
  const src = fs.readFileSync(p, "utf8");
  const out = { vi: {}, en: {} };
  const re = /I18N\.register\(\{/g;
  let m;
  const sandbox = {
    I18N: { register(o) { Object.assign(out.vi, o.vi || {}); Object.assign(out.en, o.en || {}); } },
  };
  vm.createContext(sandbox);
  while ((m = re.exec(src))) {
    const body = extractBrace(src, src.indexOf("{", m.index));
    assert.ok(body, `ngoặc mất cân bằng ở I18N.register trong ${rel}`);
    vm.runInContext("I18N.register(" + body + ")", sandbox);
  }
  return out;
}
describe("modes/M13 (F12): i18n key mới qua I18N.register (vi+en), cấm vào js/i18n.js", () => {
  const TA_KEYS = ["mode.ta.name", "mode.ta.desc", "mode.ta.timeup_title", "mode.ta.hud", "mode.ta.new_record"];
  const BR_KEYS = ["mode.br.name", "mode.br.desc", "mode.br.rest_banner", "mode.br.victory_title", "mode.br.best_line", "mode.br.progress"];
  const MENU_KEYS = ["menu.mode.title", "menu.mode.ta", "menu.mode.ta_desc", "menu.mode.br", "menu.mode.br_desc", "menu.mode.locked_hint"];
  it("22-modes.js: đủ cặp vi/en cho 10 key mode.*", () => {
    const k = moduleRegisterKeys("js/game/22-modes.js");
    for (const key of [...TA_KEYS, ...BR_KEYS]) {
      assert.ok(k.vi[key], `thiếu vi["${key}"] trong js/game/22-modes.js`);
      assert.ok(k.en[key], `thiếu en["${key}"] trong js/game/22-modes.js`);
    }
  });
  it("menu.js: đủ cặp vi/en cho 6 key menu.mode.*", () => {
    const k = moduleRegisterKeys("js/menu.js");
    for (const key of MENU_KEYS) {
      assert.ok(k.vi[key], `thiếu vi["${key}"] trong js/menu.js`);
      assert.ok(k.en[key], `thiếu en["${key}"] trong js/menu.js`);
    }
  });
  it("js/i18n.js KHÔNG chứa key mới (RFC §0)", () => {
    const base = fs.readFileSync(path.join(ROOT, "js/i18n.js"), "utf8");
    for (const pat of ["mode.ta.", "mode.br.", "menu.mode."]) {
      assert.ok(!base.includes(pat), `js/i18n.js không được thêm key "${pat}*"`);
    }
  });
});

/* ================= M14: telemetry reason map ================= */
describe("modes/M14: telemetry — reason 'timeup' không làm vỡ map cause", () => {
  it("mapCause('timeup') trả string; mapping cũ giữ nguyên", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/game/20-telemetry.js"), "utf8");
    const m = src.match(/function\s+mapCause\s*\(reason\)/);
    assert.ok(m, "thiếu function mapCause trong 20-telemetry.js");
    const body = extractBrace(src, src.indexOf("{", m.index));
    assert.ok(body, "ngoặc mất cân bằng ở function mapCause");
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext("function mapCause(reason) " + body, ctx);
    const mc = ctx.mapCause;
    assert.equal(mc("window"), "window");
    assert.equal(mc("ship"), "enemy");
    const r = mc("timeup");
    assert.equal(typeof r, "string", "mapCause('timeup') phải trả string (dev thêm mapping theo RFC §2.3.1)");
    assert.ok(r.length > 0);
  });
});

/* ================= M15: QA-04 gates ================= */
describe("modes/M15 (QA-04): gate chung — build đồng bộ + SW stamp + MANIFEST", () => {
  it("node scripts/build-game.js --check xanh (bundle đồng bộ)", { timeout: 120000 }, () => {
    execFileSync("node", ["scripts/build-game.js", "--check"], { cwd: ROOT, timeout: 110000, stdio: "pipe" });
  });
  it("node scripts/bump-sw.js --check xanh (SW stamp sau mỗi DEV)", { timeout: 60000 }, () => {
    execFileSync("node", ["scripts/bump-sw.js", "--check"], { cwd: ROOT, timeout: 55000, stdio: "pipe" });
  });
  it("MANIFEST.txt có 22-modes.js sau 17-render.js", () => {
    const man = fs.readFileSync(path.join(ROOT, "js/game/MANIFEST.txt"), "utf8").split("\n");
    const i17 = man.indexOf("17-render.js"), i22 = man.indexOf("22-modes.js");
    assert.ok(i22 > 0, "MANIFEST.txt thiếu 22-modes.js");
    assert.ok(i17 > 0 && i22 > i17, "22-modes.js phải đứng sau 17-render.js trong MANIFEST");
  });
  it("mode mới không đụng hệ vệ tinh / chain-popups (R2 của lead)", () => {
    const ms = extractModesSrc();
    assert.ok(!ms.includes("04-satellite") && !/SatManager\s*\.\s*request/.test(ms),
      "Modes không được đụng hệ vệ tinh");
    assert.ok(!/chainpopup|ChainPopup/i.test(ms), "Modes không được đụng chain-popups");
  });
});

/* ================= M16 (§1.3): mode mới KHÔNG enter StageFX ================= */
describe("modes/M16 (§1.3): mode mới KHÔNG enter StageFX (mechanic ải chỉ thuộc campaign)", () => {
  function fxProbe(search) {
    const entered = [];
    // v2glue guard đọc window.StageFX/window.G nhưng gọi bare StageFX.enter → spy cả 2 chỗ
    const spy = { enter(...a) { entered.push(a); } };
    const { V2 } = bootV2(search, { G: {}, StageFX: spy }, { StageFX: spy, G: {} });
    return { V2, entered };
  }
  it("timeattack: V2.stageFxEnter() → StageFX.enter KHÔNG gọi", () => {
    const { V2, entered } = fxProbe("?mode=timeattack");
    assert.equal(V2.mode, "timeattack");
    assert.equal(V2.stageId, 0, "mode mới: stageId=0 (không ải)");
    assert.doesNotThrow(() => V2.stageFxEnter(), "stageFxEnter phải no-op, không throw");
    assert.equal(entered.length, 0, "timeattack không được enter StageFX (RFC §1.3)");
  });
  it("bossrush: V2.stageFxEnter() → StageFX.enter KHÔNG gọi", () => {
    const { V2, entered } = fxProbe("?mode=bossrush");
    assert.equal(V2.mode, "bossrush");
    assert.equal(V2.stageId, 0);
    assert.doesNotThrow(() => V2.stageFxEnter());
    assert.equal(entered.length, 0, "bossrush không được enter StageFX (RFC §1.3)");
  });
  it("control: ?stage=2 → stageFxEnter() gọi StageFX.enter(2, …) (campaign vẫn vào mechanic)", () => {
    const { V2, entered } = fxProbe("?stage=2");
    assert.equal(V2.stageId, 2);
    assert.doesNotThrow(() => V2.stageFxEnter());
    assert.equal(entered.length, 1, "campaign ải 2 phải enter StageFX như cũ");
    assert.equal(entered[0][0], 2, "enter đúng stageId=2");
  });
});

/* ================= M17 (P0/item 2): rest 5s Boss Rush qua update() thật =================
 * Không mock onBossDown đơn lẻ: chạy logic update() thật của 16-update.js trong VM,
 * chứng minh nhánh wave-break endless KHÔNG rò rỉ vào 5s rest giữa boss. */
describe("modes/M17 (P0): Boss Rush rest 5s qua update() thật — wave-break endless không rò rỉ", () => {
  function restEnv() {
    const env = modeEnv({
      V2: { mode: "bossrush", diffKey: "normal", profileId: "p1",
            br: { idx: 0, order: [1, 2, 3, 4, 5], restT: 0, won: false, t0: Date.now() } },
      G: { phase: "play", score: 0, time: 0, wave: 1, act: 1, kills: 0, waveKills: 0,
           combo: 0, comboT: 0, waveBreak: 0.5, spawnQueue: [], spawnT: 0, pendingSpawns: 0,
           enemies: [], ebullets: [], gems: [], bullets: [], pickups: [], floats: [], parts: [],
           boss: null,
           ship: { x: 400, y: 300, r: 14, hp: 3, maxHp: 5, speed: 260, magnet: 60 } },
      window: { outerWidth: 800, outerHeight: 600 }, // missing = 980-800 = 180px
    });
    const ctx = env.ctx;
    // update() đọc Modes thật (gating _blockWaves) + spy các hàm engine nó có thể gọi lén
    ctx.Modes = env.Modes; ctx.window.Modes = env.Modes;
    ctx.bounds = () => ({ x: 0, y: 0, w: 980, h: 720 });
    ctx.keys = {}; ctx.mouse = { down: false, x: 400, y: 300 };
    ctx.touchAim = () => null; ctx.touchMoveVec = () => null;
    env.rec.waves = []; env.rec.bossSpawns = [];
    ctx.startWave = (n) => env.rec.waves.push(n);
    ctx.spawnBoss = () => env.rec.bossSpawns.push(1);
    const updSrc = extractFunctionDecl(gameSrc(), "update");
    vm.runInContext(updSrc, ctx, { filename: "16-update.update" });
    return env;
  }
  it("sau rest 5s: hp chỉ +1, growWindow đúng 1 lần (54,41), không startWave/spawnBoss chen ngang, boss_2 đúng hẹn", () => {
    const env = restEnv();
    const { Modes, V2, G, rec } = env;
    Modes.startBossRush();
    assert.equal(rec.bossesStarted.length, 1, "boss_1 spawn lúc mở màn");
    assert.equal(rec.bossesStarted[0][0], 1);
    Modes.onBossDown({ stageId: 1 });
    assert.equal(V2.br.restT, 5, "nghỉ 5s giữa boss");
    assert.equal(G.ship.hp, 4, "+1 HP từ onBossDown");
    assert.deepEqual(rec.grow, [[54, 41]], "sửa 30% missing (180px) đúng 1 lần qua growWindow");
    // chạy 6s game-time qua update() THẬT (mỗi tick gọi Modes.tickTimer như engine)
    for (let t = 0; t < 6; t += 0.25) vm.runInContext("update(0.25)", env.ctx);
    assert.equal(G.ship.hp, 4, "P0: rest không được cộng HP thừa (wave-break endless rò rỉ)");
    assert.deepEqual(rec.grow, [[54, 41]], "P0: rest không được sửa cửa sổ thừa");
    assert.equal(rec.waves.length, 0, "P0: không startWave nào chen ngang trong 5s rest");
    assert.equal(rec.bossSpawns.length, 0, "P0: không spawnBoss (endless) nào chen ngang trong 5s rest");
    assert.equal(V2.br.restT, 0, "rest 5s đã trôi qua hết");
    assert.equal(rec.bossesStarted.length, 2, "hết rest → boss kế spawn đúng hẹn");
    assert.equal(rec.bossesStarted[1][0], 2, "boss_2 đúng thứ tự");
    assert.equal(V2.br.idx, 1);
  });
});
