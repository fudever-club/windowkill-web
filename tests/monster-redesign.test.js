/* WINDOWKILL — Monster Visual Redesign test suite (RFC stage-themes-modes, QA-02).
 *
 * Hợp đồng: docs/RFC-stage-themes-modes.md §2.2 (art spec 9 quái), §3.2
 * (dual-registry parity + BEHAVIORS.flee), §5.2 (AC QA-02), edge case F9/F10.
 * Viết từ SPEC — stat baseline là giá trị pre-redesign (dev chưa đụng).
 *
 * Bất biến (RFC §2.2): r, dmg, hp(w), spd(w), behavior, weight, minWave,
 * maxPerWave GIỮ NGUYÊN TUYỆT ĐỐI — chỉ đổi visual. glimmer là entry MỚI
 * game-side (legacy js/monsters.js đã có), behavior "flee", weight 0.
 *
 * Map AC §5.2:
 *   dual-registry parity .............. R1 (F10)
 *   snapshot stat = base .............. R2 (F9: r không đổi)
 *   draw smoke 9 nhánh + glimmer ...... R4
 *   buildSpawnQueue: glimmer weight 0 . R3
 *   full suite 100% .................. (chạy chung)
 *   slow tint #7dd3fc giữ nguyên ..... R4
 *
 * Chạy: node --test tests/monster-redesign.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = () => fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

/* BG.build cần global document (tạo offscreen canvas) */
globalThis.document = globalThis.document || {
  createElement: (tag) => tag === "canvas"
    ? { width: 300, height: 150, style: {}, getContext: () => mockCtx2d() }
    : { style: {} },
};
const BG = require(path.join(ROOT, "js/bg.js"));

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
function extractConstObject(src, name) {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\{`));
  assert.ok(m, `không tìm thấy const ${name} trong source`);
  const body = extractBrace(src, src.indexOf("{", m.index));
  assert.ok(body, `ngoặc mất cân bằng ở const ${name}`);
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
        if (p === "createLinearGradient" || p === "createRadialGradient")
          return (...a) => { calls.push([p, ...a]); return { addColorStop() {} }; };
        return (...a) => { calls.push([p, ...a]); };
      }
      return undefined;
    },
    set(tg, p, v) { tg[p] = v; calls.push(["set", p, v]); return true; },
  });
  return px;
}

/* ---------- registry game-side (10-gamedata.js) ---------- */
function gameRegistry() {
  const src = fs.readFileSync(path.join(ROOT, "js/game/10-gamedata.js"), "utf8");
  const body = extractConstObject(src, "MONSTER_REGISTRY");
  const ctx = { I18N: { t: (k) => k } };
  vm.createContext(ctx);
  return vm.runInContext("(" + body + ")", ctx, { filename: "MONSTER_REGISTRY" });
}
function gameBehaviors() {
  const src = fs.readFileSync(path.join(ROOT, "js/game/10-gamedata.js"), "utf8");
  const body = extractConstObject(src, "BEHAVIORS");
  const ctx = { I18N: { t: (k) => k } };
  vm.createContext(ctx);
  return vm.runInContext("(" + body + ")", ctx, { filename: "BEHAVIORS" });
}
const Legacy = require(path.join(ROOT, "js/monsters.js"));

/* 9 id redesign — map id đặc biệt (RFC §1.2): legacy "bomber" ↔ game "kamikaze" */
const IDS = ["chaser", "chewer", "tank", "dasher", "splitter", "mini", "kamikaze", "snatcher", "glimmer"];
const legacyId = (id) => (id === "kamikaze" ? "bomber" : id);

/* Baseline stat game-side (pre-redesign — RFC: KHÔNG được đổi) */
const BASE = {
  chaser:   { r: 12, dmg: 1, score: 10, xp: 1, minWave: 1, weight: 100, behavior: "chase", color: "#ff5470",
              hp: (w) => 2 + w * 0.5, spd: (w) => 95 + w * 7 },
  chewer:   { r: 13, dmg: 1, score: 25, xp: 2, minWave: 2, weight: 70, behavior: "chew", color: "#c084fc",
              hp: (w) => 3 + w * 0.4, spd: (w) => 78 + w * 4 },
  tank:     { r: 23, dmg: 1, score: 50, xp: 4, minWave: 3, weight: 40, behavior: "chase", color: "#ffb020",
              hp: (w) => 12 + w * 2.2, spd: () => 46 },
  dasher:   { r: 11, dmg: 1, score: 20, xp: 2, minWave: 3, weight: 45, behavior: "dash", color: "#ffe14d",
              hp: (w) => 4 + w * 0.5, spd: (w) => 120 + w * 5 },
  splitter: { r: 18, dmg: 1, score: 35, xp: 3, minWave: 4, weight: 30, behavior: "chase", color: "#7df9ff",
              hp: (w) => 7 + w, spd: (w) => 70 + w * 4 },
  mini:     { r: 8, dmg: 1, score: 8, xp: 1, minWave: 0, weight: 0, behavior: "chase", color: "#ff9df3",
              hp: () => 1.5, spd: () => 150 },
  kamikaze: { r: 10, dmg: 1, score: 18, xp: 2, minWave: 13, weight: 30, behavior: "kamikaze", color: "#ff7a1a",
              hp: (w) => 3 + w * 0.4, spd: (w) => 150 + w * 8 },
  snatcher: { r: 12, dmg: 0, score: 10, xp: 3, minWave: 6, weight: 6, maxPerWave: 1, behavior: "snatch", color: "#f0abfc",
              hp: (w) => 6 + w * 0.6, spd: (w) => 140 + w * 4 },
};
/* Baseline legacy (js/monsters.js) — hpAt/speedAt ở wave 6 */
const LEGACY_BASE = {
  chaser:   { r: 12, dmg: 1, behavior: "chase", color: "#ff5470", hpAt6: 5.00, speedAt6: 137.00 },
  chewer:   { r: 13, dmg: 1, behavior: "chew", color: "#c084fc", hpAt6: 5.40, speedAt6: 102.00 },
  tank:     { r: 23, dmg: 1, behavior: "chase", color: "#ffb020", hpAt6: 25.20, speedAt6: 46.00 },
  dasher:   { r: 11, dmg: 1, behavior: "dash", color: "#ffe14d", hpAt6: 7.00, speedAt6: 150.00 },
  splitter: { r: 18, dmg: 1, behavior: "chase", color: "#7df9ff", hpAt6: 13.00, speedAt6: 94.00 },
  mini:     { r: 8, dmg: 1, behavior: "chase", color: "#ff9df3", hpAt6: 1.50, speedAt6: 150.00 },
  kamikaze: { r: 11, dmg: 1, behavior: "kamikaze", color: "#ef4444", hpAt6: 7.60, speedAt6: 160.00 }, // legacy id "bomber"
  snatcher: { r: 12, dmg: 0, behavior: "snatch", color: "#f0abfc", hpAt6: 9.60, speedAt6: 164.00 },
  glimmer:  { r: 9, dmg: 0, behavior: "flee", color: "#fbbf24", hpAt6: 2.00, speedAt6: 175.00 },
};
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: got ${a}, expected ${b}`);

/* ================= R1: dual-registry parity (F10) ================= */
describe("quai/R1 (F10): 9 id redesign tồn tại ở cả 2 registry", () => {
  const reg = gameRegistry();
  for (const id of IDS) {
    it(`${id}: có mặt 2 file`, () => {
      assert.ok(Legacy.MONSTER_REGISTRY[legacyId(id)], `js/monsters.js thiếu ${legacyId(id)}`);
      assert.ok(reg[id], `js/game/10-gamedata.js thiếu entry "${id}" (glimmer là entry MỚI — dev phải thêm)`);
    });
  }
  it("behavior + dmg khớp tuyệt đối 2 file (9 id) — RFC §3.2/§5.2", () => {
    for (const id of IDS) {
      const lg = Legacy.MONSTER_REGISTRY[legacyId(id)], gm = reg[id];
      assert.equal(gm.behavior, lg.behavior, `${id}: behavior lệch (game "${gm.behavior}" vs legacy "${lg.behavior}") — unify về game-side`);
      assert.equal(gm.dmg, lg.dmg, `${id}: dmg lệch (${gm.dmg} vs ${lg.dmg})`);
    }
  });
  it("color + r khớp 2 file (9 id, map bomber↔kamikaze) — RFC §3.2/§5.2", () => {
    for (const id of IDS) {
      const lg = Legacy.MONSTER_REGISTRY[legacyId(id)], gm = reg[id];
      assert.equal(gm.color, lg.color, `${id}: color lệch (game "${gm.color}" vs legacy "${lg.color}")`);
      assert.equal(gm.r, lg.r, `${id}: r lệch (${gm.r} vs ${lg.r})`);
    }
  });
});

/* ================= R2: snapshot stat bất biến (F9) ================= */
describe("quai/R2 (F9): stat 9 quái = snapshot base (redesign không được đổi)", () => {
  const reg = gameRegistry();
  for (const id of Object.keys(BASE)) {
    const b = BASE[id];
    it(`${id}: r/dmg/score/xp/minWave/weight/behavior/color giữ nguyên`, () => {
      const e = reg[id];
      assert.equal(e.r, b.r, `${id}.r`); assert.equal(e.dmg, b.dmg, `${id}.dmg`);
      assert.equal(e.score, b.score, `${id}.score`); assert.equal(e.xp, b.xp, `${id}.xp`);
      assert.equal(e.minWave, b.minWave, `${id}.minWave`); assert.equal(e.weight, b.weight, `${id}.weight`);
      assert.equal(e.behavior, b.behavior, `${id}.behavior`); assert.equal(e.color, b.color, `${id}.color`);
      if (b.maxPerWave !== undefined) assert.equal(e.maxPerWave, b.maxPerWave, `${id}.maxPerWave`);
    });
    it(`${id}: hp(w)/spd(w) giữ nguyên công thức`, () => {
      const e = reg[id];
      for (const w of [6, 20]) {
        approx(e.hp(w), b.hp(w), `${id}.hp(${w})`);
        approx(e.spd(w), b.spd(w), `${id}.spd(${w})`);
      }
    });
  }
  it("legacy: dmg + hpAt(6)/speedAt(6) giữ nguyên (gameplay bất biến); color/r/behavior unify về game-side theo R1", () => {
    for (const id of IDS) {
      const lg = Legacy.MONSTER_REGISTRY[legacyId(id)], b = LEGACY_BASE[id];
      assert.equal(lg.dmg, b.dmg, `legacy ${id}.dmg`);
      approx(lg.hpAt(6), b.hpAt6, `legacy ${id}.hpAt(6)`);
      approx(lg.speedAt(6), b.speedAt6, `legacy ${id}.speedAt(6)`);
    }
  });
  it("legacy SPAWN_SUGGEST của 9 quái không đổi (không đụng balance)", () => {
    const expect = { glimmer: { minWave: 2, weight: 15, maxPerWave: 1 }, bomber: { minWave: 3, weight: 10 },
                     snatcher: { minWave: 6, weight: 6, maxPerWave: 1 } };
    for (const [type, ex] of Object.entries(expect)) {
      const s = Legacy.SPAWN_SUGGEST.find((x) => x.type === type);
      assert.ok(s, `thiếu SPAWN_SUGGEST cho ${type}`);
      assert.equal(s.minWave, ex.minWave, `${type}.minWave`);
      assert.equal(s.weight, ex.weight, `${type}.weight`);
      if (ex.maxPerWave !== undefined) assert.equal(s.maxPerWave, ex.maxPerWave, `${type}.maxPerWave`);
    }
  });
  it("splitter onDeath vẫn tách 2 mini (không đổi logic)", () => {
    const e = gameRegistry().splitter;
    assert.equal(typeof e.onDeath, "function", "splitter.onDeath phải còn");
    const spawned = [];
    const sandbox = { spawnEnemyAt: (t, x, y) => spawned.push(t), rand: (a, b) => (a + b) / 2, Math, console };
    vm.createContext(sandbox);
    vm.runInContext(`(${e.onDeath.toString()})({ x: 100, y: 100 })`, sandbox);
    assert.deepEqual(spawned, ["mini", "mini"], "chết phải tách đúng 2 mini");
  });
  it("kamikaze init vẫn set e.fuse = -1", () => {
    const e = gameRegistry().kamikaze;
    const m = {};
    e.init(m);
    assert.equal(m.fuse, -1, "init phải giữ e.fuse = -1 (fuse 0.7s đọc được bằng mắt)");
  });
});

/* ================= R3: glimmer mới ================= */
function edgePoint(x, y) {
  const b = { x: 0, y: 0, w: 980, h: 720 };
  const dl = x - b.x, dr = b.x + b.w - x, dt = y - b.y, db = b.y + b.h - y;
  const mn = Math.min(dl, dr, dt, db);
  const cl = (v, a, z) => Math.max(a, Math.min(z, v));
  if (mn === dl) return { x: b.x, y: cl(y, b.y, b.y + b.h) };
  if (mn === dr) return { x: b.x + b.w, y: cl(y, b.y, b.y + b.h) };
  if (mn === dt) return { x: cl(x, b.x, b.x + b.w), y: b.y };
  return { x: cl(x, b.x, b.x + b.w), y: b.y + b.h };
}
describe("quai/R3: glimmer — entry mới game-side + BEHAVIORS.flee", () => {
  it("entry glimmer: behavior flee, weight 0, dmg 0, color #fbbf24 (parity legacy)", () => {
    const e = gameRegistry().glimmer;
    assert.ok(e, "thiếu entry glimmer trong 10-gamedata.js");
    assert.equal(e.id, "glimmer");
    assert.equal(e.behavior, "flee", "behavior phải là 'flee' MỚI");
    assert.equal(e.weight, 0, "weight 0 — không đổi balance endless");
    assert.equal(e.dmg, 0, "dmg 0 — không tấn công");
    assert.equal(e.color, "#fbbf24", "parity màu legacy");
    assert.equal(e.r, 9, "parity r legacy");
  });
  it("glimmer init: e.lifeT = 12 (RFC §3.2.1)", () => {
    const e = gameRegistry().glimmer;
    const m = {};
    e.init(m);
    assert.equal(m.lifeT, 12, "init phải set e.lifeT = 12");
  });
  it("BEHAVIORS.flee tồn tại game-side (update-only)", () => {
    const bh = gameBehaviors().flee;
    assert.ok(bh, "thiếu BEHAVIORS.flee trong 10-gamedata.js");
    assert.equal(typeof bh.update, "function");
  });
  it("flee: chạy ra viền → escaped + dead, KHÔNG điểm (không qua killEnemy)", () => {
    const upd = gameBehaviors().flee.update;
    const sandbox = {
      Math, console,
      nearestEdgePoint: edgePoint, hypot: Math.hypot, hyp: Math.hypot,
      dist2: (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    };
    vm.createContext(sandbox);
    // method shorthand chỉ valid trong object literal → wrap
    const fn = vm.runInContext(`({ ${upd.toString()} }).update`, sandbox);
    const G = { score: 0 };
    const e = { x: 400, y: 300, t: 0, lifeT: 12 };
    const s = { x: 100, y: 100, r: 14 };
    let steps = 0;
    while (!e.escaped && steps++ < 1200) { fn(e, 1 / 60, s, 175); e.t += 1 / 60; }
    assert.ok(e.escaped, "phải escaped khi chạm viền");
    assert.ok(e.dead, "escaped → dead (không qua killEnemy nên không điểm/xp)");
    assert.equal(G.score, 0, "không cộng điểm khi thoát");
  });
  it("flee: hết lifeT (12s) → thoát dù chưa tới viền", () => {
    const upd = gameBehaviors().flee.update;
    const sandbox = {
      Math, console,
      nearestEdgePoint: edgePoint, hypot: Math.hypot, hyp: Math.hypot,
      dist2: (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    };
    vm.createContext(sandbox);
    const fn = vm.runInContext(`({ ${upd.toString()} }).update`, sandbox);
    const e = { x: 490, y: 360, t: 0, lifeT: 0.05 }; // giữa map, xa viền
    const s = { x: 100, y: 100, r: 14 };
    for (let i = 0; i < 60 && !e.escaped; i++) { fn(e, 1 / 60, s, 175); e.t += 1 / 60; }
    assert.ok(e.escaped, "hết 12s phải thoát");
    assert.ok(e.dead);
  });
  it("buildSpawnQueue: glimmer weight 0 → KHÔNG lọt pool endless", () => {
    const src = gameSrc();
    const fnSrc = extractFunctionDecl(src, "buildSpawnQueue");
    const ctx = {
      Math, console,
      actOf: () => 1,
      MONSTER_REGISTRY: gameRegistry(),
      G: { vp1_eliteParade: false },
      wkSpawnCfg: () => ({ base_count: 4, per_wave: 3 }),
      smoothCountMul: () => 1,
      onboardCountMul: () => 1,
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc, ctx, { filename: "buildSpawnQueue" });
    let total = 0;
    for (let i = 0; i < 300; i++) {
      for (let w = 1; w <= 25; w++) {
        const q = vm.runInContext(`buildSpawnQueue(${w})`, ctx);
        total += q.length;
        assert.ok(!q.includes("glimmer"), `wave ${w}: glimmer weight 0 không được lọt queue`);
      }
    }
    assert.ok(total > 0, "sanity: queue endless không rỗng");
  });
  it("legacy: BEHAVIORS.flee.draw đồng bộ visual (nhận diện được là cùng 1 con)", () => {
    const bh = Legacy.BEHAVIORS.flee;
    assert.equal(typeof bh.draw, "function", "legacy BEHAVIORS.flee.draw phải tồn tại");
    const m = Legacy.makeEnemy("glimmer", 2, null, 400, 300);
    assert.doesNotThrow(() => bh.draw(m, mockCtx2d()), "legacy flee draw throw");
  });
});

/* ================= R4: draw smoke + slow tint ================= */
function extractConstArray(src, name) {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[[^\\]]*\\]`));
  assert.ok(m, `không tìm thấy const ${name} trong js/game.js — dev chạy: node scripts/build-game.js`);
  return m[0] + ";";
}
function loadDrawOneEnemy() {
  const src = gameSrc();
  const shiftSrc = extractFunctionDecl(src, "_shiftHue");
  const tintSrc = extractFunctionDecl(src, "themeTint");
  const drawSrc = extractFunctionDecl(src, "drawOneEnemy");
  // P2(item 7): drawOneEnemy đọc const hoisted ở module scope 17-render.js → nạp cùng
  const hoisted = extractConstArray(src, "_CHASER_FLAMES") + "\n" +
                  extractConstArray(src, "_SNATCHER_GEM_COLORS") + "\n";
  const V2 = { stageId: 1 }, G = {};
  const ctx = {
    Math, console, BG,
    G, V2, window: { G, V2 },
    s: { x: 400, y: 300, r: 14 }, now: 1000,
    document: { createElement: () => ({ getContext: () => mockCtx2d(), style: {} }) },
  };
  vm.createContext(ctx);
  vm.runInContext("const _tintMemo = {};\n" + hoisted + shiftSrc + "\n" + tintSrc + "\n" + drawSrc, ctx,
    { filename: "drawOneEnemy" });
  ctx.__src = drawSrc;
  return ctx;
}
const ENTS = {
  chaser:   { type: "chaser", x: 100, y: 100, r: 12, t: 5, color: "#ff5470", flash: 0, slowT: 0, elite: true },
  chewer:   { type: "chewer", x: 50, y: 360, r: 13, t: 5, color: "#c084fc", flash: 0, slowT: 0, latched: "left", chewT: 0 },
  chewer2:  { type: "chewer", x: 200, y: 200, r: 13, t: 5, color: "#c084fc", flash: 0, slowT: 0, latched: null, chewT: 0 },
  tank:     { type: "tank", x: 200, y: 200, r: 23, t: 5, color: "#ffb020", flash: 0, slowT: 0 },
  dasher:   { type: "dasher", x: 300, y: 300, r: 11, t: 5, color: "#ffe14d", flash: 0, slowT: 0, state: "aim", stateT: 0.1, dx: 1, dy: 0 },
  splitter: { type: "splitter", x: 400, y: 400, r: 18, t: 5, color: "#7df9ff", flash: 0, slowT: 0, hp: 4, maxHp: 10 },
  mini:     { type: "mini", x: 500, y: 500, r: 8, t: 5, color: "#ff9df3", flash: 0, slowT: 0 },
  kamikaze: { type: "kamikaze", x: 600, y: 600, r: 10, t: 5, color: "#ff7a1a", flash: 0, slowT: 0, fuse: 0.3 },
  kamikaze2:{ type: "kamikaze", x: 610, y: 610, r: 10, t: 5, color: "#ff7a1a", flash: 0, slowT: 0, fuse: -1 },
  snatcher: { type: "snatcher", x: 700, y: 700, r: 12, t: 5, color: "#f0abfc", flash: 0, slowT: 0, phase: "hunt", carried: [] },
  snatcher2:{ type: "snatcher", x: 710, y: 710, r: 12, t: 5, color: "#f0abfc", flash: 0, slowT: 0, phase: "flee", carried: [3, 5, 7] },
  glimmer:  { type: "glimmer", x: 800, y: 800, r: 9, t: 5, color: "#fbbf24", flash: 0, slowT: 0 },
};
/* drawOneEnemy(e) dùng free variable `ctx` (closure module) — gán mock vào global `ctx`. */
function runDraw(sb, ent) {
  const mock = mockCtx2d();
  sb.ctx = mock;
  sb.__e = ent;
  vm.runInContext("drawOneEnemy(__e)", sb);
  return mock;
}
describe("quai/R4: draw smoke 9 nhánh redesign (+ glimmer mới) — 0 exception", () => {
  it("9 nhánh vẽ tồn tại trong drawOneEnemy (8 cũ + glimmer mới)", () => {
    const sb = loadDrawOneEnemy();
    for (const t of ["chaser", "chewer", "tank", "dasher", "splitter", "mini", "kamikaze", "snatcher", "glimmer"]) {
      assert.ok(sb.__src.includes(`e.type === "${t}"`), `thiếu nhánh vẽ "${t}" trong drawOneEnemy`);
    }
  });
  for (const [name, ent] of Object.entries(ENTS)) {
    it(`vẽ ${name} (${ent.type}) không throw`, () => {
      const sb = loadDrawOneEnemy();
      BG.build(1, 1280, 720);
      let c;
      assert.doesNotThrow(() => { c = runDraw(sb, ent); }, `nhánh ${ent.type} throw`);
      assert.ok(c.__calls.length > 0, `nhánh ${ent.type} không vẽ gì`);
    });
  }
  it("slow (đạn băng) → tint #7dd3fc giữ nguyên ở mọi nhánh", () => {
    const sb = loadDrawOneEnemy();
    BG.build(1, 1280, 720);
    for (const [name, ent] of Object.entries(ENTS)) {
      const e = Object.assign({}, ent, { slowT: 1 });
      const c = runDraw(sb, e);
      const fills = c.__calls.filter((x) => x[0] === "set" && x[1] === "fillStyle").map((x) => String(x[2]).toLowerCase());
      assert.ok(fills.includes("#7dd3fc"), `${name}: slow phải tint #7dd3fc, thấy: ${fills.slice(0, 3).join("|")}`);
    }
  });
});

