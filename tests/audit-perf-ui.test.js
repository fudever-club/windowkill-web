/* WINDOWKILL — fix/audit-batch-1: quick-win perf + P2 UI.
 *
 * PERF #3: HP bar từng O(maxHp) drawImage/frame (game.js) → cap 12 icon + "+N".
 * PERF #1 quick-win: particle không cap (wave 30 ~770 hạt, ~800 fillRect/frame)
 *   → addPart() cap MAX_PARTICLES=600 tại mọi điểm spawn.
 * P2: 2 nút install <44px → min-height/min-width 44px.
 *
 * Chạy: node --test tests/audit-perf-ui.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("PERF #3 — HP bar không còn O(maxHp) drawImage", () => {
  const src = read("js/game.js");
  it("có HP_ICON_CAP = 12", () => {
    assert.match(src, /const HP_ICON_CAP = 12/);
  });
  it("vòng vẽ tim bị chặn bởi heartsDrawn, không phải s.maxHp", () => {
    assert.match(src, /for \(let i = 0; i < heartsDrawn; i\+\+\)/);
    assert.ok(!/for \(let i = 0; i < s\.maxHp; i\+\+\)/.test(src), "còn vòng O(maxHp)");
  });
  it("phần HP vượt cap gọn thành \"+N\"", () => {
    assert.match(src, /heartsExtra = s\.maxHp - heartsDrawn/);
    assert.match(src, /"\+" \+ heartsExtra/);
  });
  it("độ rộng pill tính đúng cả khi có +N (không vỡ layout)", () => {
    assert.match(src, /heartsW \+= 6 \+ ctx\.measureText\("\+" \+ heartsExtra\)\.width/);
  });
});

describe("PERF #1 quick-win — particle cap", () => {
  const src = read("js/game.js");
  it("có MAX_PARTICLES = 600 + addPart() guard", () => {
    assert.match(src, /var MAX_PARTICLES = 600/);
    assert.match(src, /function addPart\(p\) \{ if \(G\.parts\.length < MAX_PARTICLES\) G\.parts\.push\(p\); \}/);
  });
  it("mọi điểm spawn hạt đi qua addPart (không còn G.parts.push trực tiếp)", () => {
    const direct = src.split("\n").filter((l) => /G\.parts\.push\(/.test(l) && !/function addPart/.test(l));
    assert.deepEqual(direct, [], `còn G.parts.push trực tiếp — lọt cap: ${direct.join(" | ")}`);
    assert.ok((src.match(/addPart\(\{/g) || []).length >= 7, "thiếu điểm spawn qua addPart");
  });
});

describe("P2 — nút install đạt touch target ≥44px", () => {
  const html = read("index.html");
  it("#btn-install (.btn-install) min-height 44px", () => {
    const m = html.match(/\.btn-install \{[^}]*\}/);
    assert.ok(m, "thiếu rule .btn-install");
    assert.match(m[0], /min-height:\s*44px/);
  });
  it("#btn-install-dismiss (.install-dismiss) min 44×44px", () => {
    const m = html.match(/\.install-dismiss \{[^}]*\}/);
    assert.ok(m, "thiếu rule .install-dismiss");
    assert.match(m[0], /min-width:\s*44px/);
    assert.match(m[0], /min-height:\s*44px/);
  });
});
