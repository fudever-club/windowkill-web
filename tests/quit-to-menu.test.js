/* WINDOWKILL — quitToMenu: popup về menu gốc, tab thường về launcher.
 *
 * Lịch sử:
 * - Fix 2026-10-05: user báo nút home ("Về menu") LIỆT trên mobile. Root cause:
 *   quitToMenu() gọi window.close() — browser chỉ cho script đóng tab do chính nó mở
 *   (window.open); tab thường bấm không có tác dụng → nút chết lâm sàng.
 *   Fix lúc đó: luôn location.href = "index.html".
 * - Fix 2026-10-17: user báo "về menu" DUPLICATE trang web + DUPLICATE nhạc nền.
 *   Root cause: game chạy trong popup do menu mở (window.open) — location.href="index.html"
 *   navigate CHÍNH popup sang index.html → 2 trang menu + BGM phát 2 nơi (opener resume
 *   ở pagehide + trang mới init). Fix: nếu có window.opener (popup) → focus opener +
 *   window.close(); chỉ fallback location.href khi không có opener hoặc close bị chặn.
 *
 * Test verify: trích quitToMenu() thật từ js/game.js (cân bằng ngoặc), chạy với mock.
 * Chạy: node --test tests/quit-to-menu.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

/* Trích function quitToMenu từ source game.js bằng cân bằng ngoặc */
function extractQuitToMenu(src) {
  const key = "function quitToMenu()";
  const start = src.indexOf(key);
  assert.ok(start >= 0, "không tìm thấy function quitToMenu trong js/game.js");
  let i = src.indexOf("{", start);
  assert.ok(i > start, "không tìm thấy thân hàm");
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error("ngoặc không cân bằng khi trích quitToMenu");
}

function runQuitToMenu({ opener } = {}) {
  const calls = { closed: 0 };
  const location = {};
  const timers = [];
  const win = {
    close: () => { calls.closed++; },
    closed: false,
  };
  if (opener !== undefined) {
    win.opener = opener;
  }
  const sandbox = {
    location,
    window: win,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
  };
  vm.createContext(sandbox);
  vm.runInContext(extractQuitToMenu(
    fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8")) + "\nquitToMenu();", sandbox);
  return { calls, location, timers, win };
}

describe("quitToMenu — popup vs tab thường", () => {
  it("tab thường (không opener): về index.html, KHÔNG gọi window.close()", () => {
    const { calls, location } = runQuitToMenu();
    assert.equal(location.href, "index.html");
    assert.equal(calls.closed, 0, "tab thường không được close (nguyên nhân nút liệt 2026-10-05)");
  });

  it("popup (có opener): focus opener + đóng popup, KHÔNG navigate", () => {
    let focused = 0;
    const opener = { closed: false, focus: () => { focused++; } };
    const { calls, location } = runQuitToMenu({ opener });
    assert.equal(focused, 1, "phải focus về menu gốc");
    assert.equal(calls.closed, 1, "phải đóng popup");
    assert.equal(location.href, undefined, "không được navigate popup sang index.html (gây duplicate)");
  });

  it("popup nhưng close bị chặn: fallback về index.html", () => {
    const opener = { closed: false, focus: () => {} };
    const { location, timers, win } = runQuitToMenu({ opener });
    assert.equal(timers.length, 1, "phải đặt fallback timer");
    win.closed = false; // giả lập close bị chặn
    timers[0]();
    assert.equal(location.href, "index.html", "fallback phải về launcher");
  });

  it("opener đã đóng: về index.html như tab thường", () => {
    const opener = { closed: true, focus: () => { throw new Error("không được gọi"); } };
    const { calls, location } = runQuitToMenu({ opener });
    assert.equal(location.href, "index.html");
    assert.equal(calls.closed, 0);
  });
});
