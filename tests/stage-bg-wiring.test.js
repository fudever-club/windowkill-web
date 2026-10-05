/* WINDOWKILL — Item 1 (stage BG wiring, 2026-10-05).
 *
 * Bối cảnh: refreshBG() trước đây chỉ đọc (ACTS[(G.act||1)-1]||{}).bgStage.
 * Ở campaign mode, G.act = actOf(n) với n là wave 1-10 TRONG ẢI → luôn = 1
 * → palette luôn = 1 (MÀN HÌNH XANH). Ải 2-5 không bao giờ hiện đúng palette.
 *
 * Fix: bgStageSid() ưu tiên window.V2.stageId (1-5) khi ở campaign mode;
 * endless (stageId = 0 / không có V2) giữ nguyên behavior ACTS cũ;
 * sid invalid → fallback 1.
 *
 * Test này verify:
 *  (a) mock V2.stageId 1..5 → BG.build nhận đúng sid 1..5 (kích thước giữ nguyên);
 *  (b) stageId = 0 (endless) → giữ ACTS behavior (act 2 → bgStage 3);
 *  (c) không có window.V2 → giữ ACTS behavior (act 3 → bgStage 2);
 *  (d) sid invalid (99, "3", NaN, undefined) → fallback 1 (G.act = 1);
 *  (e) BG undefined → refreshBG không ném lỗi, không gọi build.
 *
 * Chạy: node --test tests/stage-bg-wiring.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const gameSrc = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

function extractFunction(src, name) {
  const headRe = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = headRe.exec(src);
  assert.ok(m, `không tìm thấy function ${name} trong js/game.js`);
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `ngoặc mất cân bằng trong function ${name}`);
  return src.slice(m.index, i + 1);
}

/* Lấy ACTS thật từ game.js (tránh hardcode bgStage lệch với source). */
function extractActs(src) {
  const m = /const\s+ACTS\s*=\s*\[/.exec(src);
  assert.ok(m, "không tìm thấy const ACTS trong js/game.js");
  const open = src.indexOf("[", m.index);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, "ngoặc mất cân bằng trong const ACTS");
  const inner = src.slice(open + 1, i);
  // Chỉ lấy bgStage của từng act: { ..., bgStage: N, ... }.
  return [...inner.matchAll(/bgStage\s*:\s*(\d+)/g)].map((x) => ({ bgStage: +x[1] }));
}

const FNS = ["bgStageSid", "refreshBG"].map((n) => extractFunction(gameSrc, n)).join("\n");
const REAL_ACTS = extractActs(gameSrc);
assert.deepEqual(REAL_ACTS.map((a) => a.bgStage), [1, 3, 2],
  "ACTS.bgStage đổi → cập nhật kỳ vọng trong test");

function makeCtx(opts = {}) {
  const { hasV2 = true, hasBG = true, act = 1 } = opts;
  // hasOwnProperty để phân biệt "không truyền" (= 0, endless) với truyền undefined/null.
  const stageId = Object.prototype.hasOwnProperty.call(opts, "stageId") ? opts.stageId : 0;
  const calls = [];
  const ctx = {
    window: { innerWidth: 1280, innerHeight: 720 },
    ACTS: REAL_ACTS,
    G: { act },
  };
  if (hasV2) {
    const V2 = { stageId };
    ctx.V2 = V2;
    ctx.window.V2 = V2; // game.js đọc window.V2 và V2 (cùng object trong browser)
  }
  if (hasBG) ctx.BG = { build: (sid, w, h) => calls.push({ sid, w, h }) };
  vm.createContext(ctx);
  vm.runInContext(FNS, ctx);
  return { ctx, calls };
}

describe("stage BG wiring (Item 1)", () => {
  it("(a) stageId 1..5 → BG.build nhận đúng sid", () => {
    for (let st = 1; st <= 5; st++) {
      const { ctx, calls } = makeCtx({ stageId: st });
      vm.runInContext("refreshBG()", ctx);
      assert.equal(calls.length, 1, `stage ${st}: phải gọi BG.build đúng 1 lần`);
      assert.equal(calls[0].sid, st, `stage ${st}: sid phải = ${st}`);
      assert.equal(calls[0].w, 1280, "giữ nguyên chiều rộng CSS px");
      assert.equal(calls[0].h, 720, "giữ nguyên chiều cao CSS px");
    }
  });

  it("(b) stageId = 0 (endless) → giữ ACTS behavior", () => {
    const { ctx, calls } = makeCtx({ stageId: 0, act: 2 });
    vm.runInContext("refreshBG()", ctx);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sid, 3, "act 2 → ACTS[1].bgStage = 3");
  });

  it("(c) không có V2 → giữ ACTS behavior", () => {
    const { ctx, calls } = makeCtx({ hasV2: false, act: 3 });
    vm.runInContext("refreshBG()", ctx);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sid, 2, "act 3 → ACTS[2].bgStage = 2");
  });

  it("(d) sid invalid → fallback 1", () => {
    for (const bad of [99, -1, "3", NaN, undefined, null]) {
      const { ctx, calls } = makeCtx({ stageId: bad, act: 1 });
      vm.runInContext("refreshBG()", ctx);
      assert.equal(calls.length, 1, `stageId=${String(bad)}: phải gọi BG.build`);
      assert.equal(calls[0].sid, 1, `stageId=${String(bad)}: sid phải fallback 1`);
    }
  });

  it("(e) BG undefined → refreshBG không ném lỗi", () => {
    const { ctx, calls } = makeCtx({ stageId: 3, hasBG: false });
    assert.doesNotThrow(() => vm.runInContext("refreshBG()", ctx));
    assert.equal(calls.length, 0);
  });

  it("bgStageSid đọc window.V2 (không chỉ V2 toàn cục)", () => {
    // browser thật: game.js thấy window.V2; V2 toàn cục cũng cùng object.
    const { ctx } = makeCtx({ stageId: 4 });
    const sid = vm.runInContext("bgStageSid()", ctx);
    assert.equal(sid, 4);
  });
});
