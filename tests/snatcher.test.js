/* WINDOWKILL — test quái mới "snatcher" — TRỘM VẶT CHẠY LÀNG (RFC nest-removal, 2026-10-17).
 *
 * Quái đầu tiên "cướp" thay vì "giết": lao vào gem gần nhất, ôm tối đa 3 viên
 * rồi chạy thục mạng ra viền. Giết khi đang ôm → gem văng ra đòi lại hết.
 * Trốn thoát → gem mất, không điểm.
 *
 * Test 2 tầng (theo kiến trúc repo):
 *  - Tầng A (js/monsters.js): registry bestiary + BEHAVIORS.snatch + STRINGS + SPAWN_SUGGEST.
 *    Chạy trực tiếp bằng require() (module an toàn khi thiếu global game).
 *  - Tầng B (js/game.js bundle — code thật chạy trong game): entry game-side,
 *    BEHAVIORS.snatch game-side, releaseSnatcherGems, onDeath wiring, buildSpawnQueue.
 *    Trích source thật từ bundle bằng brace-matching rồi eval với mock tối thiểu.
 *    LƯU Ý: tầng B chỉ xanh sau khi dev chạy `node scripts/build-game.js` rebuild bundle.
 *
 * Map với acceptance criteria RFC §5.3:
 *   #1 registry entry hợp lệ ............ A1 (+ B1 game-side)
 *   #2 wave gate (spawnWeights 5/6) ...... A2
 *   #3 steal ............................ A5 (+ B2 game-side)
 *   #4 đủ 3 gem → flee ................... A6 (+ B2)
 *   #5 escape → gem mất, không điểm ...... A7 (+ B3)
 *   #6 kill → scatter giữ v .............. B4 + B5 (death-path chung, edge case 7)
 *   #7 dmg = 0, va chạm tàu không trừ HP .. A9 (+ B1)
 *   #8 maxPerWave = 1 trong buildSpawnQueue  A2 (+ B6 runtime 200 queue)
 *
 * Chạy: node --test tests/snatcher.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const Monsters = require(path.join(ROOT, "js/monsters.js"));
const gameSrc = () => fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

/* boundsOf() trong monsters.js fallback {x:0,y:0,w:960,h:600} khi thiếu global;
 * đặt tường minh để sim determinist. */
globalThis.bounds = () => ({ x: 0, y: 0, w: 980, h: 720 });

const SNATCH_KEYS = [
  "monster.snatcher.name",
  "monster.snatcher.counter",
  "monster.snatcher.steal",
  "monster.snatcher.caught",
  "monster.snatcher.escaped",
];

/* ================= TẦNG A — js/monsters.js ================= */

describe("snatcher/A1: registry entry đúng schema RFC §3.2", () => {
  const d = Monsters.MONSTER_REGISTRY.snatcher;
  it("entry tồn tại", () => {
    assert.ok(d, "thiếu MONSTER_REGISTRY.snatcher trong js/monsters.js");
  });
  it("đúng stats", () => {
    assert.equal(d.id, "snatcher");
    assert.equal(d.nameVi, "Trộm Vặt Chạy Làng");
    assert.equal(d.role, "cướp gem");
    assert.equal(d.color, "#f0abfc");
    assert.equal(d.shape, "tên trộm túi vải + mặt nạ");
    assert.equal(d.r, 12);
    assert.equal(d.dmg, 0);
    assert.equal(d.xp, 3);
    assert.equal(d.gems, 40);
    assert.equal(d.behavior, "snatch");
    assert.equal(d.debutWave, 6);
    assert.equal(d.maxPerWave, 1);
  });
  it("hpAt/speedAt đúng công thức", () => {
    assert.equal(typeof d.hpAt, "function");
    assert.equal(typeof d.speedAt, "function");
    assert.equal(d.hpAt(6), 6 + 6 * 0.6, "wave 6: 9.6 HP");
    assert.equal(d.speedAt(6), 140 + 6 * 4, "wave 6: 164 speed");
  });
  it("có debutHint/weakness/counter", () => {
    assert.ok(d.debutHintVi && d.debutHintVi.includes("viền"), "debutHintVi phải nhắc chặn đầu hướng viền");
    assert.ok(d.weaknessVi && d.weaknessVi.includes("Máu 6"), "weaknessVi phải ghi Máu 6");
    assert.ok(d.counterVi && d.counterVi.includes("viền"), "counterVi phải ghi chặn đầu đường ra viền");
  });
});

