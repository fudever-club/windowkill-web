/* WINDOWKILL — boss glass-shard removal regression (RFC ui-audit-boss-cleanup §7.4.2).
 *
 * M2 "boss vỡ kính" đã xóa triệt để (js/game/06-bossfrag.js DELETE):
 *  - typeof bossSplitCheck/fragmentBite/fragStep === "undefined";
 *  - killBoss() không reference "fragment";
 *  - SatManager ROLE_TB_TINT / drawSimContent không còn nhánh "fragment";
 *  - i18n sat.bossfrag_* đã xóa (0 key);
 *  - GIỮ LẠI: addCrack/updateCracks/drawCracks + G.cracks (M4 debris còn dùng),
 *    sfx.crack, shrinkWindow/growWindow, juice SHAPE_SHARD, Cinema.bossRingShatter.
 *
 * Chạy: node --test tests/bossfrag-removal.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
const i18nSrc = fs.readFileSync(path.join(ROOT, "js/i18n.js"), "utf8");

describe("boss glass-shard đã xóa triệt để", () => {
  it("js/game/06-bossfrag.js không tồn tại; MANIFEST không liệt kê", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "js/game/06-bossfrag.js")), "06-bossfrag.js vẫn còn");
    const man = fs.readFileSync(path.join(ROOT, "js/game/MANIFEST.txt"), "utf8");
    assert.ok(!man.includes("06-bossfrag.js"), "MANIFEST còn liệt kê 06-bossfrag.js");
  });
  it("bundle: 0 reference bossSplitCheck/fragmentBite/fragStep/\"fragment\"", () => {
    for (const pat of ["bossSplitCheck", "fragmentBite", "fragStep", "\"fragment\"", "'fragment'", "bossfrag"]) {
      assert.ok(!gameSrc.includes(pat), `bundle còn chứa ${pat}`);
    }
  });
  it("killBoss không reference fragment (không còn loop dọn mảnh)", () => {
    const m = /function killBoss\(\) \{[\s\S]*?\n\}/.exec(gameSrc);
    assert.ok(m, "không tìm thấy killBoss trong bundle");
    assert.ok(!m[0].includes("fragment"), "killBoss còn reference fragment");
    assert.ok(!m[0].includes("SatManager.kill"), "killBoss còn gọi SatManager.kill (M2 cleanup)");
  });
  it("ROLE_TB_TINT không còn entry fragment", () => {
    assert.ok(!/fragment\s*:\s*\[/.test(gameSrc), "ROLE_TB_TINT còn entry fragment");
  });
  it("i18n: 0 key sat.bossfrag_*", () => {
    assert.equal((i18nSrc.match(/sat\.bossfrag_/g) || []).length, 0, "i18n còn sat.bossfrag_*");
  });
  it("tests/boss-fragment.test.js đã xóa", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "tests/boss-fragment.test.js")));
  });
});

describe("GIỮ LẠI — không xóa nhầm (regression M4)", () => {
  it("addCrack/updateCracks/drawCracks còn (định nghĩa + caller + render)", () => {
    assert.ok(/function addCrack/.test(gameSrc), "thiếu function addCrack");
    assert.ok(/function updateCracks/.test(gameSrc), "thiếu function updateCracks");
    assert.ok(/function drawCracks/.test(gameSrc), "thiếu function drawCracks");
    assert.ok(/G\.cracks\s*=\s*\[\]/.test(gameSrc), "thiếu G.cracks reset");
  });
  it("sfx.crack, shrinkWindow/growWindow còn (bundle); SHAPE_SHARD, bossRingShatter còn (juice/cinema)", () => {
    assert.ok(gameSrc.includes("shrinkWindow"), "thiếu shrinkWindow");
    assert.ok(gameSrc.includes("growWindow"), "thiếu growWindow");
    const juiceSrc = fs.readFileSync(path.join(ROOT, "js/juice.js"), "utf8");
    const cinemaSrc = fs.readFileSync(path.join(ROOT, "js/cinema.js"), "utf8");
    assert.ok(juiceSrc.includes("SHAPE_SHARD"), "js/juice.js thiếu SHAPE_SHARD (particle chung)");
    assert.ok(cinemaSrc.includes("bossRingShatter"), "js/cinema.js thiếu bossRingShatter (celebration)");
  });
});