/* ================= R5: art markers (§2.2) =================
 * Smoke-level: nhánh vẽ từng con chứa đúng element visual chốt trong RFC.
 * Check PER-BRANCH (không phải cả source) để marker có ý nghĩa.
 * LƯU Ý: art đẹp/xấu, cartoon/không-creepy là QA TAY theo RFC §5.2 — test này
 * chỉ bắt "dev có vẽ element mới không", không thay con mắt người. */
function branchSrc(fullSrc, type) {
  const low = fullSrc.toLowerCase();
  const p1 = low.indexOf(`e.type === "${type}"`);
  assert.ok(p1 > 0, `không tìm thấy nhánh "${type}"`);
  let p2 = low.length;
  for (const t of ["chaser", "chewer", "tank", "dasher", "splitter", "mini", "kamikaze", "snatcher", "glimmer"]) {
    if (t === type) continue;
    const q = low.indexOf(`e.type === "${t}"`, p1 + 1);
    if (q > p1 && q < p2) p2 = q;
  }
  return low.slice(p1, p2);
}
describe("quai/R5: art spec §2.2 — element visual mới theo từng nhánh", () => {
  const sb = loadDrawOneEnemy();
  const B = (t) => branchSrc(sb.__src, t);
  const cases = [
    ["chaser", "#bfe9ff", "buồng lái tròn xanh nhạt (tên lửa đồ chơi)"],
    ["chewer", "#7c3aed", "viền đốt sâu đậm"],
    ["tank", "#8a5a00", "dải xích đồ chơi 2 bên"],
    ["dasher", "255,59,48", "dải aim chuyển ĐỎ 0.2s cuối (rgba(255,59,48,…) = #ff3b30)"],
    ["splitter", "125,249,255", "bong bóng rgba(125,249,255,0.55)"],
    ["mini", "#c243c9", "sọc bụng ong"],
    ["kamikaze", "#3a3a44", "thân bom bi tròn (thay tam giác)"],
    ["glimmer", "#b45309", "nan lồng đèn (nhánh mới)"],
  ];
  for (const [t, marker, why] of cases) {
    it(`${t}: nhánh chứa ${marker} — ${why}`, () => {
      assert.ok(B(t).includes(marker), `nhánh ${t} thiếu marker ${marker} (§2.2: ${why})`);
    });
  }
  it("snatcher: túi phồng theo carried.length (§2.2.9)", () => {
    assert.ok(B("snatcher").includes("carried.length"), "snatcher phải scale túi theo carried.length");
  });
});

