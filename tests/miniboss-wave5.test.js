/* WINDOWKILL — miniboss migration (RFC ui-audit-boss-cleanup §3.5).
 *
 * Campaign đã xóa: 5 defs mini_boss_1..5 đã migrate sang Monsters.MINIBOSSES
 * (js/monsters.js, key 1-5). js/game/11-spawn.js miniBossSpecOf("mini_boss_N")
 * resolve qua registry — stat mapping giữ nguyên campaign cũ:
 * base, hp×8 (hpMul), scale×2.5 (rMul), gem 20 (gems).
 *
 * Chạy: node --test tests/miniboss-wave5.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const Monsters = require(path.join(ROOT, "js/monsters.js"));
const gameSrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

const EXPECTED_BASE = { 1: "chewer", 2: "dasher", 3: "tank", 4: "splitter", 5: "chewer" };
const EXPECTED_NAME = { 1: "Chewer Cổ Đại", 2: "Dasher Xuyên Gai", 3: "Tank Từ Trường", 4: "Splitter Nhiễu", 5: "Chewer Chúa Tể" };

function extractFunction(src, name) {
  const headRe = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = headRe.exec(src);
  assert.ok(m, `không tìm thấy function ${name} trong js/game.js`);
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `ngoặc mất cân bằng trong function ${name}`);
  return src.slice(m.index, i + 1);
}

/* miniBossSpecOf từ bundle, chạy trong vm với window.Monsters thật. */
function loadSpecOf() {
  const fn = extractFunction(gameSrc, "miniBossSpecOf");
  const sandbox = { window: { Monsters }, Monsters, console };
  vm.createContext(sandbox);
  vm.runInContext(fn + "\nthis.__spec = miniBossSpecOf;", sandbox);
  return sandbox.__spec;
}

describe("miniboss migration: Monsters.MINIBOSSES giữ đủ 5 defs", () => {
  for (let n = 1; n <= 5; n++) {
    it(`MINIBOSSES[${n}] — base ${EXPECTED_BASE[n]}, hp×8, scale×2.5, gem 20`, () => {
      const mb = Monsters.MINIBOSSES[n];
      assert.ok(mb, `thiếu MINIBOSSES[${n}]`);
      assert.equal(mb.base, EXPECTED_BASE[n]);
      assert.equal(mb.nameVi, EXPECTED_NAME[n], "giữ nguyên tên campaign cũ");
      assert.equal(mb.hpMul, 8);
      assert.equal(mb.rMul, 2.5);
      assert.equal(mb.gems, 20);
      assert.ok(Monsters.MONSTER_REGISTRY[mb.base], `base "${mb.base}" phải có trong MONSTER_REGISTRY`);
    });
  }
  it("F3: makeMiniBoss/miniBossStats đã xóa (GIỮ MINIBOSSES defs — F1 dùng)", () => {
    assert.equal(Monsters.makeMiniBoss, undefined, "makeMiniBoss phải bị xóa");
    assert.equal(Monsters.miniBossStats, undefined, "miniBossStats phải bị xóa");
    assert.ok(Monsters.MINIBOSSES, "MINIBOSSES defs phải còn");
  });
});

describe("miniBossSpecOf: id 'mini_boss_N' resolve qua Monsters registry", () => {
  const specOf = loadSpecOf();
  for (let n = 1; n <= 5; n++) {
    it(`mini_boss_${n} → { base, nameVi, hpMult: 8, scale: 2.5, gemReward: 20 }`, () => {
      const spec = specOf(`mini_boss_${n}`);
      assert.ok(spec, `miniBossSpecOf("mini_boss_${n}") trả null`);
      assert.equal(spec.id, `mini_boss_${n}`);
      assert.equal(spec.base, EXPECTED_BASE[n]);
      assert.equal(spec.nameVi, EXPECTED_NAME[n]);
      assert.equal(spec.hpMult, 8);
      assert.equal(spec.scale, 2.5);
      assert.equal(spec.gemReward, 20);
    });
  }
  it("id lạ → null (không đổi hành vi cũ)", () => {
    assert.equal(specOf("chaser"), null);
    assert.equal(specOf("mini_boss_99"), null);
    assert.equal(specOf("mini_boss_0"), null);
    assert.equal(specOf(null), null);
    assert.equal(specOf(undefined), null);
    assert.equal(specOf("boss_1"), null);
  });
});