describe("snatcher/A2: wave gate + SPAWN_SUGGEST", () => {
  it("spawnWeights(5) KHÔNG chứa snatcher; spawnWeights(6) chứa", () => {
    assert.ok(!Monsters.spawnWeights(5).some((s) => s.type === "snatcher"),
      "snatcher debut wave 6 — wave 5 không được spawn");
    const w6 = Monsters.spawnWeights(6).find((s) => s.type === "snatcher");
    assert.ok(w6, "spawnWeights(6) phải chứa snatcher");
    assert.equal(w6.weight, 6);
    assert.equal(w6.maxPerWave, 1, "maxPerWave = 1");
  });
  it("SPAWN_SUGGEST có entry đúng {minWave:6, weight:6, maxPerWave:1}", () => {
    const s = Monsters.SPAWN_SUGGEST.find((e) => e.type === "snatcher");
    assert.ok(s, "thiếu SPAWN_SUGGEST entry cho snatcher");
    assert.equal(s.minWave, 6);
    assert.equal(s.weight, 6);
    assert.equal(s.maxPerWave, 1);
  });
});

describe("snatcher/A3: STRINGS i18n vi+en đủ 5 key", () => {
  for (const k of SNATCH_KEYS) {
    it(`có cặp vi/en cho "${k}"`, () => {
      assert.ok(Monsters.STRINGS.vi[k], `thiếu STRINGS.vi["${k}"]`);
      assert.ok(Monsters.STRINGS.en[k], `thiếu STRINGS.en["${k}"]`);
    });
  }
  it("đúng text float theo spec", () => {
    assert.equal(Monsters.STRINGS.vi["monster.snatcher.steal"], "CƯỚP ĐÂY! 😈");
    assert.equal(Monsters.STRINGS.vi["monster.snatcher.caught"], "ĐÒI LẠI ĐƯỢC! 💎");
    assert.equal(Monsters.STRINGS.vi["monster.snatcher.escaped"], "MẤT GEM RỒI! 😭");
  });
});

describe("snatcher/A4: BEHAVIORS.snatch + init state", () => {
  it("BEHAVIORS.snatch tồn tại với init/update/draw", () => {
    const bh = Monsters.BEHAVIORS.snatch;
    assert.ok(bh, "thiếu BEHAVIORS.snatch trong js/monsters.js");
    assert.equal(typeof bh.init, "function");
    assert.equal(typeof bh.update, "function");
    assert.equal(typeof bh.draw, "function");
  });
  it("makeEnemy init đúng state machine", () => {
    const m = Monsters.makeEnemy("snatcher", 6, null, 400, 300);
    assert.ok(m, "makeEnemy trả null");
    assert.equal(m.phase, "hunt");
    assert.deepEqual(m.carried, []);
    assert.equal(m.idleT, 0);
    assert.equal(m.escaped, false);
    assert.equal(m.dmg, 0);
  });
});

function mkG(ship, gems) {
  return {
    ship: ship || { x: 100, y: 100, r: 14, hp: 5, maxHp: 5 },
    gems: gems || [],
    enemies: [],
    score: 0,
    wave: 6,
  };
}

describe("snatcher/A5: steal — lao vào gem, cướp, giữ nguyên v", () => {
  it("gem rời G.gems, carried tăng, v giữ nguyên", () => {
    const m = Monsters.makeEnemy("snatcher", 6, null, 400, 300);
    const G = mkG(null, [{ x: 430, y: 300, vx: 0, vy: 0, v: 3, t: 0 }]);
    const upd = Monsters.BEHAVIORS.snatch.update;
    let steps = 0;
    while (G.gems.length && steps++ < 600) { upd(m, 1 / 60, G); m.t += 1 / 60; }
    assert.equal(G.gems.length, 0, "gem phải bị cướp khỏi G.gems");
    assert.equal(m.carried.length, 1, "carried phải tăng 1");
    assert.equal(m.carried[0], 3, "v gem giữ nguyên (không dup/khấu hao)");
    assert.equal(m.phase, "hunt", "mới 1 gem → vẫn hunt");
  });
});

