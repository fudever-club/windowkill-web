/* WINDOWKILL — regression test cho bug "tên lửa đơ điều khiển" 2026-10-03.
 *
 * Root cause: với sat=auto, game mở popup vệ tinh THẬT bằng window.open().
 * Popup cướp focus bàn phím của cửa sổ chính → keydown không về tới game →
 * tàu đứng yên trong khi quái vẫn di chuyển (game loop vẫn chạy).
 * User gặp đúng kịch bản này: "tab khác hiện lên, ấn lại vô game thì phím đơ".
 *
 * Fix (2-track, quyết định CEO 2026-10-03: web = mô phỏng):
 *  1. js/game.js: SAT_MODE trên web (non-Electron) chuẩn hóa "auto"/rỗng → "sim";
 *     Desktop Electron giữ nguyên (popup thật do app quản lý).
 *  2. js/menu.js: migrate setting đã lưu "auto" → "sim" (chỉ web).
 *  3. js/game.js: blur → xóa phím kẹt (nhả phím khi tab khác focus thì keyup
 *     không về tới game).
 *
 * Chạy: node --test tests/sat-focus-freeze.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

/* Đánh giá biểu thức SAT_MODE trong game.js với qp + userAgent giả lập. */
function evalSatMode(satParam, userAgent) {
  const src = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
  const m = src.match(/const IS_ELECTRON_APP[\s\S]*?const SAT_MODE =[\s\S]*?;/);
  assert.ok(m, "không tìm thấy khối IS_ELECTRON_APP/SAT_MODE trong js/game.js");
  const sb = {
    qp: { get: (k) => (k === "sat" ? satParam : null) },
    navigator: { userAgent },
  };
  vm.createContext(sb);
  // Bọc để lấy giá trị SAT_MODE ra ngoài
  const val = vm.runInContext(m[0] + "\nSAT_MODE;", sb);
  return val;
}

describe("sat-focus-freeze (bug tàu đơ 2026-10-03)", () => {
  it("web: sat=auto → sim (không popup thật cướp focus)", () => {
    assert.equal(evalSatMode("auto", "Mozilla/5.0 Chrome/120"), "sim");
  });

  it("web: thiếu param sat → sim", () => {
    assert.equal(evalSatMode(null, "Mozilla/5.0 Chrome/120"), "sim");
  });

  it("web: sat=sim giữ sim, sat=off giữ off", () => {
    assert.equal(evalSatMode("sim", "Mozilla/5.0 Chrome/120"), "sim");
    assert.equal(evalSatMode("off", "Mozilla/5.0 Chrome/120"), "off");
  });

  it("desktop Electron: sat=auto giữ auto (popup thật do app quản lý)", () => {
    const ua = "Mozilla/5.0 Chrome/120 Electron/44.5.1 Safari/537.36";
    assert.equal(evalSatMode("auto", ua), "auto");
    assert.equal(evalSatMode(null, ua), "auto");
  });

  it("menu.js: migrate setting đã lưu auto → sim (chỉ web)", () => {
    const src = fs.readFileSync(path.join(ROOT, "js", "menu.js"), "utf8");
    const idx = src.indexOf('settings.sat === "auto"');
    assert.ok(idx > 0, "menu.js thiếu migration settings.sat auto → sim");
    const around = src.slice(Math.max(0, idx - 200), idx + 200);
    assert.ok(/settings\.sat = "sim"/.test(around), "migration phải gán settings.sat = \"sim\"");
    assert.ok(
      /Electron/.test(around),
      "migration phải loại trừ Electron"
    );
  });

  it("game.js: blur phải xóa phím kẹt", () => {
    const src = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
    const m = src.match(/window\.addEventListener\("blur", \(\) => \{[\s\S]*?\}\);/);
    assert.ok(m, "không tìm thấy blur handler");
    assert.ok(
      /for \(const k in keys\) keys\[k\] = false/.test(m[0]),
      "blur handler phải xóa phím kẹt"
    );
  });
});