describe("mkEnemy dùng miniBossSpecOf thay Campaign.getMinibossSpec", () => {
  it("bundle không còn Campaign.getMinibossSpec; mkEnemy gọi miniBossSpecOf", () => {
    assert.ok(!gameSrc.includes("Campaign.getMinibossSpec"),
      "bundle không được chứa Campaign.getMinibossSpec");
    assert.ok(!gameSrc.includes("typeof Campaign"),
      "mkEnemy không được guard trên window.Campaign nữa");
    const mk = extractFunction(gameSrc, "mkEnemy");
    assert.ok(mk.includes("miniBossSpecOf(type)"), "mkEnemy phải gọi miniBossSpecOf(type)");
  });
});

/* RFC fix-round-final F1: maybeSpawnMiniBoss(n) — chạy trong vm với stub
 * G/miniBossSpecOf thật/spawnEnemy/setBanner/AudioEngine giả lập. */
function loadMaybeSpawn() {
  const fn = extractFunction(gameSrc, "maybeSpawnMiniBoss");
  const spawned = [];
  const state = { banner: null, bannerSub: null, sfxN: 0 };
  const sandbox = {
    G: { miniBossWave: 0 },
    miniBossSpecOf: loadSpecOf(),
    spawnEnemy: (t) => spawned.push(t),
    setBanner: (t, s) => { state.banner = t; state.bannerSub = s; },
    AudioEngine: { sfx: { boss: () => { state.sfxN++; } } },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fn + "\nthis.__mb = maybeSpawnMiniBoss;", sandbox);
  return {
    state, spawned,
    call: (n) => vm.runInContext("__mb(" + n + ")", sandbox),
    wave: () => sandbox.G.miniBossWave,
  };
}

describe("F1 — maybeSpawnMiniBoss: mapping wave 4/9/14/19/24 → mini_boss_1..5", () => {
  const EXPECT_K = { 4: 1, 9: 2, 14: 3, 19: 4, 24: 5 };
  for (const [wave, k] of Object.entries(EXPECT_K)) {
    it(`wave ${wave} → spawn mini_boss_${k} + banner nameVi + sfx boss`, () => {
      const mb = loadMaybeSpawn();
      mb.call(Number(wave));
      assert.deepEqual(mb.spawned, [`mini_boss_${k}`], `wave ${wave} phải spawn mini_boss_${k}`);
      assert.equal(mb.state.banner, EXPECTED_NAME[k], "banner phải hiện nameVi");
      assert.equal(mb.state.sfxN, 1, "phải phát sfx boss 1 lần");
      assert.equal(mb.wave(), Number(wave), "guard G.miniBossWave phải set");
    });
  }
  it("ngoài khoảng (29, 34, 39) và wave thường khác → no-op", () => {
    const mb = loadMaybeSpawn();
    for (const n of [1, 2, 3, 5, 6, 10, 15, 20, 25, 29, 34, 39, 44]) mb.call(n);
    assert.deepEqual(mb.spawned, [], "không wave nào được spawn");
    assert.equal(mb.state.banner, null, "không banner");
    assert.equal(mb.state.sfxN, 0, "không sfx");
    assert.equal(mb.wave(), 0, "guard không đổi");
  });
  it("gọi 2 lần cùng wave → chỉ spawn 1 lần (guard chống trùng)", () => {
    const mb = loadMaybeSpawn();
    mb.call(4); mb.call(4);
    assert.deepEqual(mb.spawned, ["mini_boss_1"]);
    assert.equal(mb.state.sfxN, 1);
  });
  it("startWave hook maybeSpawnMiniBoss sau maybeTriggerGiant", () => {
    const sw = extractFunction(gameSrc, "startWave");
    const iG = sw.indexOf("maybeTriggerGiant(n)");
    const iM = sw.indexOf("maybeSpawnMiniBoss(n)");
    assert.ok(iG >= 0, "startWave phải có maybeTriggerGiant(n)");
    assert.ok(iM > iG, "maybeSpawnMiniBoss(n) phải đứng sau maybeTriggerGiant(n)");
    // boss wave (n%5===0) return sớm → hook không chạy ở wave boss
    const bossBranch = sw.slice(0, iM);
    assert.ok(/if\s*\(\s*n\s*%\s*5\s*===\s*0\s*\)\s*\{\s*spawnBoss\(\);\s*return;/.test(bossBranch),
      "boss wave phải return sớm trước hook miniboss");
  });
});
