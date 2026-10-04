/* WINDOWKILL — gc-churn tests (node:test, không cần browser).
 * Kiểm tra các tối ưu giảm GC churn (perf batch 2, 2026-10-04):
 *  - compactInPlace: nén mảng tại chỗ, giữ đúng phần tử + thứ tự, không alloc mảng mới
 *  - floats: cache measureText (f._fw) + hoist font string
 *  - gradient cache: ship-body / danger-vignette / sat title-bar / bg danger-nebula
 *  - SatManager.values(): vòng lặp per-frame không spread [...sats.values()]
 * Chạy: node --test tests/gc-churn.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const GAME = read("js/game.js");
const BGSRC = read("js/bg.js");

/* Trích function declaration `function name(...) { ... }` bằng brace matching
 * (bỏ qua string/comment). Trả về source text của function. */
function extractFunction(src, name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(`));
  assert.ok(m, `không tìm thấy function ${name}`);
  let i = src.indexOf("{", m.index);
  assert.ok(i > 0, `${name}: không thấy {`);
  let depth = 0, inStr = null, esc = false, inLine = false, inBlock = false;
  const start = m.index;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  assert.fail(`${name}: brace không cân bằng`);
}

/* Eval 1 function + các const phụ thuộc trong sandbox, trả về sandbox. */
function loadFn(src, name, prelude = "") {
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(prelude + "\n" + extractFunction(src, name) + `\nthis.__fn = ${name};`, sb);
  return sb.__fn;
}

describe("compactInPlace — nén tại chỗ, giữ đúng phần tử", () => {
  const compact = loadFn(GAME, "compactInPlace");

  it("giữ đúng phần tử thỏa predicate, giữ thứ tự", () => {
    const arr = [
      { t: 0.1, life: 1 }, { t: 1.5, life: 1 }, { t: 0.2, life: 1 },
      { t: 2.0, life: 1 }, { t: 0.3, life: 1 },
    ];
    const out = compact(arr, (p) => p.t < p.life);
    assert.deepEqual(out.map((p) => p.t), [0.1, 0.2, 0.3]);
  });

  it("trả về đúng mảng cũ (in-place, không alloc mảng mới)", () => {
    const arr = [{ t: 0, life: 1 }, { t: 9, life: 1 }];
    const before = arr;
    const out = compact(arr, (p) => p.t < p.life);
    assert.equal(out, before, "phải trả về cùng identity");
    assert.equal(arr.length, 1);
    assert.equal(arr[0].t, 0);
  });

  it("mảng rỗng / xóa hết / giữ hết", () => {
    const e = [];
    assert.equal(compact(e, () => true), e);
    assert.equal(e.length, 0);
    const all = [{ t: 5, life: 1 }];
    compact(all, (p) => p.t < p.life);
    assert.equal(all.length, 0);
    const keep = [{ t: 0, life: 1 }, { t: 0, life: 2 }];
    compact(keep, (p) => p.t < p.life);
    assert.equal(keep.length, 2);
  });

  it("tương đương Array.filter về mặt ngữ nghĩa (so ngẫu nhiên)", () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let trial = 0; trial < 50; trial++) {
      const mk = () => ({ t: rnd() * 2, life: 1 });
      const a = Array.from({ length: 30 }, mk);
      const b = a.map((o) => ({ ...o }));
      const pred = (p) => p.t < p.life;
      const ref = b.filter(pred).map((p) => p.t);
      compact(a, pred);
      assert.deepEqual(a.map((p) => p.t), ref, `trial ${trial} lệch thứ tự/phần tử`);
    }
  });
});

describe("_gradGet — gradient cache hit", () => {
  // _gradGet là arrow function gán vào const + phụ thuộc _gradCache
  const m = GAME.match(/const _gradCache = new Map\(\);[\s\S]*?function _gradGet\(key, make\) \{[\s\S]*?\n\}/);
  assert.ok(m, "không tìm thấy _gradGet trong js/game.js");
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(
    m[0] + "\nthis.__g = _gradGet;",
    sb
  );
  const gradGet = sb.__g;

  it("cùng key trả về đúng object (cache hit), factory chỉ chạy 1 lần", () => {
    let calls = 0;
    const fake = (tag) => ({ tag });
    const g1 = gradGet("k1", () => { calls++; return fake("a"); });
    const g2 = gradGet("k1", () => { calls++; return fake("b"); });
    assert.equal(g1, g2);
    assert.equal(calls, 1);
    assert.equal(g1.tag, "a");
  });

  it("key khác nhau tạo gradient riêng", () => {
    const g1 = gradGet("ka", () => ({ id: 1 }));
    const g2 = gradGet("kb", () => ({ id: 2 }));
    assert.notEqual(g1, g2);
  });
});

describe("game.js — không còn alloc nóng đã biết", () => {
  it("parts/floats/cracks dùng compactInPlace, không còn .filter mỗi frame", () => {
    assert.ok(GAME.includes("compactInPlace(G.parts, _keepPart)"));
    assert.ok(GAME.includes("compactInPlace(G.floats, _keepFloat)"));
    assert.ok(GAME.includes("compactInPlace(G.cracks, _keepCrack)"));
    assert.ok(!GAME.includes("G.parts = G.parts.filter"), "vẫn còn filter parts");
    assert.ok(!GAME.includes("G.floats = G.floats.filter"), "vẫn còn filter floats");
    assert.ok(!GAME.includes("G.cracks = G.cracks.filter"), "vẫn còn filter cracks");
    // predicate hoist sẵn ở module scope (không alloc closure mỗi frame)
    for (const k of ["_keepPart", "_keepFloat", "_keepCrack", "_keepEnemy", "_keepZone"]) {
      assert.ok(GAME.includes(`const ${k} =`), `thiếu predicate hoist ${k}`);
    }
  });

  it("enemies/slowZones dùng compactInPlace", () => {
    assert.ok(GAME.includes("compactInPlace(G.enemies, _keepEnemy)"));
    assert.ok(GAME.includes("compactInPlace(G.slowZones, _keepZone)"));
    assert.ok(!GAME.includes("G.enemies = G.enemies.filter"), "vẫn còn filter enemies");
    assert.ok(!GAME.includes("G.slowZones = G.slowZones.filter"), "vẫn còn filter slowZones");
  });

  it("floats cache measureText (f._fw) + hoist font string", () => {
    assert.ok(GAME.includes("f._fw"), "thiếu cache f._fw");
    assert.ok(GAME.includes("_flFontBig"), "thiếu hoist font floats");
    // không còn nối chuỗi font trong forEach floats
    const m = GAME.match(/G\.floats\.forEach\(f => \{[\s\S]*?\n  \}\);/);
    assert.ok(m, "không tìm thấy vòng vẽ floats");
    assert.ok(!m[0].includes('"bold 19px " + HUDFONT'), "vẫn nối chuỗi font mỗi float");
  });

  it("gradient thân tàu + vignette + title-bar vệ tinh được cache", () => {
    assert.ok(GAME.includes('_gradGet("ship-body", _mkShipGrad)'), "thiếu cache gradient tàu");
    assert.ok(GAME.includes("let _dangerVg = null, _dangerVgKey"), "thiếu cache gradient vignette");
    assert.ok(GAME.includes('_gradGet("sat-tb|"'), "thiếu cache gradient title-bar");
    // vignette: nhịp đập qua globalAlpha thay vì stop màu động
    assert.ok(GAME.includes("ctx.globalAlpha = 0.18 + 0.22 * p;"), "vignette phải dùng globalAlpha cho nhịp đập");
  });

  it("banner cache measureText theo banner string", () => {
    assert.ok(GAME.includes("G._bwKey !== G.banner"), "thiếu cache width banner");
  });

  it("SatManager.values() tồn tại; vòng lặp per-frame không spread", () => {
    assert.ok(GAME.includes("const values = () => sats.values();"), "thiếu SatManager.values");
    assert.ok(GAME.includes("values, anyRole"), "values chưa export");
    const perFrameFors = (GAME.match(/for \(const \w+ of SatManager\.values\(\)\)/g) || []).length;
    assert.ok(perFrameFors >= 10, `kỳ vọng ≥10 vòng values(), thấy ${perFrameFors}`);
    assert.ok(!/for \(const \w+ of SatManager\.list\(\)\)/.test(GAME), "vẫn còn for-of SatManager.list()");
    assert.ok(GAME.includes("motherChickCount"), "thiếu motherChickCount");
    assert.ok(GAME.includes("motherChickCount(sat.id) < 2"), "updateMothers chưa dùng bản đếm");
  });
});

describe("bg.js — cache gradient danger-nebula", () => {
  it("dnebG/dnebKey pattern tồn tại, không createRadialGradient trần trong draw", () => {
    assert.ok(BGSRC.includes("let dnebG = null, dnebKey"), "thiếu state cache dneb");
    assert.ok(BGSRC.includes("dnebKey !== dk"), "thiếu so sánh key cache");
    const drawM = BGSRC.match(/function draw\(ctx, t\) \{[\s\S]*?\n  \}/);
    assert.ok(drawM, "không tìm thấy BG.draw");
    assert.ok(!drawM[0].includes("const g = ctx.createRadialGradient(x, y, 0, x, y, r);"),
      "draw vẫn tạo gradient danger mỗi frame");
  });
});
