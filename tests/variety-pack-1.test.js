/* WINDOWKILL — Variety Pack 1 tests (node:test).
 * Chạy: node --test tests/variety-pack-1.test.js
 * Shipper Gem (courier), Đạo Diễn Sóng (director), 12 WAVE_MODIFIERS,
 * event waves (breather/meteor/blackout/golden), i18n VI+EN.
 * Pattern theo tests/season-monsters.test.js: static analysis bằng regex
 * trên source (browser script thuần) + behavioral test cho WAVE_MODIFIERS
 * qua vm (monsters.js expose window.Monsters).
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
const i18nSrc = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");
const monstersSrc = fs.readFileSync(path.join(ROOT, "js", "monsters.js"), "utf8");

/* Load monsters.js thật trong vm để test WAVE_MODIFIERS behavior. */
function loadMonsters() {
  const sb = { console, Math, JSON, Object, Array };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(monstersSrc, sb, { filename: "js/monsters.js" });
  return sb.Monsters;
}

describe("Variety Pack 1 — MONSTER_REGISTRY (js/game.js)", () => {
  it('registry có entry "shipper"', () => {
    assert.match(gameSrc, /"shipper":\s*\{\s*id:\s*"shipper"/);
  });
  it('registry có entry "director"', () => {
    assert.match(gameSrc, /"director":\s*\{\s*id:\s*"director"/);
  });
  it("shipper: behavior courier, dmg 0, minWave 10, weight 25, r 14", () => {
    assert.match(gameSrc, /"shipper":[^}]*behavior:\s*"courier"/s);
    assert.match(gameSrc, /"shipper":[^}]*dmg:\s*0/s);
    assert.match(gameSrc, /"shipper":[^}]*minWave:\s*10/s);
    assert.match(gameSrc, /"shipper":[^}]*weight:\s*25/s);
    assert.match(gameSrc, /"shipper":[^}]*r:\s*14/s);
  });
  it("shipper: hp 8+w*0.9, init stam/state/tauntT, onDeath rớt 14 gem", () => {
    const m = gameSrc.match(/"shipper":\s*\{[\s\S]*?desc:[^\n]*\n/);
    assert.ok(m, "không tìm thấy entry shipper");
    const entry = m[0];
    assert.match(entry, /hp:\s*w\s*=>\s*8\s*\+\s*w\s*\*\s*0\.9/);
    assert.match(entry, /e\.stam\s*=\s*0/);
    assert.match(entry, /onDeath/);
  });
  it("director: behavior director, dmg 0, minWave 12, weight 0 (scripted)", () => {
    assert.match(gameSrc, /"director":[^}]*behavior:\s*"director"/s);
    assert.match(gameSrc, /"director":[^}]*dmg:\s*0/s);
    assert.match(gameSrc, /"director":[^}]*minWave:\s*12/s);
    assert.match(gameSrc, /"director":[^}]*weight:\s*0/s);
  });
  it("director: hp 12+w*1.0, spd 55, onDeath float CẮT!", () => {
    const m = gameSrc.match(/"director":\s*\{[\s\S]*?desc:[^\n]*\n/);
    assert.ok(m, "không tìm thấy entry director");
    const entry = m[0];
    assert.match(entry, /hp:\s*w\s*=>\s*12\s*\+\s*w\s*\*\s*1\.0/);
    assert.match(entry, /spd:\s*\(\)\s*=>\s*55/);
    assert.match(entry, /vp1\.director\.cut/);
  });
});

