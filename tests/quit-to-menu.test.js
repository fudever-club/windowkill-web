/* WINDOWKILL — quitToMenu về launcher (fix 2026-10-05).
 *
 * Bối cảnh: user báo nút home ("Về menu", data-act="quit" trong radial mobile
 * + btn-quit/btn-quit2) bị LIỆT trên mobile. Root cause: quitToMenu() gọi
 * window.close() — browser chỉ cho script đóng tab do chính nó mở (window.open),
 * tab thường bấm không có tác dụng gì → nút chết lâm sàng.
 * Fix: "Về menu" phải điều hướng về launcher (index.html), không đóng tab.
 *
 * Test verify: trích quitToMenu() thật từ js/game.js (cân bằng ngoặc như
 * glue-gun/shipper test), chạy với location mock → location.href === "index.html",
 * và KHÔNG gọi window.close().
 *
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

describe("quitToMenu — về launcher thay vì window.close()", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const fnSrc = extractQuitToMenu(src);

  function runWithMocks() {
    const calls = { closed: 0 };
    const location = {};
    const sandbox = {
      location,
      window: { close: () => { calls.closed++; } },
    };
    vm.createContext(sandbox);
    vm.runInContext(fnSrc + "\nquitToMenu();", sandbox);
    return { calls, location };
  }

  it("điều hướng về index.html (launcher)", () => {
    const { location } = runWithMocks();
    assert.equal(location.href, "index.html");
  });

  it("KHÔNG gọi window.close() (nguyên nhân nút liệt trên mobile)", () => {
    const { calls } = runWithMocks();
    assert.equal(calls.closed, 0);
  });

  it("source không còn chứa window.close trong quitToMenu", () => {
    assert.ok(!/window\.close/.test(fnSrc), "quitToMenu vẫn còn window.close()");
  });
});
