/* WINDOWKILL — regression test cho bug C2b (Testing Team phát hiện 2026-10-02).
 * Bug: mini-boss wave 5 campaign ({monster:"mini_boss_N"}) bị v2glue.stageWave
 * fallback thành "chaser" thường vì id đặc biệt không có trong
 * MONSTER_REGISTRY/ADD_MAP — mini-boss thiết kế không bao giờ xuất hiện đúng,
 * bossHpMult cũng mất (queue chỉ giữ string).
 * Fix: stageWave giữ nguyên id boss (không fallback chaser); mkEnemy resolve
 * mini_boss_N → entity thật qua Campaign.getMinibossSpec (base + hp×8,
 * scale×2.5, gem 20, bossHpMult theo độ khó).
 * Chạy: node --test tests/miniboss-wave5.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const Campaign = require(path.join(ROOT, "js/campaign.js"));
const Monsters = require(path.join(ROOT, "js/monsters.js"));
const v2glueSrc = fs.readFileSync(path.join(ROOT, "js/v2glue.js"), "utf8");

const EXPECTED_BASE = { 1: "chewer", 2: "dasher", 3: "tank", 4: "splitter", 5: "chewer" };

/* Array tạo trong vm context có prototype khác realm ngoài → deepStrictEqual
   strict sẽ fail oan. Chuẩn hoá về array thường trước khi assert. */
function qarr(sv) { return Array.from(sv.queue); }

/* Load v2glue.js thật trong vm sandbox (giả lập browser globals tối thiểu).
 * campaignImpl: cho phép stub Campaign.getWaveComp/isBossId cho từng case. */
function loadV2(campaignImpl) {
  const sandbox = { window: {}, location: { search: "" }, console };
  sandbox.window.Monsters = Monsters;
  sandbox.window.Campaign = campaignImpl;
  sandbox.Monsters = Monsters; // browser: window.Monsters cũng là global bare name
  sandbox.Campaign = campaignImpl;
  sandbox.window.location = sandbox.location;
  vm.createContext(sandbox);
  vm.runInContext(v2glueSrc, sandbox, { filename: "v2glue.js" });
  assert.ok(sandbox.window.V2, "v2glue không export window.V2");
  return sandbox.window.V2;
}

describe("C2b-1: getWaveComp wave 5 định nghĩa đúng mini-boss (5 ải)", () => {
  for (let stage = 1; stage <= 5; stage++) {
    it(`ải ${stage}: wave 5 có entry mini_boss_${stage} (isBoss, bossHpMult)`, () => {
      const comp = Campaign.getWaveComp(stage, 5, "normal");
      assert.ok(Array.isArray(comp) && comp.length, "wave 5 không có comp");
      const mb = comp.find((e) => e.monster === `mini_boss_${stage}`);
      assert.ok(mb, `thiếu entry mini_boss_${stage} trong wave 5 ải ${stage}`);
      assert.equal(mb.isBoss, true, "mini-boss entry phải có isBoss=true");
      assert.ok(typeof mb.bossHpMult === "number" && mb.bossHpMult > 0,
        "mini-boss entry phải giữ bossHpMult (trước fix bị mất)");
    });
  }
});

describe("C2b-2: Campaign.getMinibossSpec resolve đúng entity", () => {
  for (let stage = 1; stage <= 5; stage++) {
    it(`mini_boss_${stage} → base ${EXPECTED_BASE[stage]}, hp×8, scale×2.5, gem 20`, () => {
      const spec = Campaign.getMinibossSpec(`mini_boss_${stage}`);
      assert.ok(spec, "getMinibossSpec trả null cho id hợp lệ");
      assert.equal(spec.base, EXPECTED_BASE[stage]);
      assert.equal(spec.hpMult, 8);
      assert.equal(spec.scale, 2.5);
      assert.equal(spec.gemReward, 20);
    });
  }
  it("id lạ → null; isBossId phân biệt đúng", () => {
    assert.equal(Campaign.getMinibossSpec("chaser"), null);
    assert.equal(Campaign.getMinibossSpec("mini_boss_99"), null);
    assert.equal(Campaign.getMinibossSpec(null), null);
    assert.equal(Campaign.isBossId("mini_boss_3"), true);
    assert.equal(Campaign.isBossId("boss_1"), true);
    assert.equal(Campaign.isBossId("chaser"), false);
    assert.equal(Campaign.isBossId("tank"), false);
  });
});

