/* WINDOWKILL — campaign removal regression (RFC ui-audit-boss-cleanup §7.4.1).
 *
 * Campaign frame đã xóa triệt để:
 *  - 4 file js/campaign.js, js/stagefx.js, js/stageobj.js, js/stagemech.js không tồn tại;
 *  - typeof Campaign/StageFX/StageObj/StageMech === "undefined";
 *  - v2glue boot bỏ qua ?stage=3/?endless=1/?daily=1 → endless (mode=null, stageId=0);
 *  - cleanupLegacyCampaignKeys (menu.js) xóa đúng 4 họ key, giữ key lạ + kỷ lục endless.
 *
 * Chạy: node --test tests/campaign-removal.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

describe("campaign files đã xóa", () => {
  for (const f of ["js/campaign.js", "js/stagefx.js", "js/stageobj.js", "js/stagemech.js",
                   "tests/campaign-logic.test.js", "tests/stage-mechanics.test.js",
                   "tests/stage-objectives.test.js", "tests/stage-ritual.test.js"]) {
    it(`${f} không tồn tại`, () => {
      assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} vẫn còn`);
    });
  }
  it("không còn script tag nào trỏ 4 file trên (index.html/game.html)", () => {
    for (const h of ["index.html", "game.html"]) {
      const html = fs.readFileSync(path.join(ROOT, h), "utf8");
      for (const f of ["campaign.js", "stagefx.js", "stageobj.js", "stagemech.js"]) {
        assert.ok(!html.includes(`src="js/${f}"`), `${h} còn script tag ${f}`);
      }
    }
  });
});

describe("không còn reference Campaign/Stage* trong code", () => {
  const SRC = ["js/menu.js", "js/v2glue.js", "index.html", "game.html"]
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  const gameSrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  it("menu/v2glue/html: 0 reference Campaign.* (ngoại trừ cleanupLegacyCampaignKeys comment)", () => {
    const hits = SRC.split("\n").filter((l) => /Campaign\.\w/.test(l));
    assert.deepEqual(hits, [], `còn reference Campaign: ${JSON.stringify(hits)}`);
  });
  it("bundle game.js: 0 StageFX/StageObj/StageMech/stageWave/getUnlockedStage/V2.stageId", () => {
    for (const pat of ["StageFX", "StageObj", "StageMech", "stageWave", "getUnlockedStage",
                       "getStageBest", "V2.stageId", "bossSplitCheck", "bossfrag"]) {
      assert.ok(!gameSrc.includes(pat), `bundle còn chứa "${pat}"`);
    }
  });
  it("menu/v2glue: 0 param ?stage=/?daily=/?endless=", () => {
    for (const pat of ['q.get("stage")', 'q.get("daily")', 'q.get("endless")',
                       'q.set("stage"', 'q.set("daily"', 'q.set("endless"']) {
      assert.ok(!SRC.includes(pat), `còn param "${pat}"`);
    }
  });
});

describe("v2glue boot bỏ qua ?stage=3/?endless=1/?daily=1 → endless", () => {
  function bootV2(search) {
    const src = fs.readFileSync(path.join(ROOT, "js/v2glue.js"), "utf8");
    const sandbox = {
      console, URLSearchParams,
      location: { search },
      window: { Modes: { init() {} } },
    };
    sandbox.window.window = sandbox.window;
    sandbox.window.location = sandbox.location;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: "js/v2glue.js" });
    const V2 = sandbox.window.V2;
    assert.ok(V2, "v2glue phải export window.V2");
    V2.boot({ diffKey: "normal", profileId: "p1" });
    return V2;
  }
  it("?stage=3 → bỏ qua, V2.stageId=0, mode=null (không crash)", () => {
    const V2 = bootV2("?stage=3&diff=normal");
    assert.equal(V2.stageId, 0);
    assert.ok(V2.mode == null);
  });
  it("?endless=1&daily=1 → bỏ qua, endless (không crash)", () => {
    const V2 = bootV2("?endless=1&daily=1");
    assert.equal(V2.stageId, 0);
    assert.ok(V2.mode == null);
  });
  it("?mode=bossrush vẫn hợp lệ; ?mode=xxx → null", () => {
    assert.equal(bootV2("?mode=bossrush").mode, "bossrush");
    assert.ok(bootV2("?mode=xxx").mode == null);
  });
  it("typeof Campaign/StageFX/StageObj/StageMech === 'undefined' sau load", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/v2glue.js"), "utf8");
    const sandbox = { console, URLSearchParams, location: { search: "" }, window: {} };
    sandbox.window.location = sandbox.location;
    vm.createContext(sandbox);
    vm.runInContext(src + "\nthis.__probe = [typeof Campaign, typeof StageFX, typeof StageObj, typeof StageMech].join(',');", sandbox);
    assert.equal(sandbox.__probe, "undefined,undefined,undefined,undefined");
  });
});

describe("cleanupLegacyCampaignKeys: xóa đúng 4 họ key, giữ key lạ", () => {
  function loadCleanup() {
    const src = fs.readFileSync(path.join(ROOT, "js/menu.js"), "utf8");
    const m = /function cleanupLegacyCampaignKeys\(\) \{[\s\S]*?\n  \}/.exec(src);
    assert.ok(m, "menu.js phải có cleanupLegacyCampaignKeys");
    const sandbox = { console, window: {}, document: undefined };
    // menu.js là script browser dài — chỉ eval hàm cleanup, không chạy cả file.
    vm.createContext(sandbox);
    vm.runInContext(m[0] + "\nthis.__cleanup = cleanupLegacyCampaignKeys;", sandbox);
    return sandbox.__cleanup;
  }
  it("xóa 4 prefix, giữ kỷ lục endless/profile/meta/key lạ", () => {
    const store = {
      "wk_unlocked_stage_default": "5",
      "wk_stage_best_p1": "{}",
      "wk_unlocked_endless_default": "1",
      "wk_stage_badges_p1": "{}",
      "wk_high_default": "[{\"score\": 999}]",   // kỷ lục endless — GIỮ
      "wk_settings": "{\"diff\":\"normal\"}",    // settings — GIỮ
      "wk_ta_high_normal_default": "{}",         // record time attack — GIỮ
      "some_other_key": "x",                     // key lạ — GIỮ
    };
    const localStorage = {
      length: 0,
      key(i) { return Object.keys(store)[i] || null; },
      removeItem(k) { delete store[k]; },
    };
    Object.defineProperty(localStorage, "length", { get: () => Object.keys(store).length });
    const cleanup = loadCleanup();
    const sandbox = vm.createContext({ console, localStorage });
    vm.runInContext(`(${cleanup.toString()})()`, sandbox);
    assert.deepEqual(Object.keys(store).sort(), [
      "some_other_key", "wk_high_default", "wk_settings", "wk_ta_high_normal_default",
    ]);
  });
  it("chịu được localStorage ném lỗi (không crash launcher)", () => {
    const cleanup = loadCleanup();
    const sandbox = vm.createContext({ console, localStorage: null });
    assert.doesNotThrow(() => vm.runInContext(`(${cleanup.toString()})()`, sandbox));
  });
});