describe("snatcher/A6: đủ 3 gem → phase flee", () => {
  it("ôm 3 viên → chuyển flee", () => {
    const m = Monsters.makeEnemy("snatcher", 6, null, 400, 300);
    const G = mkG(null, [
      { x: 430, y: 300, vx: 0, vy: 0, v: 3, t: 0 },
      { x: 370, y: 330, vx: 0, vy: 0, v: 5, t: 0 },
      { x: 400, y: 270, vx: 0, vy: 0, v: 7, t: 0 },
    ]);
    const upd = Monsters.BEHAVIORS.snatch.update;
    let steps = 0;
    while (m.phase !== "flee" && steps++ < 1500) { upd(m, 1 / 60, G); m.t += 1 / 60; }
    assert.equal(m.phase, "flee", "đủ 3 gem phải chuyển flee");
    assert.equal(m.carried.length, 3, "tối đa 3 viên");
    assert.deepEqual([...m.carried].sort((a, b) => a - b), [3, 5, 7], "giữ nguyên v từng viên");
    assert.equal(G.gems.length, 0);
  });
  it("6s không còn gem → flee tay không", () => {
    const m = Monsters.makeEnemy("snatcher", 6, null, 400, 300);
    const G = mkG(); // không có gem
    const upd = Monsters.BEHAVIORS.snatch.update;
    for (let i = 0; i < 7 * 60; i++) { upd(m, 1 / 60, G); m.t += 1 / 60; }
    assert.equal(m.phase, "flee", "idle 6s không gem → flee");
    assert.equal(m.carried.length, 0, "chạy tay không");
  });
});

describe("snatcher/A7: escape — chạm viền → gem mất, không điểm", () => {
  it("flee chạm viền → escaped + dead, gem mất, score giữ nguyên", () => {
    const m = Monsters.makeEnemy("snatcher", 6, null, 30, 360);
    m.phase = "flee"; m.carried = [5, 7, 9];
    const G = mkG({ x: 800, y: 360, r: 14, hp: 5, maxHp: 5 }, []);
    const upd = Monsters.BEHAVIORS.snatch.update;
    let steps = 0;
    while (!m.escaped && steps++ < 900) { upd(m, 1 / 60, G); m.t += 1 / 60; }
    assert.ok(m.escaped, "phải escaped khi chạm viền");
    assert.ok(m.dead, "escaped → dead (không qua killEnemy nên không điểm/xp)");
    assert.equal(G.gems.length, 0, "gem mất — không trả lại khi trốn thoát");
    assert.equal(G.score, 0, "không cộng điểm khi trốn thoát");
  });
});

describe("snatcher/A8: dmg 0 — va chạm tàu không trừ HP", () => {
  it("ôm tàu 30 frame → ship.hp giữ nguyên", () => {
    const m = Monsters.makeEnemy("snatcher", 6, null, 200, 200);
    const ship = { x: 200, y: 200, r: 14, hp: 5, maxHp: 5 };
    const G = mkG(ship, [{ x: 600, y: 600, vx: 0, vy: 0, v: 2, t: 0 }]);
    const upd = Monsters.BEHAVIORS.snatch.update;
    for (let i = 0; i < 30; i++) { upd(m, 1 / 60, G); m.t += 1 / 60; }
    assert.equal(ship.hp, 5, "va chạm tàu KHÔNG trừ HP (dmg: 0)");
  });
});

/* ================= TẦNG B — js/game.js bundle (code thật) =================
 * Trích source thật bằng brace-matching (bỏ qua string/comment), eval với mock
 * tối thiểu. Mọi test tầng B FAIL với message rõ ràng nếu bundle chưa rebuild. */

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
const NOT_BUILT = " — bundle js/game.js chưa rebuild? (dev chạy: node scripts/build-game.js)";

