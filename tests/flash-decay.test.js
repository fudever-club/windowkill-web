/* WINDOWKILL — regression test cho bug "lớp xám mờ phủ toàn màn hình" 2026-10-03.
 *
 * Root cause: js/juice2.js vẽ G.flash (trắng full-screen, alpha = G.flash) mỗi
 * frame qua drawOverlays() — nhưng hàm update() duy nhất decay G.flash (6/s)
 * KHÔNG BAO GIỜ được gọi: V2.frame() trong js/v2glue.js update Tutorial/Bosses/
 * StageFX mà quên Juice2.update(). Hậu quả: sau 1 lần lên cấp (onLevelUp →
 * flash(0.35)) hoặc giết boss/nuke, G.flash kẹt vĩnh viễn → cả canvas phủ một
 * lớp trắng mờ đều (user chụp màn hình: Wave 2, Lv 2, xám đều toàn viewport).
 * Kèm theo, rings/multikill/near-death/gameover-cine cũng đứng hình âm thầm.
 *
 * Test này mô phỏng G + Juice2 + V2 (v2glue thật), rồi:
 *  1. gọi V2.onLevelUp → G.flash phải > 0 (flash đã bật),
 *  2. bơm V2.frame(dt) 120 frames → G.flash phải decay về 0,
 *  3. nếu G.flash vẫn > 0 sau 2 giây game-time → FAIL (bug tái hiện).
 *
 * Chạy: node --test tests/flash-decay.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

function loadScript(sandbox, rel) {
  const code = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  vm.runInContext(code, sandbox, { filename: rel });
}

function makeSandbox() {
  const sandbox = {
    console,
    Math, JSON, Object, Array, Number, String, Boolean, Date, Error,
    setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => 0 },
    requestAnimationFrame: () => {},
    // juice2/v2glue đọc window.*
    window: {},
    document: { createElement: () => ({ getContext: () => null, style: {} }) },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // G game-state tối thiểu mà juice2/v2glue cần
  sandbox.window.G = {
    flash: 0, flashRed: 0, hitstop: 0,
    ship: { x: 400, y: 300 },
    enemies: [], gems: [],
    phase: "play",
  };
  sandbox.window.WK_Q = { flash: true }; // qFlashOn() → true
  return sandbox;
}

describe("flash-decay (bug lớp xám 2026-10-03)", () => {
  it("V2.frame() phải decay G.flash về 0 sau level-up flash", () => {
    const sb = makeSandbox();
    loadScript(sb, "js/juice2.js");
    assert.ok(sb.window.Juice2, "window.Juice2 phải tồn tại sau khi load juice2.js");
    // Mirror browser: window.X cũng là bare global X (v2glue dùng bare `Juice2`)
    sb.Juice2 = sb.window.Juice2;
    loadScript(sb, "js/v2glue.js");
    assert.ok(sb.window.V2, "window.V2 phải tồn tại sau khi load v2glue.js");
    sb.V2 = sb.window.V2;

    const { Juice2, V2 } = sb.window;

    // 1. Level up → flash bật (mô phỏng đúng bug report: user ở Lv 2)
    V2.onLevelUp(400, 300, 2);
    assert.ok(sb.window.G.flash > 0, "sau onLevelUp, G.flash phải > 0");
    const flashAfterLevelUp = sb.window.G.flash;

    // 2. Bơm 120 frames @60fps = 2s game-time (decay 6/s → 0.35 cần ~0.06s)
    for (let i = 0; i < 120; i++) V2.frame(1 / 60);

    // 3. Flash phải về 0 — nếu không, lớp xám kẹt vĩnh viễn (bug cũ)
    assert.equal(
      sb.window.G.flash, 0,
      `G.flash phải decay về 0 sau 2s, nhưng còn ${sb.window.G.flash} ` +
        `(flash ban đầu ${flashAfterLevelUp}) — bug lớp xám tái hiện!`
    );
  });

  it("Juice2.update trực tiếp cũng decay flashRed", () => {
    const sb = makeSandbox();
    loadScript(sb, "js/juice2.js");
    const { Juice2 } = sb.window;
    sb.window.G.flashRed = 0.8;
    for (let i = 0; i < 120; i++) Juice2.update(1 / 60);
    assert.equal(sb.window.G.flashRed, 0, "flashRed phải decay về 0");
  });
});