describe("C2b-3: V2.stageWave wave 5 spawn đúng mini-boss (không phải chaser)", () => {
  for (let stage = 1; stage <= 5; stage++) {
    it(`ải ${stage} wave 5: queue chứa đúng 1 mini_boss_${stage}`, () => {
      const V2 = loadV2(Campaign);
      V2.stageId = stage;
      V2.diffKey = "normal";
      V2.stageDone = false;
      const sv = V2.stageWave(5);
      assert.ok(sv && Array.isArray(sv.queue), "stageWave(5) không trả queue");
      assert.equal(sv.boss, false);
      const hits = qarr(sv).filter((t) => t === `mini_boss_${stage}`);
      assert.equal(hits.length, 1,
        `queue phải chứa đúng 1 mini_boss_${stage} (bug cũ: 0 vì fallback chaser). queue=${JSON.stringify(sv.queue)}`);
    });
  }
  it("wave 10 vẫn là boss module (không đụng)", () => {
    const V2 = loadV2(Campaign);
    V2.stageId = 1; V2.diffKey = "normal"; V2.stageDone = false;
    const sv = V2.stageWave(10);
    assert.equal(sv.boss, true);
    assert.deepEqual(qarr(sv), []);
  });
});

describe("C2b-4: fallback cũ giữ nguyên cho id lạ & quái thường", () => {
  it("id không tồn tại → chaser (hành vi cũ)", () => {
    const stubCampaign = {
      getWaveComp: () => [{ monster: "quai_khong_ton_tai", count: 2 }],
      isBossId: () => false,
    };
    const V2 = loadV2(stubCampaign);
    V2.stageId = 1; V2.diffKey = "normal"; V2.stageDone = false;
    const sv = V2.stageWave(3);
    assert.deepEqual(qarr(sv), ["chaser", "chaser"]);
  });
  it("quái thường trong registry đi qua nguyên vẹn", () => {
    const stubCampaign = {
      getWaveComp: () => [{ monster: "chewer", count: 1 }],
      isBossId: () => false,
    };
    const V2 = loadV2(stubCampaign);
    V2.stageId = 1; V2.diffKey = "normal"; V2.stageDone = false;
    assert.deepEqual(qarr(V2.stageWave(3)), ["chewer"]);
  });
  it("id có trong bestiary registry đi qua nguyên vẹn (glimmer — hành vi cũ, ngoài phạm vi C2b)", () => {
    const stubCampaign = {
      getWaveComp: () => [{ monster: "glimmer", count: 1 }],
      isBossId: () => false,
    };
    const V2 = loadV2(stubCampaign);
    V2.stageId = 1; V2.diffKey = "normal"; V2.stageDone = false;
    // glimmer có trong bestiary MONSTER_REGISTRY nên stageWave giữ nguyên
    // (không chạm ADD_MAP) — hành vi này có từ trước fix, giữ nguyên.
    assert.deepEqual(qarr(V2.stageWave(3)), ["glimmer"]);
  });
});

describe("C2b-5: game.js mkEnemy có nhánh resolve mini-boss (tĩnh)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  it("mkEnemy gọi Campaign.getMinibossSpec", () => {
    assert.ok(src.includes("getMinibossSpec"), "mkEnemy thiếu nhánh resolve mini-boss");
  });
  it("áp hp×bossHpMult, scale, gemReward và giữ type=base", () => {
    for (const s of ["e.miniBoss", "miniSpec.hpMult", "miniSpec.scale", "miniSpec.gemReward", "bossHpMult"]) {
      assert.ok(src.includes(s), `mkEnemy thiếu: ${s}`);
    }
  });
});
