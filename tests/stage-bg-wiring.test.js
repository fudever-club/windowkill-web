/* WINDOWKILL — theme BG random mỗi run (RFC ui-audit-boss-cleanup §3.6).
 *
 * Campaign đã xóa: bgStageSid() không còn đọc V2.stageId — đọc G.themeSid
 * (resetGame() set random 1-5 mỗi run, giữ palette art PR #79).
 * themeSid invalid → fallback ACTS bgStage (giữ behavior endless cũ);
 * BG undefined → refreshBG không ném lỗi.
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
  return [...inner.matchAll(/bgStage\s*:\s*(\d+)/g)].map((x) => ({ bgStage: +x[1] }));
}

const FNS = ["bgStageSid", "refreshBG"].map((n) => extractFunction(gameSrc, n)).join("\n");
const REAL_ACTS = extractActs(gameSrc);
assert.deepEqual(REAL_ACTS.map((a) => a.bgStage), [1, 3, 2],
  "ACTS.bgStage đổi → cập nhật kỳ vọng trong test");

function makeCtx(opts = {}) {
  const { hasBG = true, act = 1 } = opts;
  const themeSid = Object.prototype.hasOwnProperty.call(opts, "themeSid") ? opts.themeSid : undefined;
  const calls = [];
  const G = { act };
  if (themeSid !== undefined) G.themeSid = themeSid;
  const ctx = {
    window: { innerWidth: 1280, innerHeight: 720, G },
    ACTS: REAL_ACTS,
    G,
  };
  if (hasBG) ctx.BG = { build: (sid, w, h) => calls.push({ sid, w, h }) };
  vm.createContext(ctx);
  vm.runInContext(FNS, ctx);
  return { ctx, calls };
}

describe("theme BG random mỗi run (§3.6)", () => {
  it("(a) G.themeSid 1..5 → BG.build nhận đúng sid", () => {
    for (let st = 1; st <= 5; st++) {
      const { ctx, calls } = makeCtx({ themeSid: st });
      vm.runInContext("refreshBG()", ctx);
      assert.equal(calls.length, 1, `theme ${st}: phải gọi BG.build đúng 1 lần`);
      assert.equal(calls[0].sid, st, `theme ${st}: sid phải = ${st}`);
      assert.equal(calls[0].w, 1280, "giữ nguyên chiều rộng CSS px");
      assert.equal(calls[0].h, 720, "giữ nguyên chiều cao CSS px");
    }
  });

  it("(b) themeSid invalid → fallback ACTS bgStage", () => {
    const { ctx: c1, calls: k1 } = makeCtx({ themeSid: 99, act: 2 });
    vm.runInContext("refreshBG()", c1);
    assert.equal(k1[0].sid, 3, "act 2 → ACTS[1].bgStage = 3");
    const { ctx: c2, calls: k2 } = makeCtx({ themeSid: undefined, act: 3 });
    vm.runInContext("refreshBG()", c2);
    assert.equal(k2[0].sid, 2, "act 3 → ACTS[2].bgStage = 2");
    for (const bad of [-1, "3", NaN, null]) {
      const { ctx, calls } = makeCtx({ themeSid: bad, act: 1 });
      vm.runInContext("refreshBG()", ctx);
      assert.equal(calls[0].sid, 1, `themeSid=${String(bad)}: sid phải fallback 1`);
    }
  });

  it("(c) không còn đọc V2.stageId", () => {
    assert.ok(!gameSrc.includes("V2.stageId"), "bundle không được chứa V2.stageId");
    const { ctx } = makeCtx({ themeSid: 4 });
    const sid = vm.runInContext("bgStageSid()", ctx);
    assert.equal(sid, 4);
  });

  it("(d) BG undefined → refreshBG không ném lỗi", () => {
    const { ctx, calls } = makeCtx({ themeSid: 3, hasBG: false });
    assert.doesNotThrow(() => vm.runInContext("refreshBG()", ctx));
    assert.equal(calls.length, 0);
  });

  it("(e) resetGame set G.themeSid 1-5 (không lặp theme run trước)", () => {
    const resetFn = extractFunction(gameSrc, "resetGame");
    assert.match(resetFn, /G\.themeSid\s*=\s*1\s*\+\s*Math\.floor\(Math\.random\(\)\s*\*\s*5\)/,
      "resetGame phải set G.themeSid = 1 + floor(random*5)");
    assert.ok(resetFn.indexOf("G.themeSid") < resetFn.indexOf("refreshBG()"),
      "themeSid phải set TRƯỚC refreshBG() trong resetGame");
  });
});
