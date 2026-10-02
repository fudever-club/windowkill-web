/* WINDOWKILL — Season 1 Phase 1 tests (node:test).
 * Chạy: node --test tests/season-monsters.test.js
 * 3 quái mới: deadline (countdown-bell), otworker (rage-stack), meeting (slow-aura + summon).
 * Pattern theo tests/game-logic.test.js: static analysis bằng regex trên js/game.js
 * (browser script thuần, không require được) + unit test công thức thuần, không DOM.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
const i18n = fs.readFileSync(path.join(ROOT, "js/i18n.js"), "utf8");
const monstersJs = fs.readFileSync(path.join(ROOT, "js/monsters.js"), "utf8");

describe("Season 1 — MONSTER_REGISTRY có đủ 3 quái mới", () => {
  for (const id of ["deadline", "otworker", "meeting"]) {
    it(`registry có entry "${id}"`, () => {
      assert.match(src, new RegExp(`"${id}":\\s*\\{\\s*id:\\s*"${id}"`));
    });
  }
  it('deadline: behavior "countdownBell", dmg 0, minWave 6', () => {
    assert.match(src, /"deadline":[^}]*behavior:\s*"countdownBell"/s);
    assert.match(src, /"deadline":[^}]*dmg:\s*0/s);
    assert.match(src, /"deadline":[^}]*minWave:\s*6/s);
  });
  it('deadline: HP 5+wave*0.6, countdown 12s trong init', () => {
    assert.match(src, /"deadline":[^}]*hp:\s*w\s*=>\s*5\s*\+\s*w\s*\*\s*0\.6/s);
    assert.match(src, /"deadline":[^}]*e\.countdown\s*=\s*12/s);
  });
  it('otworker: behavior "rageChase", init rage=0', () => {
    assert.match(src, /"otworker":[^}]*behavior:\s*"rageChase"/s);
    assert.match(src, /"otworker":[^}]*e\.rage\s*=\s*0/s);
  });
  it('meeting: behavior "meetingAura", init summonT=12', () => {
    assert.match(src, /"meeting":[^}]*behavior:\s*"meetingAura"/s);
    assert.match(src, /"meeting":[^}]*e\.summonT\s*=\s*12/s);
  });
});

describe("Season 1 — BEHAVIORS có đủ 3 behavior mới", () => {
  for (const b of ["countdownBell", "rageChase", "meetingAura"]) {
    it(`BEHAVIORS có "${b}"`, () => {
      assert.match(src, new RegExp(`${b}:\\s*\\{\\s*update\\(e,\\s*dt,\\s*s,\\s*spd\\)`));
    });
  }
  it("countdownBell: đạn băng đóng băng đếm ngược (slowT)", () => {
    assert.match(src, /countdownBell[\s\S]*?if\s*\(e\.slowT\s*<=\s*0\)\s*e\.countdown\s*-=\s*dt/);
  });
  it("countdownBell: reo chuông +35% tốc 10s rồi tự vỡ (không killEnemy)", () => {
    assert.match(src, /countdownBell[\s\S]*?G\.globalHaste\s*=\s*1\.35;\s*G\.hasteT\s*=\s*10/);
    assert.match(src, /countdownBell[\s\S]*?e\.dead\s*=\s*true/);
  });
  it("rageChase: mỗi 10s +1 stack, tối đa 5", () => {
    assert.match(src, /rageChase[\s\S]*?e\.rageT\s*>=\s*10\s*&&\s*e\.rage\s*<\s*5/);
  });
  it("rageChase: +15% tốc/stack, +1 dmg mỗi 2 stack", () => {
    assert.match(src, /rageChase[\s\S]*?1\s*\+\s*0\.15\s*\*\s*e\.rage/);
    assert.match(src, /rageChase[\s\S]*?e\.dmg\s*=\s*1\s*\+\s*Math\.floor\(e\.rage\s*\/\s*2\)/);
  });
  it("meetingAura: vùng họp r=160 slow 35%, triệu tập 12s chỉ hút quái", () => {
    assert.match(src, /meetingAura[\s\S]*?r:\s*160,\s*slow:\s*0\.35/);
    assert.match(src, /meetingAura[\s\S]*?e\.summonT\s*=\s*12/);
    assert.match(src, /meetingAura[\s\S]*?for\s*\(const o of G\.enemies\)/);
  });
  it("meetingAura: telegraph triệu tập 0.6s (warnT)", () => {
    assert.match(src, /meetingAura[\s\S]*?e\.warnT\s*=\s*0\.6/);
  });
});

describe("Season 1 — hệ thống hỗ trợ", () => {
  it("G có globalHaste/hasteT/slowZones", () => {
    assert.match(src, /globalHaste:\s*1,\s*hasteT:\s*0/);
    assert.match(src, /slowZones:\s*\[\]/);
  });
  it("seasonTick: hết hasteT thì về tốc bình thường; dọn vùng của quái chết", () => {
    assert.match(src, /function seasonTick\(dt,\s*s\)/);
    assert.match(src, /if\s*\(G\.hasteT\s*<=\s*0\)\s*G\.globalHaste\s*=\s*1/);
    assert.match(src, /z\.from\s*&&\s*z\.from\.dead/);
  });
  it("shipSlowMult: tàu trong vùng họp bị slow 35%", () => {
    assert.match(src, /function shipSlowMult\(\)/);
    assert.match(src, /m\s*=\s*Math\.min\(m,\s*1\s*-\s*z\.slow\)/);
  });
  it("damageEnemy: đạn băng reset rage otworker", () => {
    assert.match(src, /e\.type\s*===\s*"otworker"\s*&&\s*e\.rage\s*>\s*0/);
  });
  it("drawOneEnemy: có nhánh vẽ riêng cho 3 quái", () => {
    for (const t of ["deadline", "otworker", "meeting"]) {
      assert.match(src, new RegExp(`e\\.type\\s*===\\s*"${t}"`));
    }
  });
  it("i18n: đủ keys VI+EN cho 3 quái + 5 float text", () => {
    for (const k of ["monster.deadline.name", "monster.otworker.name", "monster.meeting.name",
      "season.bell_ring", "season.rage_up", "season.rage_reset", "season.summon", "season.in_meeting"]) {
      assert.ok(i18n.includes(`"${k}"`), `thiếu key ${k}`);
    }
  });
  it("monsters.js: 3 quái cũng đăng ký trong registry bestiary (tránh fallback chaser ở campaign)", () => {
    for (const id of ["deadline", "otworker", "meeting"]) {
      assert.match(monstersJs, new RegExp(`${id}:\\s*\\{\\s*id:\\s*"${id}"`),
        `monsters.js thiếu entry ${id} → v2glue fallback thành chaser`);
    }
  });
});

/* ---- unit test công thức thuần (không DOM) — mirror logic trong game ---- */
describe("Season 1 — công thức thuần", () => {
  const rageDmg = (rage) => 1 + Math.floor(rage / 2);
  const rageSpdMul = (rage) => 1 + 0.15 * rage;
  it("otworker: dmg theo rage (design: +1 mỗi 2 stack)", () => {
    assert.equal(rageDmg(0), 1);
    assert.equal(rageDmg(1), 1);
    assert.equal(rageDmg(2), 2);
    assert.equal(rageDmg(4), 3);
    assert.equal(rageDmg(5), 3);
  });
  it("otworker: tốc theo rage (+15%/stack, max 5 → 1.75x)", () => {
    assert.equal(rageSpdMul(0), 1);
    assert.equal(rageSpdMul(5), 1.75);
  });
  it("deadline: số hiển thị = ceil(countdown), min 0", () => {
    const shown = (cd) => String(Math.max(0, Math.ceil(cd)));
    assert.equal(shown(11.2), "12");
    assert.equal(shown(0.3), "1");
    assert.equal(shown(-0.5), "0");
  });
  it("meeting: shipSlowMult — trong vùng 160px → 0.65, ngoài → 1", () => {
    const mult = (sx, sy, zx, zy, r, slow) => {
      const dx = sx - zx, dy = sy - zy;
      return (dx * dx + dy * dy < r * r) ? 1 - slow : 1;
    };
    assert.equal(mult(0, 0, 0, 0, 160, 0.35), 0.65);
    assert.equal(mult(200, 0, 0, 0, 160, 0.35), 1);
    assert.equal(mult(159, 0, 0, 0, 160, 0.35), 0.65);
  });
  it("meeting: summon chỉ kéo quái trong 420px", () => {
    const inRange = (d) => d < 420;
    assert.equal(inRange(419), true);
    assert.equal(inRange(421), false);
  });
  it("deadline: globalHaste hết hạn sau 10s", () => {
    let hasteT = 10, globalHaste = 1.35;
    for (let i = 0; i < 105; i++) { hasteT -= 0.1; if (hasteT <= 0) globalHaste = 1; }
    assert.equal(globalHaste, 1);
    // biên: đúng 10s có thể còn dư epsilon floating-point — game dùng frame tiếp theo
    let h2 = 10, g2 = 1.35;
    for (let i = 0; i < 100; i++) { h2 -= 0.1; if (h2 <= 0) g2 = 1; }
    assert.ok(h2 < 0.001, "sau 100 frame còn < 1ms");
  });
});
