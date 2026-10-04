/* WINDOWKILL — test cho particle batching (perf batch 2, js/particles.js).
 *
 * Mục tiêu: gom hạt theo bucket (color + alpha lượng tử hóa 8 nấc), mỗi bucket
 * 1 Path2D → 1 fillStyle + 1 globalAlpha + 1 fill(), thay cho vòng cũ mỗi hạt
 * 1 fillStyle + 1 globalAlpha + 1 fillRect.
 *
 * Verify:
 *  1. bucketing đúng (cùng màu + cùng nấc alpha → cùng bucket)
 *  2. alpha lượng tử hóa 8 nấc, sai số < 1/8 nấc (thực tế ≤ 1/16 do làm tròn)
 *  3. số draw calls giảm mạnh (600 hạt → ≤ số bucket, thực tế < 40)
 *  4. mọi hạt visible vẫn được vẽ đủ (cùng tập rect, cùng màu từng bucket)
 *  5. hạt vô hình (hết hạn / alpha→0 / sz không hợp lệ) bị bỏ — vòng cũ vẽ
 *     chúng cũng vô hình (globalAlpha=0 / fillRect(NaN) đều no-op)
 *
 * Chạy: node --test tests/particle-batching.test.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

// Mock Path2D: chỉ ghi lại các rect được add (đủ để verify batching).
class MockPath2D {
  constructor() { this.rects = []; }
  rect(x, y, w, h) { this.rects.push([x, y, w, h]); }
}

// Mock ctx: đếm state changes + draw calls, giữ lại path từng fill().
function mockCtx() {
  const calls = { fillStyle: [], globalAlpha: [], fill: 0, fillRect: 0 };
  const paths = [];
  const ctx = {
    _fs: "#000", _ga: 1,
    fill(path) { calls.fill++; paths.push(path); },
    fillRect() { calls.fillRect++; },
  };
  Object.defineProperty(ctx, "fillStyle", {
    get() { return this._fs; },
    set(v) { this._fs = v; calls.fillStyle.push(v); },
  });
  Object.defineProperty(ctx, "globalAlpha", {
    get() { return this._ga; },
    set(v) { this._ga = v; calls.globalAlpha.push(v); },
  });
  return { ctx, calls, paths };
}

function loadParticles() {
  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean,
    Map, Set, isFinite, parseInt, parseFloat,
    Path2D: MockPath2D,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/particles.js"), "utf8"),
    sandbox, { filename: "js/particles.js" });
  return sandbox.WKParticles;
}

// PRNG có seed để test deterministic.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ["#c084fc", "#8b2fc9", "#fff", "#38bdf8", "#ffffff", "#ff5a5a",
  "#ff5722", "#ff9800", "#ffd166", "#4caf50", "#8bc34a", "#ffd54f",
  "#ff5f8a", "#ff8fab", "#a5f3fc", "#f0abfc", "#ffffff88", "#ffffff66"];

function makeParts(n, seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const life = 0.4 + rnd() * 0.5; // giống burst(): life 0.4–0.9s
    parts.push({
      x: rnd() * 1280, y: rnd() * 800,
      vx: 0, vy: 0,
      t: rnd() * life * 0.999, // alpha trải đều (0, 1]
      life,
      c: PALETTE[(rnd() * PALETTE.length) | 0],
      sz: 2 + rnd() * 3.5,
    });
  }
  return parts;
}

// Vòng vẽ CŨ (verbatim logic từ game.js trước batching) — baseline để so sánh.
function drawOld(ctx, parts) {
  parts.forEach(p => {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c;
    ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
  });
  ctx.globalAlpha = 1;
}

function rectKey(r) { return r.map(v => v.toFixed(4)).join(","); }

describe("particle batching (js/particles.js)", () => {
  it("expose đúng API trên window.WKParticles", () => {
    const P = loadParticles();
    assert.equal(P.ALPHA_STEPS, 8);
    for (const f of ["alphaBucket", "bucketize", "bucketCount", "draw"])
      assert.equal(typeof P[f], "function", `thiếu ${f}`);
  });

  // helper test: tìm bucket theo màu trong kết quả bucketize()
  function byColor(buckets, c) {
    const b = buckets.find((x) => x.c === c);
    assert.ok(b, `thiếu bucket màu ${c}`);
    return b;
  }

  it("bucketing đúng: cùng màu + cùng nấc alpha → cùng bucket", () => {
    const P = loadParticles();
    const parts = [
      { x: 10, y: 10, t: 0, life: 1, c: "#ff0000", sz: 4 },
      { x: 20, y: 20, t: 0, life: 1, c: "#ff0000", sz: 4 }, // cùng màu, cùng alpha=1
      { x: 30, y: 30, t: 0, life: 1, c: "#00ff00", sz: 4 }, // khác màu
      { x: 40, y: 40, t: 0.5, life: 1, c: "#ff0000", sz: 4 }, // cùng màu, khác alpha
    ];
    const buckets = P.bucketize(parts);
    assert.equal(P.bucketCount(buckets), 3, `mong 3 bucket, thực tế ${P.bucketCount(buckets)}`);
    const red = byColor(buckets, "#ff0000");
    assert.ok(red.paths[8], "thiếu nấc alpha 8 của #ff0000");
    assert.ok(red.paths[4], "thiếu nấc alpha 4 của #ff0000");
    assert.equal(red.paths[8].rects.length, 2, "2 hạt đỏ alpha=1 phải chung 1 Path2D");
    assert.ok(byColor(buckets, "#00ff00").paths[8], "thiếu nấc alpha 8 của #00ff00");
  });

  it("alpha lượng tử hóa 8 nấc, sai số < 1/8 (làm tròn → ≤ 1/16)", () => {
    const P = loadParticles();
    for (let i = 0; i <= 200; i++) {
      const exact = i / 200; // alpha thật trong [0, 1]
      const p = { x: 0, y: 0, t: (1 - exact) * 10, life: 10, c: "#fff", sz: 3 };
      const b = P.alphaBucket(p);
      if (exact < 1 / 16) { assert.equal(b, -1, `alpha=${exact} (< 1/16) làm tròn về 0 → bỏ`); continue; }
      assert.ok(b >= 1 && b <= 8, `nấc ${b} ngoài 1..8`);
      const err = Math.abs(b / 8 - exact);
      assert.ok(err <= 1 / 16 + 1e-9, `alpha ${exact}: nấc ${b}/8, sai số ${err} > 1/16`);
    }
  });

  it("hạt hết hạn / alpha→0 bị bỏ (vòng cũ vẽ cũng vô hình)", () => {
    const P = loadParticles();
    assert.equal(P.alphaBucket({ t: 1, life: 1, c: "#fff", sz: 3 }), -1, "t=life → bỏ");
    assert.equal(P.alphaBucket({ t: 2, life: 1, c: "#fff", sz: 3 }), -1, "t>life → bỏ");
    assert.equal(P.alphaBucket({ t: 0.99, life: 1, c: "#fff", sz: 3 }), -1,
      "alpha=0.01 (< 1/16) làm tròn về 0 → bỏ");
    const buckets = P.bucketize([
      { x: 1, y: 1, t: 5, life: 1, c: "#fff", sz: 3 }, // chết
      { x: 2, y: 2, t: 0, life: 1, c: "#fff", sz: 3 }, // sống
    ]);
    assert.equal(P.bucketCount(buckets), 1);
    assert.equal(byColor(buckets, "#fff").paths[8].rects.length, 1);
  });

  it("hạt sz không hợp lệ (vd: hạt giấy boss w10 thiếu sz) bị bỏ — vòng cũ fillRect(NaN) cũng no-op", () => {
    const P = loadParticles();
    const buckets = P.bucketize([
      { x: 10, y: 10, t: 0, life: 1.2, c: "#ffd166" }, // không có sz (game.js ~3303)
      { x: 20, y: 20, t: 0, life: 1, c: "#ffd166", sz: 4 },
    ]);
    assert.equal(P.bucketCount(buckets), 1);
    assert.equal(byColor(buckets, "#ffd166").paths[8].rects.length, 1);
  });

  it("draw: số fill() == số bucket, fillRect không bao giờ gọi", () => {
    const P = loadParticles();
    const parts = makeParts(600, 42);
    const { ctx, calls } = mockCtx();
    P.draw(ctx, parts);
    const nBuckets = P.bucketCount(P.bucketize(parts));
    const nColors = P.bucketize(parts).length;
    assert.equal(calls.fill, nBuckets, `fill() phải = số bucket (${nBuckets})`);
    assert.equal(calls.fillRect, 0, "không được gọi fillRect");
    assert.equal(calls.fillStyle.length, nColors, `1 fillStyle / màu (${nColors} màu)`);
    assert.equal(calls.globalAlpha.length, nBuckets, "1 globalAlpha / bucket");
    assert.ok(calls.fillStyle.length <= nBuckets, "số fillStyle không vượt số bucket");
    // 18 màu × 8 nấc alpha = tối đa 144 bucket (seed này phủ hết 18 màu)
    assert.ok(nBuckets <= 18 * 8, `${nBuckets} bucket vượt tối đa lý thuyết ${18 * 8}`);
    assert.ok(nBuckets <= 600 / 3, `bucket (${nBuckets}) phải ≤ 1/3 số hạt (600)`);
  });

  it("mọi hạt visible đều được vẽ đủ: cùng tập rect, đúng màu từng bucket", () => {
    const P = loadParticles();
    const parts = makeParts(600, 7);
    const { ctx, paths } = mockCtx();
    P.draw(ctx, parts);
    // gom rect từ mọi bucket → so multiset với rect vòng cũ sẽ vẽ
    const batched = [];
    const bucketOf = new Map(); // rectKey → bucket màu
    for (const b of P.bucketize(parts))
      for (let ab = 1; ab <= P.ALPHA_STEPS; ab++) {
        const path = b.paths[ab];
        if (!path) continue;
        for (const r of path.rects) { batched.push(rectKey(r)); bucketOf.set(rectKey(r), b.c); }
      }
    const expected = [];
    const colorOf = new Map();
    for (const p of parts) {
      if (!(p.sz > 0) || !isFinite(p.x) || !isFinite(p.y)) continue;
      const a = 1 - p.t / p.life;
      if (!(a > 0) || Math.round(Math.min(1, a) * 8) <= 0) continue;
      const r = [p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz];
      expected.push(rectKey(r)); colorOf.set(rectKey(r), p.c);
    }
    assert.deepEqual(batched.sort(), expected.sort(),
      "tập rect batch phải khớp vòng cũ (thứ tự bucket có thể khác)");
    for (const [k, c] of bucketOf)
      assert.equal(c, colorOf.get(k), `bucket màu ${c} chứa rect của ${colorOf.get(k)}`);
  });

  it("giảm draw calls vs vòng cũ trên cùng dữ liệu", () => {
    const P = loadParticles();
    const parts = makeParts(600, 99);
    const mOld = mockCtx(), mNew = mockCtx();
    drawOld(mOld.ctx, parts);
    P.draw(mNew.ctx, parts);
    const oldOps = mOld.calls.fillRect + mOld.calls.fillStyle.length + mOld.calls.globalAlpha.length;
    const newOps = mNew.calls.fill + mNew.calls.fillStyle.length + mNew.calls.globalAlpha.length;
    assert.equal(mOld.calls.fillRect, 600, "vòng cũ: 600 fillRect");
    assert.equal(mOld.calls.fillStyle.length, 600, "vòng cũ: 600 fillStyle");
    assert.ok(mNew.calls.fillRect === 0, "vòng mới không gọi fillRect");
    // draw calls thực sự (fill vs fillRect): giảm ≥ 3x
    assert.ok(mNew.calls.fill <= mOld.calls.fillRect / 3,
      `fill() mới (${mNew.calls.fill}) phải ≤ 1/3 fillRect cũ (${mOld.calls.fillRect})`);
    // tổng canvas ops (state change + draw): ít nhất giảm một nửa
    assert.ok(newOps <= oldOps / 2,
      `ops mới (${newOps}) phải ≤ 1/2 ops cũ (${oldOps})`);
  });

  it("globalAlpha mỗi bucket là nấc k/8 nguyên (k=1..8)", () => {
    const P = loadParticles();
    const { ctx, calls } = mockCtx();
    P.draw(ctx, makeParts(300, 5));
    for (const a of calls.globalAlpha) {
      const k = Math.round(a * 8);
      assert.ok(k >= 1 && k <= 8, `alpha ${a} không phải nấc k/8`);
      assert.ok(Math.abs(a - k / 8) < 1e-9, `alpha ${a} ≠ ${k}/8`);
    }
  });

  it("draw([]) không gọi gì — không tốn draw call khi hết hạt", () => {
    const P = loadParticles();
    const { ctx, calls } = mockCtx();
    P.draw(ctx, []);
    P.draw(ctx, null);
    assert.deepEqual(calls, { fillStyle: [], globalAlpha: [], fill: 0, fillRect: 0 });
  });

  it("game.js dùng WKParticles.draw thay vòng forEach cũ (có fallback)", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
    const callSite = src.indexOf("window.WKParticles.draw(ctx, G.parts)");
    assert.ok(callSite !== -1, "game.js phải gọi WKParticles.draw(ctx, G.parts)");
    // vòng forEach cũ chỉ được tồn tại trong nhánh fallback `else` sau call site
    const forEachIdx = src.indexOf("G.parts.forEach", callSite);
    assert.ok(forEachIdx !== -1, "fallback G.parts.forEach phải tồn tại");
    const between = src.slice(callSite, forEachIdx);
    assert.ok(/\belse\b/.test(between),
      "vòng G.parts.forEach cũ chỉ được giữ trong nhánh else fallback");
    assert.ok(/if\s*\(\s*window\.WKParticles\s*\)/.test(src.slice(Math.max(0, callSite - 60), callSite)),
      "nhánh chính phải là if (window.WKParticles)");
  });

  it("game.html load particles.js trước game.js; sw.js precache nó", () => {
    const html = fs.readFileSync(path.join(ROOT, "game.html"), "utf8");
    const iP = html.indexOf('src="js/particles.js"');
    const iG = html.indexOf('src="js/game.js"');
    assert.ok(iP !== -1, "game.html thiếu script js/particles.js");
    assert.ok(iP < iG, "particles.js phải load trước game.js");
    const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    assert.ok(sw.includes('"js/particles.js"'), "sw.js CORE_ASSETS thiếu js/particles.js");
  });
});