describe("Variety Pack 1 — BEHAVIORS (js/game.js)", () => {
  it('BEHAVIORS có "courier"', () => {
    assert.match(gameSrc, /courier:\s*\{\s*update\(e,\s*dt,\s*s,\s*spd\)/);
  });
  it('BEHAVIORS có "director"', () => {
    assert.match(gameSrc, /director:\s*\{\s*update\(e,\s*dt,\s*s,\s*spd\)/);
  });
  it("courier: chu kỳ stamina 7s (sprint 205 / tired 90 / cruise 165)", () => {
    assert.match(gameSrc, /courier:[\s\S]*?e\.stam\s*%\s*7/);
    assert.match(gameSrc, /courier:[\s\S]*?cur\s*=\s*205/);
    assert.match(gameSrc, /courier:[\s\S]*?cur\s*=\s*90/);
    assert.match(gameSrc, /courier:[\s\S]*?cur\s*=\s*165/);
  });
  it("courier: chạy khỏi tàu + zigzag + tránh viền + taunt", () => {
    assert.match(gameSrc, /courier:[\s\S]*?e\.x\s*-\s*s\.x/); // vector khỏi tàu
    assert.match(gameSrc, /courier:[\s\S]*?Math\.sin\(e\.t\s*\*\s*5\)/); // zigzag
    assert.match(gameSrc, /courier:[\s\S]*?tauntT/);
  });
  it("director: roll modifier lúc spawn (vp1RollModifier)", () => {
    assert.match(gameSrc, /director:[\s\S]*?vp1RollModifier\(e\)/);
  });
});

describe("Variety Pack 1 + Endless Delight — WAVE_MODIFIERS (js/monsters.js)", () => {
  const EXPECTED = ["gemrain", "tiny", "xpturbo", "tailwind", "starbullets",
    "slowopen", "glowparty", "gemmagnet", "djparty", "hullinsurance", "payday", "fireworks",
    "discobullets", "confetti", "luckypickup", "boingyship", "giggle"]; // +5 Endless Delight
  it("đủ 17 modifier (12 Pack 1 + 5 Endless Delight)", () => {
    const M = loadMonsters();
    assert.ok(Array.isArray(M.WAVE_MODIFIERS), "Monsters.WAVE_MODIFIERS phải là mảng");
    assert.equal(M.WAVE_MODIFIERS.length, 17);
    const ids = M.WAVE_MODIFIERS.map(m => m.id).sort();
    assert.equal(ids.join(","), EXPECTED.slice().sort().join(","));
  });
  it("mỗi modifier có apply/clear, apply set flag, clear reset", () => {
    const M = loadMonsters();
    const G = {};
    for (const m of M.WAVE_MODIFIERS) {
      assert.equal(typeof m.apply, "function", `${m.id}.apply`);
      assert.equal(typeof m.clear, "function", `${m.id}.clear`);
      m.apply(G);
      m.clear(G);
    }
    // sau clear toàn bộ, không còn flag active
    assert.equal(G.vp1_gemMul || 1, 1);
    assert.equal(G.vp1_tiny || false, false);
    assert.equal(G.vp1_xpMul || 1, 1);
    assert.equal(G.vp1_shipSpdMul || 1, 1);
    assert.equal(G.vp1_starBullets || false, false);
    assert.equal(G.vp1_slowOpenT || 0, 0);
    assert.equal(G.vp1_glowParty || false, false);
    assert.equal(G.vp1_magnetMul || 1, 1);
    assert.equal(G.vp1_dj || false, false);
    assert.equal(G.vp1_hullIns || false, false);
    assert.equal(G.vp1_pickupMul || 1, 1);
    assert.equal(G.vp1_fireworks || false, false);
    assert.equal(G.vp1_discoBullets || false, false);
    assert.equal(G.vp1_confetti || false, false);
    assert.equal(G.vp1_luckyPickup || false, false);
    assert.equal(G.vp1_boingy || false, false);
    assert.equal(G.vp1_giggle || false, false);
  });
  it("apply set đúng giá trị active", () => {
    const M = loadMonsters();
    const byId = Object.fromEntries(M.WAVE_MODIFIERS.map(m => [m.id, m]));
    const G = {};
    byId.gemrain.apply(G); assert.equal(G.vp1_gemMul, 2);
    byId.tiny.apply(G); assert.equal(G.vp1_tiny, true);
    byId.xpturbo.apply(G); assert.equal(G.vp1_xpMul, 2);
    byId.tailwind.apply(G); assert.equal(G.vp1_shipSpdMul, 1.2);
    byId.starbullets.apply(G); assert.equal(G.vp1_starBullets, true);
    byId.slowopen.apply(G); assert.equal(G.vp1_slowOpenT, 12);
    byId.glowparty.apply(G); assert.equal(G.vp1_glowParty, true);
    byId.gemmagnet.apply(G); assert.equal(G.vp1_magnetMul, 3);
    byId.djparty.apply(G); assert.equal(G.vp1_dj, true);
    byId.hullinsurance.apply(G); assert.equal(G.vp1_hullIns, true);
    byId.payday.apply(G); assert.equal(G.vp1_pickupMul, 2);
    byId.fireworks.apply(G); assert.equal(G.vp1_fireworks, true);
  });
});

describe("Variety Pack 1 — startWave wiring (js/game.js)", () => {
  it("startWave clear modifier wave trước", () => {
    assert.match(gameSrc, /function startWave[\s\S]*?vp1ClearModifier\(\)/);
  });
  it("startWave spawn director khi đủ điều kiện", () => {
    assert.match(gameSrc, /function startWave[\s\S]*?vp1DirectorEligible\(n\)\)\s*vp1SpawnDirector\(\)/);
  });
  it("startWave roll event", () => {
    assert.match(gameSrc, /function startWave[\s\S]*?vp1RollEvent\(n\)/);
  });
  it("director eligible: n>=12, không boss, không breather", () => {
    assert.match(gameSrc, /function vp1DirectorEligible\(n\)\s*\{\s*return n >= 12 && !vp1IsBossWave\(n\) && !vp1IsBreather\(n\);\s*\}/);
  });
  it("breather trigger: n>=16 && n%6==4", () => {
    assert.match(gameSrc, /function vp1IsBreather\(n\)\s*\{\s*return n >= 16 && n % 6 === 4;\s*\}/);
  });
  it("breather: spawn ×0.6 + gem ×1.5 + clear +1 HP", () => {
    assert.match(gameSrc, /vp1IsBreather\(n\)\)[\s\S]*?\* 0\.6/);
    assert.match(gameSrc, /vp1_breather \? 1\.5 : 1/);
    assert.match(gameSrc, /vp1_breather && G\.ship/);
  });
  it("event triggers: meteor 14, blackout 18, golden 24", () => {
    assert.match(gameSrc, /n >= 14 && n % 12 === 2.*meteor/);
    assert.match(gameSrc, /n >= 18 && n % 24 === 18.*blackout/);
    assert.match(gameSrc, /n >= 24 && n % 24 === 0.*golden/);
  });
  it("resetGame reset VP1 flags", () => {
    assert.match(gameSrc, /vp1_mod:\s*null[\s\S]*?vp1_directorDebutShown:\s*false/);
  });
});