function extractSnatcherEntry(src) {
  const m = src.match(/"snatcher"\s*:\s*\{/);
  assert.ok(m, `không tìm thấy entry "snatcher" trong js/game.js${NOT_BUILT}`);
  const body = extractBrace(src, m.index + m[0].length - 1);
  assert.ok(body, "ngoặc mất cân bằng ở entry snatcher");
  return `"snatcher":` + body; // nguyên cặp key: value để eval ({...}).snatcher
}
function extractFunctionDecl(src, name) {
  const m = src.match(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.ok(m, `không tìm thấy function ${name} trong js/game.js${NOT_BUILT}`);
  const open = src.indexOf("{", m.index);
  const body = extractBrace(src, open);
  assert.ok(body, `ngoặc mất cân bằng ở function ${name}`);
  return src.slice(m.index, open + body.length);
}
function extractSnatchBehavior(src) {
  const m = src.match(/^\s*snatch:\s*\{\s*update\(e,\s*dt,\s*s,\s*spd\)\s*\{/m);
  assert.ok(m, `không tìm thấy BEHAVIORS.snatch.update(e, dt, s, spd) trong js/game.js${NOT_BUILT}`);
  const objOpen = src.indexOf("{", m.index + m[0].indexOf("snatch"));
  const body = extractBrace(src, objOpen);
  assert.ok(body, "ngoặc mất cân bằng ở BEHAVIORS.snatch");
  return body;
}

/* context mock cho code game-side: G + helpers mà snatch/releaseSnatcherGems dùng */
function gameCtx() {
  const floats = [], sfxCalls = [];
  const G = { gems: [], score: 0 };
  const ctx = {
    Math, console,
    I18N: { t: (k) => k },
    G,
    addFloat: (x, y, txt) => { floats.push(txt); },
    spawnEnemyAt: () => {},
    rand: (a) => a,
    hypot: Math.hypot,
    dist2: (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    nearestEdgePoint: (x, y) => {
      const b = { x: 0, y: 0, w: 980, h: 720 };
      const dl = x - b.x, dr = b.x + b.w - x, dt = y - b.y, db = b.y + b.h - y;
      const mn = Math.min(dl, dr, dt, db);
      const cl = (v, a, z) => Math.max(a, Math.min(z, v));
      if (mn === dl) return { x: b.x, y: cl(y, b.y, b.y + b.h), edge: "left" };
      if (mn === dr) return { x: b.x + b.w, y: cl(y, b.y, b.y + b.h), edge: "right" };
      if (mn === dt) return { x: cl(x, b.x, b.x + b.w), y: b.y, edge: "top" };
      return { x: cl(x, b.x, b.x + b.w), y: b.y + b.h, edge: "bottom" };
    },
    AudioEngine: { sfx: new Proxy({}, { get: (t, p) => () => { sfxCalls.push(p); } }) },
  };
  vm.createContext(ctx);
  return { ctx, G, floats, sfxCalls };
}

function loadGameSide() {
  const src = gameSrc();
  const { ctx, G, floats, sfxCalls } = gameCtx();
  vm.runInContext(extractFunctionDecl(src, "releaseSnatcherGems"), ctx, { filename: "releaseSnatcherGems" });
  const entry = vm.runInContext(`({${extractSnatcherEntry(src)}}).snatcher`, ctx, { filename: "snatcher-entry" });
  const snatchUpdate = vm.runInContext(`(${extractSnatchBehavior(src)}).update`, ctx, { filename: "snatch-update" });
  return { ctx, G, floats, sfxCalls, entry, snatchUpdate };
}

describe("snatcher/B1: entry game-side đúng spec", () => {
  const get = () => loadGameSide().entry;
  it("behavior/dmg/minWave/weight/maxPerWave/acts", () => {
    const e = get();
    assert.equal(e.behavior, "snatch");
    assert.equal(e.dmg, 0, "dmg 0 — không gây sát thương");
    assert.equal(e.minWave, 6, "debut wave 6");
    assert.equal(e.weight, 6);
    assert.equal(e.maxPerWave, 1);
    assert.deepEqual(Array.from(e.acts), [1, 2, 3]);
  });
  it("stats: r/color/xp + hp(6)/spd(6)", () => {
    const e = get();
    assert.equal(e.r, 12);
    assert.equal(e.color, "#f0abfc");
    assert.equal(e.xp, 3);
    assert.equal(e.hp(6), 6 + 6 * 0.6);
    assert.equal(e.spd(6), 140 + 6 * 4);
  });
  it("init set đúng state machine", () => {
    const e = get();
    const m = {};
    e.init(m);
    assert.equal(m.phase, "hunt");
    assert.deepEqual(Array.from(m.carried), []);
    assert.equal(m.idleT, 0);
    assert.equal(m.escaped, false);
  });
});

describe("snatcher/B2: game-side steal → flee", () => {
  it("cướp gem (slurp + float steal), đủ 3 → flee", () => {
    const { G, floats, sfxCalls, snatchUpdate } = loadGameSide();
    const e = { x: 400, y: 300, r: 12, t: 0, phase: "hunt", carried: [], idleT: 0, escaped: false };
    G.gems.push(
      { x: 430, y: 300, vx: 0, vy: 0, v: 3, t: 0 },
      { x: 370, y: 330, vx: 0, vy: 0, v: 5, t: 0 },
      { x: 400, y: 270, vx: 0, vy: 0, v: 7, t: 0 },
    );
    const s = { x: 100, y: 100, r: 14 };
    let steps = 0;
    while (G.gems.length && steps++ < 1500) { snatchUpdate(e, 1 / 60, s, 164); e.t += 1 / 60; }
    assert.equal(G.gems.length, 0, "cướp hết 3 gem khỏi G.gems");
    assert.deepEqual(Array.from(e.carried).sort((a, b) => a - b), [3, 5, 7], "giữ nguyên v từng viên");
    assert.equal(e.phase, "flee", "đủ 3 → flee");
    assert.ok(sfxCalls.includes("slurp"), "cướp phải kêu slurp");
    assert.ok(floats.includes("monster.snatcher.steal"), "float CƯỚP ĐÂY! 😈");
  });
});

describe("snatcher/B3: game-side escape", () => {
  it("flee chạm viền → escaped/dead, gem mất, không điểm", () => {
    const { G, floats, snatchUpdate } = loadGameSide();
    const e = { x: 30, y: 360, r: 12, t: 0, phase: "flee", carried: [5, 7, 9], idleT: 0, escaped: false };
    const s = { x: 800, y: 360, r: 14 };
    let steps = 0;
    while (!e.escaped && steps++ < 900) { snatchUpdate(e, 1 / 60, s, 164); e.t += 1 / 60; }
    assert.ok(e.escaped, "phải escaped khi chạm viền");
    assert.ok(e.dead, "escaped → dead, không qua killEnemy");
    assert.equal(G.gems.length, 0, "gem mất");
    assert.equal(G.score, 0, "không cộng điểm");
    assert.ok(floats.includes("monster.snatcher.escaped"), "float MẤT GEM RỒI! 😭");
  });
});

describe("snatcher/B4: releaseSnatcherGems — kill → scatter giữ v", () => {
  it("ôm 2 gem → đúng 2 gem về G.gems tại vị trí chết, giữ v gốc + boing/float", () => {
    const { ctx, G, floats, sfxCalls } = gameCtx();
    const src = gameSrc();
    vm.runInContext(extractFunctionDecl(src, "releaseSnatcherGems"), ctx, { filename: "releaseSnatcherGems" });
    const e = { x: 400, y: 300, carried: [5, 7] };
    const fn = vm.runInContext("releaseSnatcherGems", ctx);
    fn(e, true);
    assert.equal(G.gems.length, 2, "phải scatter đúng 2 gem");
    assert.deepEqual(G.gems.map((g) => g.v).sort((a, b) => a - b), [5, 7], "giữ nguyên v gốc");
    assert.ok(G.gems.every((g) => g.x === 400 && g.y === 300), "scatter tại vị trí chết");
    assert.ok(G.gems.every((g) => Number.isFinite(g.vx) && Number.isFinite(g.vy)), "vận tốc ngẫu nhiên");
    assert.deepEqual(Array.from(e.carried), [], "carried rỗng sau scatter");
    assert.ok(sfxCalls.includes("boing"), "phải kêu boing");
    assert.ok(floats.includes("monster.snatcher.caught"), "float ĐÒI LẠI ĐƯỢC! 💎");
  });
  it("tay không → no-op, không gem rác", () => {
    const { ctx, G } = gameCtx();
    vm.runInContext(extractFunctionDecl(gameSrc(), "releaseSnatcherGems"), ctx);
    const fn = vm.runInContext("releaseSnatcherGems", ctx);
    const e = { x: 0, y: 0, carried: [] };
    assert.equal(fn(e, true), false);
    assert.equal(G.gems.length, 0, "không sinh gem rác");
  });
});

describe("snatcher/B5: onDeath wiring — scatter ở death-path chung (edge case 7)", () => {
  it("entry.onDeath gọi releaseSnatcherGems — mọi nguồn sát thương đều trả gem", () => {
    const { G, floats, sfxCalls, entry } = loadGameSide();
    assert.equal(typeof entry.onDeath, "function",
      "entry snatcher PHẢI có onDeath (scatter đặt ở death-path chung, không ở kill-credit)");
    const e = { x: 400, y: 300, r: 12, carried: [5, 7], phase: "flee" };
    entry.onDeath(e);
    assert.equal(G.gems.length, 2, "onDeath phải scatter đúng 2 gem");
    assert.deepEqual(G.gems.map((g) => g.v).sort((a, b) => a - b), [5, 7]);
    assert.ok(sfxCalls.includes("boing"));
    assert.ok(floats.includes("monster.snatcher.caught"));
  });
});

describe("snatcher/B6: buildSpawnQueue tôn trọng maxPerWave = 1", () => {
  it("200 queue wave 6 → không queue nào có >1 snatcher", () => {
    const src = gameSrc();
    const ctx = {
      Math, console,
      actOf: () => 1,
      MONSTER_REGISTRY: {
        chaser: { id: "chaser", acts: [1], minWave: 1, weight: 100 },
        snatcher: { id: "snatcher", acts: [1], minWave: 6, weight: 6, maxPerWave: 1 },
      },
      G: { vp1_eliteParade: false },
      wkSpawnCfg: () => ({ base_count: 4, per_wave: 3 }),
      smoothCountMul: () => 1,
      onboardCountMul: () => 1,
      mobileAssistActive: () => false, // RFC fix-round-final F2: stub (test này kiểm tra maxPerWave, không phải assist)
    };
    vm.createContext(ctx);
    vm.runInContext(extractFunctionDecl(src, "buildSpawnQueue"), ctx, { filename: "buildSpawnQueue" });
    let maxSeen = 0;
    for (let i = 0; i < 200; i++) {
      const c = vm.runInContext("buildSpawnQueue(6).filter(t => t === 'snatcher').length", ctx);
      if (c > maxSeen) maxSeen = c;
    }
    assert.ok(maxSeen <= 1, `buildSpawnQueue phải cắt bớt snatcher thừa (maxPerWave=1), thấy tối đa ${maxSeen}/queue`);
  });
});

describe("snatcher/B7: i18n đăng ký đúng nơi", () => {
  it("5 key RFC có trong I18N.register ở js/game/10-gamedata.js, KHÔNG đụng js/i18n.js", () => {
    const mod = fs.readFileSync(path.join(ROOT, "js/game/10-gamedata.js"), "utf8");
    const base = fs.readFileSync(path.join(ROOT, "js/i18n.js"), "utf8");
    for (const k of SNATCH_KEYS) {
      assert.ok(mod.includes(`"${k}"`), `10-gamedata.js thiếu key ${k}`);
    }
    assert.ok(!base.includes("monster.snatcher"),
      "js/i18n.js KHÔNG được thêm key snatcher (RFC: chỉ xóa key chết)");
  });
});