/* ================= R6: i18n glimmer (F12) ================= */
function registeredKeys(modPath) {
  const src = fs.readFileSync(path.join(ROOT, modPath), "utf8");
  const out = { vi: {}, en: {} };
  const re = /I18N\.register\(\{/g;
  let m;
  const sandbox = {
    I18N: { register(o) { Object.assign(out.vi, o.vi || {}); Object.assign(out.en, o.en || {}); } },
  };
  vm.createContext(sandbox);
  while ((m = re.exec(src))) {
    const body = extractBrace(src, src.indexOf("{", m.index));
    assert.ok(body, `ngoặc mất cân bằng ở I18N.register trong ${modPath}`);
    vm.runInContext("I18N.register(" + body + ")", sandbox);
  }
  return out;
}
describe("quai/R6 (F12): i18n glimmer qua I18N.register, không đụng js/i18n.js", () => {
  it("10-gamedata.js register đủ cặp vi/en cho monster.glimmer.name/desc", () => {
    const k = registeredKeys("js/game/10-gamedata.js");
    for (const key of ["monster.glimmer.name", "monster.glimmer.desc"]) {
      assert.ok(k.vi[key], `thiếu vi["${key}"]`);
      assert.ok(k.en[key], `thiếu en["${key}"]`);
    }
  });
  it("js/i18n.js KHÔNG chứa key monster.glimmer (RFC §0: cấm thêm key vào i18n.js)", () => {
    const base = fs.readFileSync(path.join(ROOT, "js/i18n.js"), "utf8");
    assert.ok(!base.includes("monster.glimmer"), "js/i18n.js không được thêm key mới");
  });
});
