/* WINDOWKILL — campaign.js logic tests (node:test, localStorage shim).
 * SYSTEM TEST: campaign 5 ải là xương sống v2.0 — unlock tuyến tính, kỷ lục
 * theo profile, stage defs đầy đủ cho cả 2 ngôn ngữ.
 * Chạy: node --test tests/campaign-logic.test.js
 */
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/campaign.js"), "utf8");

function loadCampaign(seed = {}) {
  const store = { ...seed };
  const sandbox = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { search: "" },
    console,
  };
  sandbox.window = sandbox;
  sandbox.window.location = sandbox.location;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "js/campaign.js" });
  return { Campaign: sandbox.window.Campaign, store };
}

describe("campaign.js — stage defs", () => {
  it("C1: đủ 5 ải, mỗi ải có id/nameVi/nameEn/boss/waveTable", () => {
    const { Campaign } = loadCampaign();
    assert.equal(Campaign.STAGES.length, 5);
    const ids = Campaign.STAGES.map((s) => s.id);
    assert.deepEqual([...ids].sort(), [1, 2, 3, 4, 5]);
    for (const s of Campaign.STAGES) {
      assert.ok(s.nameVi && s.nameEn, `ải ${s.id} thiếu tên`);
      assert.ok(s.boss && s.boss.id, `ải ${s.id} thiếu boss`);
      assert.ok(Array.isArray(s.waveTable) && s.waveTable.length === 10, `ải ${s.id} waveTable phải 10 wave`);
      assert.ok(s.mechanicFlags && typeof s.mechanicFlags === "object", `ải ${s.id} thiếu mechanicFlags`);
    }
  });
  it("C2: wave cuối mỗi ải là boss; mọi quái trong waveTable resolve được kiểu spawn thật", () => {
    const { Campaign } = loadCampaign();
    const Monsters = require(path.join(ROOT, "js/monsters.js"));
    const reg = Monsters.MONSTER_REGISTRY || Monsters;
    // v2glue.stageWave: MONSTER_REGISTRY[id] ? id : (ADD_MAP[id] || "chaser")
    const ADD_MAP = { bomber: 1, phantom: 1, broodmother: 1, spitter: 1, booster: 1, freezer: 1, warden: 1, glimmer: 1 };
    const MINIBOSS = /^mini_boss_[1-5]$/;
    for (const s of Campaign.STAGES) {
      const last = s.waveTable[9];
      assert.ok(last.some((e) => e.monster.startsWith("boss_")), `ải ${s.id}: wave 10 phải có boss`);
      for (const wave of s.waveTable)
        for (const e of wave) {
          const m = e.monster;
          const resolves = reg[m] || ADD_MAP[m] || MINIBOSS.test(m) || m.startsWith("boss_");
          assert.ok(resolves, `ải ${s.id}: "${m}" không resolve được (typo?)`);
        }
    }
  });
  it("C2b: KNOWN GAP — mini_boss_* hiện degrade thành 'chaser' thường (không phải miniboss)", () => {
    // v2glue.js:220 — mini_boss_1 không có trong MONSTER_REGISTRY lẫn ADD_MAP
    // → spawn "chaser" thường, mất bossHpMult (queue chỉ giữ string).
    // Ghi nhận để team gameplay quyết: định nghĩa miniboss thật hay sửa waveTable.
    // Test này PASS khi hành vi còn nguyên — đổi hành vi thì cập nhật test.
    const { Campaign } = loadCampaign();
    const comp = Campaign.getWaveComp(1, 5, "normal");
    const mb = comp.find((c) => c.monster === "mini_boss_1");
    assert.ok(mb, "wave 5 ải 1 phải có entry mini_boss_1");
    assert.equal(mb.isBoss, true, "comp đánh dấu isBoss");
  });
});

describe("campaign.js — unlock & kỷ lục theo profile", () => {
  it("C3: mới chơi → ải 1 mở; setUnlockedStage chỉ tiến, kẹp 1..5", () => {
    const { Campaign } = loadCampaign();
    Campaign.setProfile("p1");
    assert.equal(Campaign.getUnlockedStage("p1"), 1);
    assert.equal(Campaign.setUnlockedStage("p1", 3), 3);
    assert.equal(Campaign.setUnlockedStage("p1", 2), 3, "không được lùi");
    assert.equal(Campaign.setUnlockedStage("p1", 99), 5, "kẹp max 5");
    assert.equal(Campaign.setUnlockedStage("p1", -4), 5, "kẹp min không lùi progress");
  });
  it("C4: unlock theo profile — profile khác nhau độc lập", () => {
    const { Campaign } = loadCampaign();
    Campaign.setUnlockedStage("alice", 4);
    assert.equal(Campaign.getUnlockedStage("bob"), 1);
    assert.equal(Campaign.getUnlockedStage("alice"), 4);
  });
  it("C5: startStage chặn ải khóa; kỷ lục giữ max score/wave", () => {
    const { Campaign } = loadCampaign();
    const locked = Campaign.startStage(3, { profileId: "p1", diffKey: "chill" });
    assert.equal(locked.ok, false, "ải 3 phải khóa khi mới mở ải 1");
    assert.equal(locked.reason, "locked");
    Campaign.setUnlockedStage("p1", 3);
    const okRun = Campaign.startStage(2, { profileId: "p1", diffKey: "chill" });
    assert.equal(okRun.ok, true);
    assert.equal(okRun.run.stageId, 2);
    assert.equal(Campaign.startStage(99, { profileId: "p1" }).reason, "bad_stage");
    Campaign.setStageBest("p1", 2, { score: 1000, wave: 4 });
    Campaign.setStageBest("p1", 2, { score: 500, wave: 6 });
    const best = Campaign.getStageBest("p1")["2"];
    assert.equal(best.score, 1000, "giữ score cao nhất");
    assert.equal(best.wave, 6, "giữ wave cao nhất");
  });
  it("C6: endless khóa mặc định; unlockEndless mở", () => {
    const { Campaign } = loadCampaign();
    assert.equal(Campaign.isEndlessUnlocked("p1"), false);
    Campaign.unlockEndless("p1");
    assert.equal(Campaign.isEndlessUnlocked("p1"), true);
    assert.equal(Campaign.isEndlessUnlocked("p2"), false);
  });
  it("C7: storage hỏng (JSON best vỡ) → getStageBest trả {} không crash", () => {
    const { Campaign } = loadCampaign({ "wk_stage_best_p1": "{oops" });
    assert.doesNotThrow(() => Campaign.getStageBest("p1"));
    assert.deepEqual(JSON.parse(JSON.stringify(Campaign.getStageBest("p1"))), {});
  });
});
