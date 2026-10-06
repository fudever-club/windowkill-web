/* WINDOWKILL — cắt 12 → 8 upgrade (quyết định CEO 2026-10-06).
 * Mỗi upgrade còn lại phải đổi lối chơi thật; 4 món chỉ +chỉ số/kinh tế vô hình
 * (speed, bulletspeed, greed, luck) bị loại để giảm choice paralysis.
 * Chạy: node --test tests/upgrades-cut.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const CUT = ["speed", "bulletspeed", "greed", "luck"];
const KEPT = ["firerate", "streams", "damage", "hp", "pierce", "magnet", "thorns", "ice"];

function upsBlock() {
  const src = read("js/game/09-upgrades.js");
  const m = src.match(/const UPS = \[([\s\S]*?)\];/);
  assert.ok(m, "không tìm thấy const UPS trong 09-upgrades.js");
  return m[1];
}

describe("upgrades-cut — draft còn 8 món", () => {
  it("C1: UPS có đúng 8 món", () => {
    const entries = upsBlock().match(/\{ ico:/g) || [];
    assert.equal(entries.length, 8, `UPS có ${entries.length} món, kỳ vọng 8`);
  });
  it("C2: 4 món bị cắt không còn trong UPS", () => {
    const block = upsBlock();
    for (const k of CUT)
      assert.ok(!block.includes(`upg.${k}.name`), `UPS vẫn chứa upg.${k}`);
  });
  it("C3: 8 món giữ lại vẫn còn trong UPS", () => {
    const block = upsBlock();
    for (const k of KEPT)
      assert.ok(block.includes(`upg.${k}.name`), `UPS thiếu upg.${k}`);
  });
  it("C4: streams vẫn là món duy nhất có điều kiện can (cap 4 tia)", () => {
    const block = upsBlock();
    const cans = block.match(/can: s =>/g) || [];
    assert.equal(cans.length, 1, `kỳ vọng 1 điều kiện can, thấy ${cans.length}`);
  });
});

describe("upgrades-cut — i18n sạch key thừa", () => {
  it("C5: key của 4 món bị cắt đã gỡ khỏi js/i18n.js (VI+EN)", () => {
    const src = read("js/i18n.js");
    for (const k of CUT) {
      assert.ok(!src.includes(`"upg.${k}.name"`), `i18n còn key upg.${k}.name`);
      assert.ok(!src.includes(`"upg.${k}.desc"`), `i18n còn key upg.${k}.desc`);
    }
  });
  it("C6: 8 món giữ lại đủ key name+desc trong js/i18n.js", () => {
    const src = read("js/i18n.js");
    for (const k of KEPT) {
      assert.ok(src.includes(`"upg.${k}.name"`), `i18n thiếu upg.${k}.name`);
      assert.ok(src.includes(`"upg.${k}.desc"`), `i18n thiếu upg.${k}.desc`);
    }
  });
});

describe("upgrades-cut — draft vẫn chạy đúng", () => {
  it("C7: openDraft vẫn data-driven từ UPS (lọc can + bốc tối đa 3)", () => {
    const src = read("js/game/09-upgrades.js");
    assert.match(src, /UPS\.filter\(u => !u\.can \|\| u\.can\(G\.ship\)\)/);
    assert.match(src, /picks\.length < 3/);
  });
  it("C8: applyDraftPick + gainXp + noteUpgradeTaken còn nguyên", () => {
    const src = read("js/game/09-upgrades.js");
    assert.match(src, /function applyDraftPick\(u\)/);
    assert.match(src, /function gainXp\(n\)/);
    assert.match(src, /function noteUpgradeTaken\(key\)/);
  });
  it("C9: field mặc định (bulletSpd/dropMul) vẫn khởi tạo — logic combat cũ không crash", () => {
    const state = read("js/game/08-state.js");
    assert.match(state, /bulletSpd: 560/);
    assert.match(state, /dropMul: mods\.pickupMul \|\| 1/);
  });
});