describe("Variety Pack 1 — modifier hooks (js/game.js)", () => {
  it("killEnemy: gemMul + glowparty + fireworks", () => {
    assert.match(gameSrc, /G\.vp1_gemMul \|\| 1/);
    assert.match(gameSrc, /G\.vp1_glowParty/);
    assert.match(gameSrc, /G\.vp1_fireworks/);
  });
  it("mkEnemy: tiny scale", () => {
    assert.match(gameSrc, /G\.vp1_tiny/);
  });
  it("gainXp: xpMul · ship: shipSpdMul · magnet: magnetMul", () => {
    assert.match(gameSrc, /G\.vp1_xpMul \|\| 1/);
    assert.match(gameSrc, /G\.vp1_shipSpdMul \|\| 1/);
    assert.match(gameSrc, /G\.vp1_magnetMul \|\| 1/);
  });
  it("bullet: starbullets pierce + vẽ sao", () => {
    assert.match(gameSrc, /G\.vp1_starBullets \? 1 : 0/);
    assert.match(gameSrc, /bl\.star/);
  });
  it("enemy loop: slowOpen + dj + meteor/blackout timers", () => {
    assert.match(gameSrc, /G\.vp1_slowOpenT/);
    assert.match(gameSrc, /G\.vp1_dj/);
    assert.match(gameSrc, /vp1TickMeteors/);
  });
  it("pickup drop: pickupMul · wave clear: hullinsurance", () => {
    assert.match(gameSrc, /G\.vp1_pickupMul \|\| 1/);
    assert.match(gameSrc, /G\.vp1_hullIns/);
  });
});

describe("Variety Pack 1 — i18n (js/i18n.js)", () => {
  const viKeys = [
    "monster.shipper.name", "monster.shipper.desc",
    "monster.director.name", "monster.director.desc",
    "vp1.director.debut", "vp1.director.cut",
    "vp1.event.breather.banner", "vp1.event.meteor.banner",
    "vp1.event.blackout.banner", "vp1.event.golden.banner",
  ];
  const modIds = ["gemrain", "tiny", "xpturbo", "tailwind", "starbullets",
    "slowopen", "glowparty", "gemmagnet", "djparty", "hullinsurance", "payday", "fireworks"];
  for (const k of viKeys) {
    it(`i18n có key "${k}"`, () => {
      assert.ok(i18nSrc.includes(`"${k}"`), `thiếu i18n key ${k}`);
    });
  }
  for (const id of modIds) {
    it(`i18n có vp1.mod.${id}.name/desc`, () => {
      assert.ok(i18nSrc.includes(`"vp1.mod.${id}.name"`), `thiếu vp1.mod.${id}.name`);
      assert.ok(i18nSrc.includes(`"vp1.mod.${id}.desc"`), `thiếu vp1.mod.${id}.desc`);
    });
  }
  it("không emoji trong keys vp1", () => {
    const vp1Lines = i18nSrc.split("\n").filter(l => l.includes("vp1."));
    for (const l of vp1Lines) {
      // eslint-disable-next-line no-control-regex
      assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(l), `emoji trong i18n: ${l.trim().slice(0, 60)}`);
    }
  });
});

describe("Variety Pack 1 — bestiary (js/monsters.js)", () => {
  it('bestiary có "shipper" (debutWave 10)', () => {
    assert.match(monstersSrc, /shipper:\s*\{\s*id:\s*"shipper"/);
    assert.match(monstersSrc, /shipper:[\s\S]*?debutWave:\s*10/);
  });
  it('bestiary có "director" (debutWave 12)', () => {
    assert.match(monstersSrc, /director:\s*\{\s*id:\s*"director"/);
    assert.match(monstersSrc, /director:[\s\S]*?debutWave:\s*12/);
  });
});
