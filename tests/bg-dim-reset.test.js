/* WINDOWKILL — regression test cho bug "lớp xám #2" 2026-10-03 (BG.dim kẹt).
 *
 * Root cause: boss spawn gọi BG.setDim(0.45) (lớp đen alpha 0.45 phủ toàn
 * canvas, js/game.js). Cơ chế tắt DUY NHẤT là killBoss() → setDim(0).
 * Player CHẾT GIỮA BOSS → die() và resetGame() đều không reset dim →
 * run mới bắt đầu với dimT = 0.45 kẹt vĩnh viễn → màn tối/xám đều
 * (cộng vignette 0.50 + dim tâm 0.10 càng nặng).
 *
 * Fix: resetGame() gọi BG.setDim(0). Vì resetGame nằm trong IIFE của game.js
 * (không gọi được từ test), test này verify ở mức source: body của
 * resetGame() phải chứa lời gọi BG.setDim(0).
 *
 * Kèm: sw.js VERSION phải là v7 — ép Service Worker (stale-while-revalidate)
 * bỏ cache JS cũ sau deploy, nếu không user vẫn chạy code cũ và tưởng
 * "fix không có tác dụng".
 *
 * Chạy: node --test tests/bg-dim-reset.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/* Trích body của `function name(...) { ... }` bằng brace-matching. */
function extractFnBody(src, name) {
  const m = src.match(new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{"));
  assert.ok(m, `không tìm thấy function ${name} trong source`);
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  assert.ok(depth === 0, `brace mismatch khi trích ${name}`);
  return src.slice(m.index + m[0].length, i - 1);
}

describe("bg-dim-reset (bug lớp xám #2, 2026-10-03)", () => {
  it("resetGame() phải gọi BG.setDim(0) — không để dim boss kẹt sang run mới", () => {
    const src = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
    const body = extractFnBody(src, "resetGame");
    assert.ok(
      /BG\.setDim\(\s*0\s*\)/.test(body),
      "resetGame() thiếu BG.setDim(0): chết giữa boss → dim 0.45 kẹt sang run mới → màn xám!"
    );
  });

  it("die() hoặc resetGame() phải dọn dim — không đường nào để dim kẹt sau game-over", () => {
    const src = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
    const dieBody = extractFnBody(src, "die");
    const resetBody = extractFnBody(src, "resetGame");
    const cleaned = /setDim\(\s*0\s*\)/.test(dieBody) || /setDim\(\s*0\s*\)/.test(resetBody);
    assert.ok(cleaned, "cả die() và resetGame() đều không reset BG dim");
  });

  it("sw.js VERSION phải là v7 — ép client bỏ cache JS cũ (stale-while-revalidate)", () => {
    const src = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    assert.ok(
      /const VERSION = "windowkill-v7"/.test(src),
      'sw.js VERSION phải là "windowkill-v7" để Service Worker cài cache mới sau deploy'
    );
  });
});
